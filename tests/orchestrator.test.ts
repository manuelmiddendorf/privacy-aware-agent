import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_POLICY } from "../src/demoPolicy.js";
import { MockProvider } from "../src/mockProvider.js";
import { PrivacyAwareAgent } from "../src/orchestrator.js";
import { classifyText, redactDirectIdentifiers } from "../src/privacyGate.js";
import type { ModelProvider } from "../src/types.js";

test("calls the single provider once only after gating, redaction and source authorization", async () => {
  const provider = new MockProvider();
  const agent = new PrivacyAwareAgent(provider);
  const result = await agent.run(DEMO_POLICY, {
    task: "ask",
    text: "Send the generic answer to reader@example.test.",
    sourceIds: ["help-hours"],
  });
  assert.equal(result.ok, true);
  assert.equal(provider.callCount, 1);
  if (result.ok) {
    assert.equal(result.provider, "MOCK_OFFLINE");
    assert.deepEqual(result.output.citations, ["help-hours"]);
    assert.doesNotMatch(result.output.text, /reader@example\.test/);
  }
});

test("sensitive and uncertain input causes zero provider calls", async () => {
  for (const text of ["summarize the diagnosis", "read the unknown attachment"]) {
    const provider = new MockProvider();
    const result = await new PrivacyAwareAgent(provider).run(DEMO_POLICY, { task: "draft", text, sourceIds: [] });
    assert.equal(result.ok, false);
    assert.equal(provider.callCount, 0);
  }
});

test("invalid policy, denied source and denied capability cause zero provider calls", async () => {
  const provider = new MockProvider();
  const agent = new PrivacyAwareAgent(provider);
  assert.equal((await agent.run({}, { task: "ask", text: "hello", sourceIds: [] })).ok, false);
  assert.equal((await agent.run(DEMO_POLICY, { task: "ask", text: "hello", sourceIds: ["https://example.test"] })).ok, false);
  const noDraft = { ...DEMO_POLICY, capabilities: { ...DEMO_POLICY.capabilities, draft: false } };
  assert.equal((await agent.run(noDraft, { task: "draft", text: "hello", sourceIds: [] })).ok, false);
  assert.equal(provider.callCount, 0);
});

test("privacy-gate technical failure causes zero provider calls and no prompt audit", async () => {
  const provider = new MockProvider();
  const agent = new PrivacyAwareAgent(provider, {
    classify() { throw new Error("synthetic gate failure"); },
    redact(text) { return { text, count: 0 }; },
  });
  const result = await agent.run(DEMO_POLICY, { task: "ask", text: "ordinary prompt", sourceIds: ["help-hours"] });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_TECHNICAL_ERROR");
  assert.equal(provider.callCount, 0);
  assert.doesNotMatch(JSON.stringify(agent.audit), /ordinary prompt/);
});

