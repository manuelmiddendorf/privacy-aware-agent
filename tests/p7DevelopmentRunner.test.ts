import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { runP7Development } from "../src/p7DevelopmentRunner.js";
import { P6_OLLAMA_MODEL, type OllamaResearchTransport } from "../src/ollamaResearchAdapter.js";

function response(content: unknown) {
  return {
    status: 200,
    body: JSON.stringify({
      model: P6_OLLAMA_MODEL,
      done: true,
      done_reason: "stop",
      message: { role: "assistant", content: JSON.stringify(content) },
    }),
  };
}

test("development runner executes only the preregistered A/B matrix with 18 counted POSTs", async () => {
  let transportCalls = 0;
  const transport: OllamaResearchTransport = async (request) => {
    transportCalls += 1;
    const body = JSON.parse(request.body);
    const input = JSON.parse(body.messages[1].content);
    if (body.options.num_predict === 128) {
      if (/erledigen/.test(input.requestText)) {
        return response({ schemaVersion: 1, decision: "clarify", skillIds: [], clarificationCode: "NEED_TASK_OR_SOURCE" });
      }
      const skill = /Schreibe|Formuliere/.test(input.requestText) ? "TEXT_COMPOSITION" : "DOCUMENT_UNDERSTANDING";
      return response({ schemaVersion: 1, decision: "select", skillIds: [skill], clarificationCode: null });
    }
    const skillId = input.skillIds[0];
    const paragraphIds = input.documents.flatMap((document: { paragraphs: { id: string }[] }) => document.paragraphs.map(({ id }) => id));
    return response({
      schemaVersion: 1,
      parts: [{
        skillId,
        kind: skillId === "DOCUMENT_UNDERSTANDING" ? "answer" : "draft",
        text: "Synthetisches Prüfergebnis.",
        citationParagraphIds: skillId === "DOCUMENT_UNDERSTANDING" ? paragraphIds : [],
      }],
    });
  };
  const directory = await mkdtemp(join(tmpdir(), "p7-development-runner-"));
  const report = await runP7Development({
    root: resolve("."),
    outputPath: join(directory, "report.json"),
    ledgerPath: join(directory, "budget.json"),
    transport,
  });
  assert.equal(report.stopped, null);
  assert.equal(report.runPosts, 18);
  assert.equal(report.reservedPostsBefore, 0);
  assert.equal(report.reservedPostsAfter, 18);
  assert.equal(transportCalls, 18);
  assert.equal(report.configurations.length, 2);
  assert.deepEqual(report.configurations.map(({ cases }) => cases.length), [6, 6]);
  for (const configuration of report.configurations) {
    const denied = configuration.cases.find(({ caseId }) => caseId === "P7-11");
    assert.equal(denied?.localPosts, 0);
    assert.equal(denied?.sourceContentReads, 0);
    assert.equal(denied?.result.ok, false);
  }
  const persisted = JSON.parse(await readFile(join(directory, "report.json"), "utf8"));
  assert.equal(persisted.runPosts, 18);
});

test("development runner stops after one counted transport failure without retry", async () => {
  let transportCalls = 0;
  const directory = await mkdtemp(join(tmpdir(), "p7-development-stop-"));
  const report = await runP7Development({
    root: resolve("."),
    outputPath: join(directory, "report.json"),
    ledgerPath: join(directory, "budget.json"),
    transport: async () => {
      transportCalls += 1;
      throw new Error("synthetic transport failure");
    },
  });
  assert.equal(transportCalls, 1);
  assert.equal(report.runPosts, 1);
  assert.equal(report.reservedPostsAfter, 1);
  assert.deepEqual(report.stopped, {
    configId: "P7_SKILLS_A",
    caseId: "P7-01",
    reason: "transport, timeout, or unknown model execution failure",
  });
  assert.equal(report.configurations[0]?.cases.length, 1);
});
