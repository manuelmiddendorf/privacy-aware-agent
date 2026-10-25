import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import test from "node:test";
import { createLocalUiRequestHandler, createWorkingTimeUiRunner, type LocalSkillUiRunner, type OfflineUiRunner, type WorkingTimeUiRunner } from "../src/localUiServer.js";
import type { WorkingTimeWorkflowModel } from "../src/workingTimeContractWorkflow.js";

async function withServer(
  runner: OfflineUiRunner | undefined,
  run: (url: string) => Promise<void>,
  skillRunner?: LocalSkillUiRunner,
  workingTimeRunner?: WorkingTimeUiRunner,
): Promise<void> {
  const handler = createLocalUiRequestHandler(runner, skillRunner, workingTimeRunner);
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
const postWorkingTime = (url: string, body: unknown) => fetch(`${url}/api/working-time/run`, { method: "POST", headers: requestHeaders(url), body: JSON.stringify(body) });
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
    const html = await page.text();
    assert.match(html, /MOCK_OFFLINE/);
    assert.match(html, /id="working-time-hours"[^>]+min="0\.01"[^>]+max="168"[^>]+step="any"/);
    assert.match(html, /label for="working-time-person"[\s\S]*select id="working-time-person"/);
    assert.match(html, /label for="working-time-hours"[\s\S]*input id="working-time-hours"/);
    assert.match(html, /label for="working-time-date"[\s\S]*input id="working-time-date"/);
    assert.match(html, /label for="working-time-research"[\s\S]*select id="working-time-research"/);
    assert.match(html, /label for="working-time-template"[\s\S]*select id="working-time-template"/);
    assert.doesNotMatch(html, /UI-Aufrufe bis zur Abnahme deaktiviert/);
    assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.equal(page.headers.get("access-control-allow-origin"), null);

    const script = await fetch(`${url}/app.js`);
    const javascript = await script.text();
    assert.equal(script.status, 200);
    assert.doesNotMatch(javascript, /innerHTML|OPENAI_API_KEY|\.env|\.local/);
    assert.equal([...javascript.matchAll(/fetch\(/g)].length, 3);
    assert.match(javascript, /fetch\("\/api\/run"/);
    assert.match(javascript, /fetch\("\/api\/local-skills\/run"/);
    assert.match(javascript, /fetch\("\/api\/working-time\/run"/);
    assert.match(javascript, /workingTimeRevision/);
    assert.match(javascript, /workingTimeController\?\.abort/);
    assert.match(javascript, /workingTimeDraftEditRevision/);
    assert.match(javascript, /Die neue Antwort wurde deshalb nicht übernommen/);
    assert.match(javascript, /function showWorkingTimeClarification[\s\S]*workingTimeQuestions\.hidden = false;[\s\S]*function showWorkingTimeDraft[\s\S]*workingTimeQuestions\.replaceChildren\(\);[\s\S]*workingTimeQuestions\.hidden = true;/);
    assert.match(javascript, /editable-draft/);
    assert.doesNotMatch(javascript, /localStorage|indexedDB/);

    assert.equal((await fetch(`${url}/.env.openai.local`)).status, 404);
    assert.equal((await fetch(`${url}/..%2f.local%2fopenai-live-demo-budget.json`)).status, 404);
  });
});

test("working-time HTTP boundary rejects browser authority and stale confirmation snapshots", async () => {
  await withServer(undefined, async (url) => {
    const base = { requestNonce: "p8_nonce_3001", revision: 1, text: "Bereite einen synthetischen Entwurf vor.", intent: { personId: null, targetWeeklyHours: null, effectiveDate: null, researchRequested: null, templateRequested: null }, confirmation: null };
    assert.equal((await postWorkingTime(url, { ...base, organizationId: "OrgWF-A" })).status, 400);
    assert.equal((await postWorkingTime(url, { ...base, actorId: "ActorWF-A" })).status, 400);
    assert.equal((await postWorkingTime(url, { ...base, sourceId: "contract-lina" })).status, 400);
    assert.equal((await postWorkingTime(url, { ...base, intent: { ...base.intent, personId: "person-foreign" } })).status, 400);
    const intent = { personId: "person-lina", targetWeeklyHours: 25, effectiveDate: "2031-09-01", researchRequested: false, templateRequested: false };
    assert.equal((await postWorkingTime(url, { ...base, intent, confirmation: { ...intent, revision: 2, text: base.text } })).status, 400);
    assert.equal((await postWorkingTime(url, { ...base, intent, confirmation: { ...intent, revision: 1, text: `${base.text} verändert` } })).status, 400);
    const halfHourIntent = { ...intent, targetWeeklyHours: 25.5 };
    assert.equal((await postWorkingTime(url, { ...base, intent: halfHourIntent, confirmation: { ...halfHourIntent, revision: 1, text: base.text } })).status, 200);
    assert.equal((await fetch(`${url}/api/working-time/run`, { method: "GET" })).status, 405);
  });
});

test("working-time UI runner asks neutrally then handles a separately confirmed action", async () => {
  let planCalls = 0;
  let draftCalls = 0;
  const model: WorkingTimeWorkflowModel = {
    name: "LOCAL_WORKING_TIME_TEST_DOUBLE",
    get planCallCount() { return planCalls; },
    get draftCallCount() { return draftCalls; },
    async plan(input) {
      planCalls += 1;
      const complete = /Bestätigt:/.test(input.requestText);
      return { schemaVersion: 1, task: "employment_contract_change", personId: "person-lina", targetWeeklyHours: complete ? 25 : null, effectiveDate: complete ? "2031-09-01" : null, researchRequested: complete ? false : null, templateRequested: complete ? false : null, requiredSourceFields: ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"] };
    },
    async draft() {
      draftCalls += 1;
      return { schemaVersion: 1, documentKind: "working_time_amendment", displayName: "Lina Mustervertrag", currentWeeklyHours: 20, targetWeeklyHours: 25, effectiveDate: "2031-09-01", unchangedTermsConfirmed: true, citations: ["contract-lina:p01", "contract-lina:p02"], conflicts: [], openPoints: [], reviewNotes: ["Ungeprüfter Modellhinweis."] };
    },
  };
  await withServer(undefined, async (url) => {
    const initial = { requestNonce: "p8_nonce_3101", revision: 1, text: "Bereite bitte einen unverbindlichen Entwurf zur Änderung der Wochenarbeitszeit vor.", intent: { personId: null, targetWeeklyHours: null, effectiveDate: null, researchRequested: null, templateRequested: null }, confirmation: null };
    const clarificationResponse = await postWorkingTime(url, initial);
    const clarification = await clarificationResponse.json() as Record<string, any>;
    assert.equal(clarificationResponse.status, 200);
    assert.equal(clarification.kind, "clarification");
    assert.equal(clarification.proposedIntent.personId, null);
    assert.equal(clarification.proposedIntent.personLabel, null);
    assert.match(clarification.questions[0], /Für welche synthetische Person/);
    assert.equal(draftCalls, 0);

    const text = "Bestätigt: Erstelle für Lina Mustervertrag einen unverbindlichen Entwurf zur Änderung auf 25 Wochenstunden ab 2031-09-01.";
    const intent = { personId: "person-lina", targetWeeklyHours: 25, effectiveDate: "2031-09-01", researchRequested: false, templateRequested: false };
    const confirmedResponse = await postWorkingTime(url, { requestNonce: "p8_nonce_3102", revision: 2, text, intent, confirmation: { ...intent, revision: 2, text } });
    const confirmed = await confirmedResponse.json() as Record<string, any>;
    assert.equal(confirmed.kind, "draft");
    assert.equal(confirmed.provider, "LOCAL_WORKING_TIME_TEST_DOUBLE");
    assert.deepEqual(confirmed.citations, ["contract-lina:p01", "contract-lina:p02"]);
    assert.equal(confirmed.researchUsed, false);
    assert.equal(confirmed.templateUsed, false);
    assert.equal(confirmed.templateLabel, "Lokale feste Vorlage");
    assert.equal(planCalls, 2);
    assert.equal(draftCalls, 1);
  }, undefined, createWorkingTimeUiRunner(model));
});

test("working-time HTTP work aborts when the browser disconnects after sending the body", async () => {
  let start!: () => void;
  let observedAbort!: () => void;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const aborted = new Promise<void>((resolve) => { observedAbort = resolve; });
  let followUpWork = 0;
  const runner: WorkingTimeUiRunner = async (command, signal) => {
    start();
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener("abort", () => resolve(), { once: true });
    });
    if (signal.aborted) observedAbort();
    else followUpWork += 1;
    return { ok: false, requestNonce: command.requestNonce, revision: command.revision, kind: "error", message: "stopped" };
  };
  await withServer(undefined, async (url) => {
    const body = JSON.stringify({
      requestNonce: "p8_nonce_disconnect",
      revision: 1,
      text: "Bereite einen synthetischen Entwurf vor.",
      intent: { personId: null, targetWeeklyHours: null, effectiveDate: null, researchRequested: null, templateRequested: null },
      confirmation: null,
    });
    const client = httpRequest(`${url}/api/working-time/run`, {
      method: "POST",
      headers: { ...requestHeaders(url), "Content-Length": Buffer.byteLength(body) },
    });
    client.on("error", () => undefined);
    client.end(body);
    await started;
    client.destroy();
    await aborted;
    assert.equal(followUpWork, 0);
  }, undefined, runner);
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
