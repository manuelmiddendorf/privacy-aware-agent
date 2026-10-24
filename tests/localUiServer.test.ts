import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import test from "node:test";
import { createLocalUiRequestHandler, type OfflineUiRunner } from "../src/localUiServer.js";

async function withServer(runner: OfflineUiRunner | undefined, run: (url: string) => Promise<void>): Promise<void> {
  const handler = createLocalUiRequestHandler(runner);
  const server: Server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const requestHeaders = (url: string) => ({ Origin: url, "Content-Type": "application/json" });
const post = (url: string, body: unknown) => fetch(`${url}/api/run`, { method: "POST", headers: requestHeaders(url), body: JSON.stringify(body) });
const getWithHost = (url: string, host: string) => new Promise<number>((resolve, reject) => {
  const request = httpRequest(url, { headers: { Host: host } }, (response) => {
    response.resume();
    response.on("end", () => resolve(response.statusCode ?? 0));
  });
  request.on("error", reject);
  request.end();
});
function heldPost(url: string, body: unknown) {
  const serialized = JSON.stringify(body);
  let finish!: () => void;
  const response = new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const request = httpRequest(`${url}/api/run`, {
      method: "POST",
      headers: requestHeaders(url),
    }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      incoming.on("end", () => resolve({
        status: incoming.statusCode ?? 0,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      }));
    });
    request.on("error", reject);
    request.write(serialized.slice(0, -1));
    finish = () => request.end(serialized.slice(-1));
  });
  return { response, finish: () => finish() };
}

test("local UI serves only its fixed assets with defensive headers", async () => {
  await withServer(undefined, async (url) => {
    const page = await fetch(`${url}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /MOCK_OFFLINE/);
    assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.equal(page.headers.get("access-control-allow-origin"), null);

    const script = await fetch(`${url}/app.js`);
    const javascript = await script.text();
    assert.equal(script.status, 200);
    assert.doesNotMatch(javascript, /innerHTML|OPENAI_API_KEY|\.env|\.local/);
    assert.equal([...javascript.matchAll(/fetch\(/g)].length, 1);
    assert.match(javascript, /fetch\("\/api\/run"/);

    assert.equal((await fetch(`${url}/.env.openai.local`)).status, 404);
    assert.equal((await fetch(`${url}/..%2f.local%2fopenai-live-demo-budget.json`)).status, 404);
  });
});

test("local boundary rejects foreign hosts, origins, methods, schemas and oversized bodies", async () => {
  await withServer(undefined, async (url) => {
    assert.equal(await getWithHost(`${url}/`, "example.test"), 403);
    assert.equal((await fetch(`${url}/api/run`, { method: "GET" })).status, 405);
    assert.equal((await fetch(`${url}/api/run`, { method: "POST", headers: { ...requestHeaders(url), Origin: "https://example.test" }, body: "{}" })).status, 403);
    assert.equal((await post(url, { task: "draft", text: "Synthetic note", sourceIds: [], extra: true })).status, 400);
    assert.equal((await post(url, { templateId: "unknown" })).status, 400);
    assert.equal((await post(url, { task: "draft", text: "x".repeat(13_000), sourceIds: [] })).status, 413);
  });
});

test("real offline pipeline supports free tasks, exact templates and neutral zero-call blocks", async () => {
  await withServer(undefined, async (url) => {
    const draft = await post(url, { task: "draft", text: "Write a general synthetic welcome note.", sourceIds: [] });
    assert.deepEqual(await draft.json(), { ok: true, message: "MOCK draft based on approved context: Write a general synthetic welcome note.", citations: [], provider: "MOCK_OFFLINE" });

    const summary = await post(url, { task: "summarize", text: "Arrange chairs and recycle paper.", sourceIds: [] });
    assert.match((await summary.json() as { message: string }).message, /^MOCK summary:/);

    const exact = await post(url, { templateId: "p01" });
    const exactBody = await exact.json() as { ok: boolean; citations: string[]; message: string };
    assert.equal(exactBody.ok, true);
    assert.deepEqual(exactBody.citations, ["meeting-preparation"]);
    assert.match(exactBody.message, /Link the relevant documents/);

    const unknownEvidence = await post(url, { task: "ask", text: "What binding notice period applies?", sourceIds: ["meeting-preparation"] });
    assert.deepEqual(await unknownEvidence.json(), { ok: false, message: "The selected synthetic source is not confirmed for this request.", citations: [] });

    const privateRequest = await post(url, { task: "draft", text: "A child has a fever.", sourceIds: [] });
    const privateBody = await privateRequest.json() as { ok: boolean; message: string; citations: string[] };
    assert.equal(privateBody.ok, false);
    assert.deepEqual(privateBody.citations, []);
    assert.doesNotMatch(privateBody.message, /child|fever/i);
  });
});

test("busy and runner failures return bounded neutral errors", async () => {
  let release: (() => void) | undefined;
  let started!: () => void;
  const runnerStarted = new Promise<void>((resolve) => { started = resolve; });
  const slowRunner: OfflineUiRunner = async () => new Promise((resolve) => {
    started();
    release = () => resolve({ ok: true, message: "Synthetic completion", citations: [], provider: "MOCK_OFFLINE" });
  });
  await withServer(slowRunner, async (url) => {
    const first = heldPost(url, { task: "draft", text: "First synthetic request", sourceIds: [] });
    const second = heldPost(url, { task: "draft", text: "Second synthetic request", sourceIds: [] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    first.finish();
    await runnerStarted;
    second.finish();
    assert.deepEqual(await second.response, { status: 429, body: { error: "The local demo is busy. Please try again." } });
    assert.ok(release);
    release();
    assert.equal((await first.response).status, 200);
  });

  await withServer(async () => { throw new Error("private test detail"); }, async (url) => {
    const response = await post(url, { task: "draft", text: "Synthetic request", sourceIds: [] });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "The local offline request could not be completed." });
  });
});