test("an invalid initial classification fails closed even if a later scan would be safe", async () => {
  const provider = new MockProvider();
  let scans = 0;
  const agent = new PrivacyAwareAgent(provider, {
    classify() {
      scans += 1;
      return scans === 1
        ? { classification: "unknown", reasonCode: "SAFE_GENERIC" } as never
        : { classification: "safe", reasonCode: "SAFE_GENERIC" };
    },
    redact(text) { return { text, count: 0 }; },
  });
  const result = await agent.run(DEMO_POLICY, { task: "draft", text: "ordinary prompt", sourceIds: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_CLASSIFICATION_INVALID");
  assert.equal(provider.callCount, 0);
  assert.equal(scans, 1);
});

test("provider failure after an allowed call is distinguished and fail-closed", async () => {
  let calls = 0;
  const provider: ModelProvider = {
    name: "THROWING_MOCK",
    get callCount() { return calls; },
    async generate() { calls += 1; throw new Error("synthetic failure"); },
  };
  const agent = new PrivacyAwareAgent(provider);
  const result = await agent.run(DEMO_POLICY, { task: "ask", text: "ordinary prompt", sourceIds: ["help-hours"] });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_PROVIDER_ERROR");
  assert.equal(provider.callCount, 1);
  assert.doesNotMatch(JSON.stringify(agent.audit), /ordinary prompt/);
});

test("document and metadata are gated before provider access", async () => {
  const provider = new MockProvider();
  const agent = new PrivacyAwareAgent(provider);
  const policy = {
    ...DEMO_POLICY,
    sources: [...DEMO_POLICY.sources, {
      id: "unsafe-synthetic",
      capabilities: ["read"] as const,
      allowedTasks: ["ask"] as const,
      maxDocumentBytes: 4_096,
    }],
  };
  const result = await agent.run(policy, { task: "ask", text: "read the approved fixture", sourceIds: ["unsafe-synthetic"] });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_DOCUMENT_SENSITIVE");
  assert.equal(provider.callCount, 0);
});

test("malformed request and user-supplied policy-like fields fail before provider access", async () => {
  const provider = new MockProvider();
  const agent = new PrivacyAwareAgent(provider);
  const request = { task: "ask", text: "hello", sourceIds: [], capabilities: { ask: true } };
  const result = await agent.run(DEMO_POLICY, request as never);
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_REQUEST_INVALID");
  assert.equal(provider.callCount, 0);
});

test("a question without evidence blocks before provider access", async () => {
  const provider = new MockProvider();
  const result = await new PrivacyAwareAgent(provider).run(DEMO_POLICY, { task: "ask", text: "generic", sourceIds: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_EVIDENCE_REQUIRED");
  assert.equal(provider.callCount, 0);
});

test("a trusted evidence assessor can block insufficient approved sources only after privacy gating", async () => {
  let assessorCalls = 0;
  const assessor = {
    isSufficient() {
      assessorCalls += 1;
      return false;
    },
  };
  const provider = new MockProvider();
  const agent = new PrivacyAwareAgent(provider, undefined, assessor);
  const result = await agent.run(DEMO_POLICY, {
    task: "ask",
    text: "What binding notice period applies to our next general meeting?",
    sourceIds: ["meeting-preparation"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT");
  assert.equal(assessorCalls, 1);
  assert.equal(provider.callCount, 0);

  assessorCalls = 0;
  const sensitive = await agent.run(DEMO_POLICY, {
    task: "draft",
    text: "A child has a fever. Draft a personal update.",
    sourceIds: [],
  });
  assert.equal(sensitive.ok, false);
  assert.equal(assessorCalls, 0);
  assert.equal(provider.callCount, 0);
});

test("only a synchronous literal true from the evidence assessor permits provider access", async () => {
  const request = {
    task: "ask" as const,
    text: "What are the approved meeting preparation steps?",
    sourceIds: ["meeting-preparation"],
  };

  for (const invalidResult of ["unknown", {}, Promise.resolve(true)]) {
    const provider = new MockProvider();
    const agent = new PrivacyAwareAgent(provider, undefined, {
      isSufficient: () => invalidResult as never,
    });
    const result = await agent.run(DEMO_POLICY, request);
    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT");
    assert.equal(provider.callCount, 0);
  }

  const falseProvider = new MockProvider();
  const falseResult = await new PrivacyAwareAgent(falseProvider, undefined, {
    isSufficient: () => false,
  }).run(DEMO_POLICY, request);
  assert.equal(falseResult.ok, false);
  assert.equal(falseResult.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT");
  assert.equal(falseProvider.callCount, 0);

  const throwingProvider = new MockProvider();
  const throwingResult = await new PrivacyAwareAgent(throwingProvider, undefined, {
    isSufficient() { throw new Error("synthetic assessor failure"); },
  }).run(DEMO_POLICY, request);
  assert.equal(throwingResult.ok, false);
  assert.equal(throwingResult.reasonCode, "BLOCK_TECHNICAL_ERROR");
  assert.equal(throwingProvider.callCount, 0);

  const trueProvider = new MockProvider();
  const trueResult = await new PrivacyAwareAgent(trueProvider, undefined, {
    isSufficient: () => true,
  }).run(DEMO_POLICY, request);
  assert.equal(trueResult.ok, true);
  assert.equal(trueProvider.callCount, 1);
});

test("the final provider context must be safe, not merely redactable", async () => {
  const provider = new MockProvider();
  let scans = 0;
  const agent = new PrivacyAwareAgent(provider, {
    classify() {
      scans += 1;
      return scans === 1
        ? { classification: "redactable", reasonCode: "REDACTABLE_DIRECT_IDENTIFIER" }
        : { classification: "redactable", reasonCode: "REDACTABLE_DIRECT_IDENTIFIER" };
    },
    redact() { return { text: "still@example.test", count: 1 }; },
  });
  const result = await agent.run(DEMO_POLICY, { task: "draft", text: "person@example.test", sourceIds: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_FINAL_CONTEXT_NOT_SAFE");
  assert.equal(provider.callCount, 0);
});

test("the post-redaction scan blocks a sensitive remainder", async () => {
  const provider = new MockProvider();
  let firstScan = true;
  const agent = new PrivacyAwareAgent(provider, {
    classify(text, maxBytes) {
      if (firstScan) {
        firstScan = false;
        return { classification: "redactable", reasonCode: "REDACTABLE_DIRECT_IDENTIFIER" };
      }
      return classifyText(text, maxBytes);
    },
    redact: redactDirectIdentifiers,
  });
  const result = await agent.run(DEMO_POLICY, {
    task: "draft",
    text: "Reply to demo@example.test about Fieber.",
    sourceIds: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_FINAL_CONTEXT_NOT_SAFE");
  assert.equal(provider.callCount, 0);
});

test("names, child data and health remainder block even alongside a redactable identifier", async () => {
  for (const text of [
    "Reply to person@example.test for Anna Beispiel.",
    "Reply to person@example.test about the child.",
    "Reply to person@example.test about Fieber.",
  ]) {
    const provider = new MockProvider();
    const result = await new PrivacyAwareAgent(provider).run(DEMO_POLICY, { task: "draft", text, sourceIds: [] });
    assert.equal(result.ok, false);
    assert.equal(provider.callCount, 0);
  }
});

test("the offline mock keeps distinct ask, summarize and draft contracts", async () => {
  const samples = [
    { task: "ask" as const, text: "Generic question.", sourceIds: ["help-hours"], prefix: "MOCK answer:" },
    { task: "summarize" as const, text: "Summarize this general text.", sourceIds: [], prefix: "MOCK summary:" },
    { task: "draft" as const, text: "Generic draft.", sourceIds: [], prefix: "MOCK draft" },
  ];
  for (const sample of samples) {
    const provider = new MockProvider();
    const result = await new PrivacyAwareAgent(provider).run(DEMO_POLICY, {
      task: sample.task,
      text: sample.text,
      sourceIds: sample.sourceIds,
    });
    assert.equal(result.ok, true);
    assert.equal(provider.callCount, 1);
    if (result.ok) assert.match(result.output.text, new RegExp(`^${sample.prefix}`));
  }
});

test("the offline mock rejects unsupported evidence shapes if called directly", async () => {
  const provider = new MockProvider();
  await assert.rejects(
    provider.generate({ task: "ask", text: "Generic question.", documents: [] }),
    /requires approved evidence/
  );
  assert.equal(provider.callCount, 0);
});
