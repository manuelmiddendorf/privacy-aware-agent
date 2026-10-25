import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
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

test("historical A/B runner refuses the disclosed route-v2 working tree before transport", async () => {
  let transportCalls = 0;
  const transport: OllamaResearchTransport = async (request) => {
    transportCalls += 1;
    const body = JSON.parse(request.body);
    const input = JSON.parse(body.messages[1].content);
    if (body.options.num_predict === 128) {
      if (/erledigen/.test(input.requestText)) {
        return response({ schemaVersion: 1, route: "CLARIFY" });
      }
      const route = /Schreibe|Formuliere/.test(input.requestText) ? "COMPOSE_TEXT" : "UNDERSTAND_DOCUMENTS";
      return response({ schemaVersion: 1, route });
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
  await assert.rejects(runP7Development({
    root: resolve("."),
    outputPath: join(directory, "report.json"),
    ledgerPath: join(directory, "budget.json"),
    transport,
  }), /frozen source hash mismatch/);
  assert.equal(transportCalls, 0);
});

test("historical A/B runner cannot create a new claim after contract correction", async () => {
  let transportCalls = 0;
  const directory = await mkdtemp(join(tmpdir(), "p7-development-stop-"));
  await assert.rejects(runP7Development({
    root: resolve("."),
    outputPath: join(directory, "report.json"),
    ledgerPath: join(directory, "budget.json"),
    transport: async () => {
      transportCalls += 1;
      throw new Error("synthetic transport failure");
    },
  }), /frozen source hash mismatch/);
  assert.equal(transportCalls, 0);
});
