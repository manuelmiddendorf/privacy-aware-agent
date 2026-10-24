import assert from "node:assert/strict";
import test from "node:test";
import { createExactSyntheticEvidenceAssessor } from "../src/demoEvidence.js";
import { DEMO_POLICY } from "../src/demoPolicy.js";
import { MockProvider } from "../src/mockProvider.js";
import { PrivacyAwareAgent } from "../src/orchestrator.js";
import type { AgentRequest, KnowledgeDocument } from "../src/types.js";

const P01: AgentRequest = {
  task: "ask",
  text: "Which preparation step comes after creating the agenda, and what is the final step? Answer only from the approved page.",
  sourceIds: ["meeting-preparation"],
};

test("unassessed source-backed requests fail closed for ask, summarize and draft", async () => {
  const requests: Array<{ policy: unknown; request: AgentRequest }> = [
    {
      policy: DEMO_POLICY,
      request: { task: "ask", text: "How many votes are needed to approve an accessibility budget?", sourceIds: ["help-reset"] },
    },
    {
      policy: DEMO_POLICY,
      request: { task: "summarize", text: "Summarize the selected page.", sourceIds: ["help-hours"] },
    },
    {
      policy: {
        ...DEMO_POLICY,
        sources: [{ ...DEMO_POLICY.sources[0], allowedTasks: ["ask", "draft", "summarize"] as const }],
      },
      request: { task: "draft", text: "Draft from the selected page.", sourceIds: ["help-hours"] },
    },
  ];
  for (const sample of requests) {
    const provider = new MockProvider();
    const result = await new PrivacyAwareAgent(provider).run(sample.policy, sample.request);
    assert.equal(result.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT");
    assert.equal(provider.callCount, 0);
  }
});

test("an exact synthetic host decision binds request, source order, tenant and document contents", async () => {
  const approvedProvider = new MockProvider();
  const approved = await new PrivacyAwareAgent(
    approvedProvider,
    undefined,
    createExactSyntheticEvidenceAssessor(P01),
  ).run(DEMO_POLICY, P01);
  assert.equal(approved.ok, true);
  assert.equal(approvedProvider.callCount, 1);

  const changedQuestionProvider = new MockProvider();
  const changedQuestion = await new PrivacyAwareAgent(
    changedQuestionProvider,
    undefined,
    createExactSyntheticEvidenceAssessor(P01),
  ).run(DEMO_POLICY, { ...P01, text: "What deadline applies?" });
  assert.equal(changedQuestion.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT");
  assert.equal(changedQuestionProvider.callCount, 0);

  const alteredExpectedDocument: KnowledgeDocument = {
    id: "meeting-preparation",
    tenantId: "demo-tenant",
    title: "Synthetic board meeting preparation",
    body: "Changed fixture content must require a new host decision.",
    classification: "safe",
  };
  const changedDocumentProvider = new MockProvider();
  const changedDocument = await new PrivacyAwareAgent(
    changedDocumentProvider,
    undefined,
    createExactSyntheticEvidenceAssessor(P01, [alteredExpectedDocument]),
  ).run(DEMO_POLICY, P01);
  assert.equal(changedDocument.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT");
  assert.equal(changedDocumentProvider.callCount, 0);
});

test("source-free draft and summarize stay available while privacy still precedes host approval", async () => {
  for (const request of [
    { task: "draft" as const, text: "Write a generic public notice.", sourceIds: [] },
    { task: "summarize" as const, text: "Summarize this general checklist: arrange chairs and recycle paper.", sourceIds: [] },
  ]) {
    const provider = new MockProvider();
    const result = await new PrivacyAwareAgent(provider).run(DEMO_POLICY, request);
    assert.equal(result.ok, true);
    assert.equal(provider.callCount, 1);
  }

  let assessorCalls = 0;
  const provider = new MockProvider();
  const privateResult = await new PrivacyAwareAgent(provider, undefined, {
    isSufficient() { assessorCalls += 1; return true; },
  }).run(DEMO_POLICY, {
    task: "draft",
    text: "Die Person kann kaum Luft bekommen.",
    sourceIds: [],
  });
  assert.equal(privateResult.reasonCode, "BLOCK_HEALTH_DATA");
  assert.equal(assessorCalls, 0);
  assert.equal(provider.callCount, 0);
});
