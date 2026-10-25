import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { runP8WorkflowDevelopment, shouldRunP8ConfirmedFollowup } from "../src/p8WorkflowRunner.js";
import { P7LocalCallBudget } from "../src/p7LocalCallBudget.js";
import {
  P8_PINNED_MANIFEST_FILE_SHA256,
  P8_PINNED_MODEL_MANIFEST_SHA256,
  P8_PINNED_RUNTIME_SHA256,
} from "../src/p8WorkflowReadiness.js";
import { P6_OLLAMA_MODEL, type OllamaResearchTransport } from "../src/ollamaResearchAdapter.js";

async function historicalLedger(path: string): Promise<void> {
  const budget = new P7LocalCallBudget(path);
  await budget.claimDevelopmentOnce();
  for (let index = 0; index < 10; index += 1) await budget.reserve({ phase: "development", promptConfigId: index < 5 ? "P7_SKILLS_A" : "P7_SKILLS_B", caseId: `prior-${index + 1}`, stage: "proposal" });
  await budget.claimCorrectionDevelopmentOnce();
  await budget.reserve({ phase: "correction-development", promptConfigId: "P7_ROUTE_V2", caseId: "P7-01", stage: "proposal" });
}

const envelope = (content: unknown) => ({ status: 200, body: JSON.stringify({ model: P6_OLLAMA_MODEL, done: true, done_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }) });

test("the historical P8 preregistered runner stays locked after the reviewed source evolves", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p8-runner-"));
  const ledgerPath = join(directory, "ledger.json");
  await historicalLedger(ledgerPath);
  const runtimeMetadataPath = join(directory, "runtime.json");
  await writeFile(runtimeMetadataPath, JSON.stringify({ schemaVersion: 1, runtimePid: 4242, listenerPid: 4242, listenerHost: "127.0.0.1", listenerPort: 11435, observedAt: new Date().toISOString(), runtimeVersion: "0.40.4", runtimeSha256: P8_PINNED_RUNTIME_SHA256, manifestFileSha256: P8_PINNED_MANIFEST_FILE_SHA256, modelManifestSha256: P8_PINNED_MODEL_MANIFEST_SHA256, sandboxVerified: true }));
  let calls = 0;
  const transport: OllamaResearchTransport = async (request) => {
    calls += 1;
    const body = JSON.parse(request.body);
    const input = JSON.parse(body.messages[1].content);
    if (body.options.num_predict === 256) {
      const missing = /Bereite bitte/.test(input.requestText);
      return envelope({ schemaVersion: 1, task: "employment_contract_change", personId: missing ? null : "person-lina", targetWeeklyHours: missing ? null : 25, effectiveDate: missing ? null : "2031-09-01", researchRequested: /allgemeine Anforderungen/.test(input.requestText), requiredSourceFields: ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"] });
    }
    return envelope({ schemaVersion: 1, draft: "Unverbindlicher Entwurf: Lina Mustervertrag, künftig 25 Wochenstunden ab 2031-09-01; andere Vertragsbestimmungen bleiben unverändert.", citations: ["contract-lina:p01", "contract-lina:p02"], gaps: [], reviewNotes: ["Vor Unterzeichnung fachlich und rechtlich prüfen."] });
  };
  await assert.rejects(runP8WorkflowDevelopment({ root: resolve("."), ledgerPath, runtimeMetadataPath, protocolPath: "/private/tmp/P7-root-workflow-protocol-amendment.json", outputPath: join(directory, "report.json"), transport }), /preflight mismatch/);
  assert.equal(calls, 0);
  assert.equal(await new P7LocalCallBudget(ledgerPath).readReservedPosts(), 11);
});

test("P8 follow-up gate rejects an unexpected first draft", () => {
  assert.equal(shouldRunP8ConfirmedFollowup({ ok: true, kind: "draft", questions: [] }, ["missing"]), false);
  assert.equal(shouldRunP8ConfirmedFollowup({ ok: true, kind: "clarification", questions: ["different"] }, ["missing"]), false);
});

test("the historical WF02 transport scenario cannot bypass the frozen-source preflight", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p8-runner-stop-"));
  const ledgerPath = join(directory, "ledger.json");
  await historicalLedger(ledgerPath);
  const runtimeMetadataPath = join(directory, "runtime.json");
  await writeFile(runtimeMetadataPath, JSON.stringify({ schemaVersion: 1, runtimePid: 4242, listenerPid: 4242, listenerHost: "127.0.0.1", listenerPort: 11435, observedAt: new Date().toISOString(), runtimeVersion: "0.40.4", runtimeSha256: P8_PINNED_RUNTIME_SHA256, manifestFileSha256: P8_PINNED_MANIFEST_FILE_SHA256, modelManifestSha256: P8_PINNED_MODEL_MANIFEST_SHA256, sandboxVerified: true }));
  let calls = 0;
  const transport: OllamaResearchTransport = async (request) => {
    calls += 1;
    if (calls === 3) throw new Error("synthetic first-plan transport failure");
    const body = JSON.parse(request.body);
    if (body.options.num_predict === 256) return envelope({ schemaVersion: 1, task: "employment_contract_change", personId: "person-lina", targetWeeklyHours: 25, effectiveDate: "2031-09-01", researchRequested: false, requiredSourceFields: ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"] });
    return envelope({ schemaVersion: 1, draft: "Unverbindlicher Entwurf.", citations: ["contract-lina:p01"], gaps: [], reviewNotes: ["Prüfen."] });
  };
  await assert.rejects(runP8WorkflowDevelopment({ root: resolve("."), ledgerPath, runtimeMetadataPath, protocolPath: "/private/tmp/P7-root-workflow-protocol-amendment.json", outputPath: join(directory, "report.json"), transport }), /preflight mismatch/);
  assert.equal(calls, 0);
  assert.equal(await new P7LocalCallBudget(ledgerPath).readReservedPosts(), 11);
});
