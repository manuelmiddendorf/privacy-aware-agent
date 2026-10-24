import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createExactSyntheticEvidenceAssessor } from "../src/demoEvidence.js";
import { DEMO_POLICY } from "../src/demoPolicy.js";
import { MockProvider } from "../src/mockProvider.js";
import { PrivacyAwareAgent } from "../src/orchestrator.js";
import type { AgentRequest } from "../src/types.js";

interface CatalogCase extends AgentRequest { id: string }

async function selectedCases() {
  const catalog = JSON.parse(await readFile("docs/PRACTICAL-CASES-P1.json", "utf8")) as {
    cases: Array<{ id: string; task: AgentRequest["task"]; sourceIds: string[]; prompt: string }>;
  };
  return new Map(catalog.cases.map((sample) => [sample.id, {
    id: sample.id,
    task: sample.task,
    text: sample.prompt,
    sourceIds: sample.sourceIds,
  }]));
}

test("P01, P04 and P07 require and accept only their exact synthetic host decision", async () => {
  const cases = await selectedCases();
  for (const id of ["P01", "P04", "P07"]) {
    const sample = cases.get(id);
    assert.ok(sample);
    const request: AgentRequest = { task: sample.task, text: sample.text, sourceIds: sample.sourceIds };

    const defaultProvider = new MockProvider();
    const defaultResult = await new PrivacyAwareAgent(defaultProvider).run(DEMO_POLICY, request);
    assert.equal(defaultResult.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT", id);
    assert.equal(defaultProvider.callCount, 0, id);

    const approvedProvider = new MockProvider();
    const approvedResult = await new PrivacyAwareAgent(
      approvedProvider,
      undefined,
      createExactSyntheticEvidenceAssessor(request),
    ).run(DEMO_POLICY, request);
    assert.equal(approvedResult.ok, true, id);
    assert.equal(approvedProvider.callCount, 1, id);
  }
});

test("P06 receives no approval from a different exact synthetic host decision", async () => {
  const cases = await selectedCases();
  const p01 = cases.get("P01");
  const p06 = cases.get("P06");
  assert.ok(p01);
  assert.ok(p06);
  const p01Request: AgentRequest = { task: p01.task, text: p01.text, sourceIds: p01.sourceIds };
  const p06Request: AgentRequest = { task: p06.task, text: p06.text, sourceIds: p06.sourceIds };
  const provider = new MockProvider();
  const result = await new PrivacyAwareAgent(
    provider,
    undefined,
    createExactSyntheticEvidenceAssessor(p01Request),
  ).run(DEMO_POLICY, p06Request);
  assert.equal(result.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT");
  assert.equal(provider.callCount, 0);
});
