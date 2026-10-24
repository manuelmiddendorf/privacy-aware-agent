import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import test from "node:test";
import { createLocalUiRequestHandler, type LocalSkillUiRunner, type OfflineUiRunner } from "../src/localUiServer.js";

async function withServer(
  runner: OfflineUiRunner | undefined,
  run: (url: string) => Promise<void>,
  skillRunner?: LocalSkillUiRunner,
): Promise<void> {
  const handler = createLocalUiRequestHandler(runner, skillRunner);
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
const postSkill = (url: string, body: unknown) => fetch(`${url}/api/local-skills/run`, { method: "POST", headers: requestHeaders(url), body: JSON.stringify(body) });
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
    assert.equal([...javascript.matchAll(/fetch\(/g)].length, 2);
    assert.match(javascript, /fetch\("\/api\/run"/);
    assert.match(javascript, /fetch\("\/api\/local-skills\/run"/);
    assert.doesNotMatch(javascript, /localStorage|indexedDB/);

    assert.equal((await fetch(`${url}/.env.openai.local`)).status, 404);
    assert.equal((await fetch(`${url}/..%2f.local%2fopenai-live-demo-budget.json`)).status, 404);
  });
});

test("local skill HTTP boundary rejects authority fields and oversized or malformed attachments", async () => {
  await withServer(undefined, async (url) => {
    const base = { requestNonce: "p7_nonce_2001", text: "Formuliere einen Text", attachments: [] };
    assert.equal((await postSkill(url, { ...base, role: "admin" })).status, 400);
    assert.equal((await postSkill(url, { ...base, organizationId: "p7-lab-org-b" })).status, 400);
    assert.equal((await postSkill(url, { ...base, skillId: "GENERAL_RESEARCH" })).status, 400);
    assert.equal((await postSkill(url, { ...base, attachments: [{ title: "Leer", text: "" }] })).status, 400);
    assert.equal((await postSkill(url, { ...base, attachments: [{ title: "Groß", text: "x".repeat(41_000) }] })).status, 413);
    assert.equal((await fetch(`${url}/api/local-skills/run`, { method: "GET" })).status, 405);
  });
});

test("local skill UI route labels test-double results, skills, sources and paragraph citations", async () => {
  await withServer(undefined, async (url) => {
    const understand = await postSkill(url, {
      requestNonce: "p7_nonce_2002",
      text: "Fasse den synthetischen Gesundheitstext zusammen.",
      attachments: [{ title: "Synthetischer Hinweis", text: "Das erfundene Kind hat Fieber.\n\nEs bleibt zuhause." }],
    });
    const understandBody = await understand.json() as Record<string, unknown>;
    assert.equal(understand.status, 200);
    assert.equal(understandBody.ok, true);
    assert.equal(understandBody.provider, "LOCAL_TEST_DOUBLE");
    assert.deepEqual(understandBody.skillIds, ["DOCUMENT_UNDERSTANDING"]);
    assert.deepEqual(understandBody.sourceTitles, ["Synthetischer Hinweis"]);
    assert.deepEqual((understandBody.citations as { paragraphId: string }[]).map(({ paragraphId }) => paragraphId), ["inline-1:p01"]);

    const draft = await postSkill(url, { requestNonce: "p7_nonce_2003", text: "Formuliere eine freundliche Einladung.", attachments: [] });
    const draftBody = await draft.json() as Record<string, unknown>;
    assert.equal(draftBody.provider, "LOCAL_TEST_DOUBLE");
    assert.deepEqual(draftBody.skillIds, ["TEXT_COMPOSITION"]);
    assert.deepEqual(draftBody.citations, []);

    const combined = await postSkill(url, {
      requestNonce: "p7_nonce_2004",
      text: "Erkläre den Hinweis und formuliere daraus einen Entwurf.",
      attachments: [{ title: "Hinweis", text: "Ein rein synthetischer Absatz." }],
    });
    const combinedBody = await combined.json() as { skillIds: string[]; parts: unknown[] };
    assert.deepEqual(combinedBody.skillIds, ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"]);
    assert.equal(combinedBody.parts.length, 2);

    const clarify = await postSkill(url, { requestNonce: "p7_nonce_2005", text: "Kannst du das erledigen?", attachments: [] });
    const clarifyBody = await clarify.json() as { ok: boolean; message: string; provider?: string };
    assert.equal(clarifyBody.ok, false);
    assert.match(clarifyBody.message, /verstehen oder.*formulieren/i);
    assert.equal(clarifyBody.provider, undefined);
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
