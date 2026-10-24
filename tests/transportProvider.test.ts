import assert from "node:assert/strict";
import test from "node:test";
import { createExactSyntheticEvidenceAssessor } from "../src/demoEvidence.js";
import { DEMO_POLICY } from "../src/demoPolicy.js";
import { PrivacyAwareAgent } from "../src/orchestrator.js";
import {
  TransportModelProvider,
  type ProviderTransport,
  type TrustedTransportProviderConfig,
} from "../src/transportProvider.js";
import type { AgentRequest, ModelProvider, ReasonCode } from "../src/types.js";

const ASK_REQUEST: AgentRequest = {
  task: "ask",
  text: "What are the synthetic support hours?",
  sourceIds: ["help-hours"],
};

const approvedAgent = (provider: ModelProvider, request: AgentRequest = ASK_REQUEST) =>
  new PrivacyAwareAgent(provider, undefined, createExactSyntheticEvidenceAssessor(request));

const enabled = (
  transport: ProviderTransport,
  overrides: Partial<TrustedTransportProviderConfig> = {},
) => new TransportModelProvider(transport, {
  enabled: true,
  timeoutMs: 100,
  maxRequestBytes: 32_768,
  maxResponseBytes: 16_384,
  ...overrides,
});

test("the injected transport is disabled by default and distinguishes method from transport calls", async () => {
  let attempts = 0;
  const provider = new TransportModelProvider(async () => {
    attempts += 1;
    return { status: 200, body: { text: "unexpected", citations: [] } };
  });
  const result = await approvedAgent(provider).run(DEMO_POLICY, ASK_REQUEST);
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_PROVIDER_DISABLED");
  assert.equal(provider.callCount, 1);
  assert.equal(provider.transportCallCount, 0);
  assert.equal(attempts, 0);
});

test("an explicitly enabled synthetic transport receives only the gated provider input", async () => {
  let captured: unknown;
  const provider = enabled(async (request) => {
    captured = request;
    return { status: 200, body: { text: "Synthetic approved answer.", citations: ["help-hours"] } };
  });
  const request: AgentRequest = {
    task: "ask",
    text: "Send the approved answer to reader@example.test.",
    sourceIds: ["help-hours"],
  };
  const result = await approvedAgent(provider, request).run(DEMO_POLICY, request);
  assert.equal(result.ok, true);
  assert.equal(provider.callCount, 1);
  assert.equal(provider.transportCallCount, 1);
  assert.doesNotMatch(JSON.stringify(captured), /reader@example\.test/);
  assert.match(JSON.stringify(captured), /\[REDACTED_1\]/);
  assert.deepEqual((captured as { documents: { id: string }[] }).documents.map((document) => document.id), ["help-hours"]);
  if (result.ok) assert.deepEqual(result.output.citations, ["help-hours"]);
});

test("privacy, policy, source and evidence blocks make zero transport calls", async () => {
  const provider = enabled(async () => ({ status: 200, body: { text: "unexpected", citations: [] } }));
  const cases: readonly [unknown, AgentRequest][] = [
    [{}, ASK_REQUEST],
    [DEMO_POLICY, { task: "ask", text: "Generic question.", sourceIds: ["unknown-source"] }],
    [DEMO_POLICY, { task: "ask", text: "Generic question.", sourceIds: [] }],
    [DEMO_POLICY, { task: "draft", text: "A child has a fever.", sourceIds: [] }],
  ];
  for (const [policy, request] of cases) {
    const result = await new PrivacyAwareAgent(provider).run(policy, request);
    assert.equal(result.ok, false);
  }
  const insufficient = await new PrivacyAwareAgent(provider, undefined, {
    isSufficient: () => false,
  }).run(DEMO_POLICY, ASK_REQUEST);
  assert.equal(insufficient.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT");
  assert.equal(provider.callCount, 0);
  assert.equal(provider.transportCallCount, 0);
});

test("timeout aborts the injected signal and finishes even when the transport ignores abort", async () => {
  let transportSignal: AbortSignal | undefined;
  const provider = enabled(async (_request, options) => {
    transportSignal = options.signal;
    return await new Promise(() => {});
  }, { timeoutMs: 10 });
  const startedAt = Date.now();
  const result = await approvedAgent(provider).run(DEMO_POLICY, ASK_REQUEST);
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_PROVIDER_TIMEOUT");
  assert.equal(provider.transportCallCount, 1);
  assert.equal(transportSignal?.aborted, true);
  assert.ok(Date.now() - startedAt < 500);
});

test("cancellation before start makes zero calls and cancellation during transport aborts once", async () => {
  const beforeProvider = enabled(async () => ({ status: 200, body: { text: "unexpected", citations: [] } }));
  const before = new AbortController();
  before.abort();
  const beforeResult = await approvedAgent(beforeProvider).run(DEMO_POLICY, ASK_REQUEST, { signal: before.signal });
  assert.equal(beforeResult.reasonCode, "BLOCK_PROVIDER_CANCELLED");
  assert.equal(beforeProvider.callCount, 0);
  assert.equal(beforeProvider.transportCallCount, 0);

  let started!: () => void;
  const transportStarted = new Promise<void>((resolve) => { started = resolve; });
  let transportSignal: AbortSignal | undefined;
  const duringProvider = enabled(async (_request, options) => {
    transportSignal = options.signal;
    started();
    return await new Promise(() => {});
  });
  const during = new AbortController();
  const pending = approvedAgent(duringProvider).run(DEMO_POLICY, ASK_REQUEST, { signal: during.signal });
  await transportStarted;
  during.abort();
  const duringResult = await pending;
  assert.equal(duringResult.reasonCode, "BLOCK_PROVIDER_CANCELLED");
  assert.equal(duringProvider.callCount, 1);
  assert.equal(duringProvider.transportCallCount, 1);
  assert.equal(transportSignal?.aborted, true);
});

test("cancellation queued after transport resolution wins before the response is accepted", async () => {
  const cancellation = new AbortController();
  let resolveTransport!: (response: {
    status: number;
    body: { text: string; citations: string[] };
  }) => void;
  const heldTransport = new Promise<{
    status: number;
    body: { text: string; citations: string[] };
  }>((resolve) => {
    resolveTransport = resolve;
  });
  let markTransportStarted!: () => void;
  const transportStarted = new Promise<void>((resolve) => {
    markTransportStarted = resolve;
  });
  const provider = enabled(() => {
    markTransportStarted();
    return heldTransport;
  });
  const pending = approvedAgent(provider).run(DEMO_POLICY, ASK_REQUEST, { signal: cancellation.signal });
  await transportStarted;
  resolveTransport({
    status: 200,
    body: { text: "must not be accepted", citations: ["help-hours"] },
  });
  queueMicrotask(() => cancellation.abort());
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, "BLOCK_PROVIDER_CANCELLED");
  assert.equal(provider.transportCallCount, 1);
});

test("transport, upstream, rate, quota and rejection failures use stable reason codes without retries", async () => {
  const samples: readonly [ReasonCode, ProviderTransport][] = [
    ["BLOCK_PROVIDER_TRANSPORT", async () => { throw new Error("raw synthetic provider secret"); }],
    ["BLOCK_PROVIDER_TRANSPORT", async () => ({ status: 503, body: { message: "raw upstream body" } })],
    ["BLOCK_PROVIDER_RATE_LIMIT", async () => ({ status: 429, body: { code: "rate_limited" } })],
    ["BLOCK_PROVIDER_QUOTA", async () => ({ status: 429, body: { error: { code: "quota_exceeded" } } })],
    ["BLOCK_PROVIDER_REJECTED", async () => ({ status: 403, body: { message: "rejected" } })],
  ];
  const capturedLogs: unknown[] = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => { capturedLogs.push(args); };
  console.warn = (...args) => { capturedLogs.push(args); };
  try {
    for (const [reason, transport] of samples) {
      const provider = enabled(transport);
      const result = await approvedAgent(provider).run(DEMO_POLICY, ASK_REQUEST);
      assert.equal(result.reasonCode, reason);
      assert.equal(provider.transportCallCount, 1);
      assert.doesNotMatch(JSON.stringify(result), /raw synthetic provider secret|raw upstream body|"message":"rejected"/i);
    }
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
  assert.deepEqual(capturedLogs, []);
});

test("request and response limits, response shape and citation scope fail closed", async () => {
  const tooLargeRequest = enabled(async () => ({ status: 200, body: { text: "unexpected", citations: [] } }), {
    maxRequestBytes: 64,
  });
  const requestResult = await approvedAgent(tooLargeRequest).run(DEMO_POLICY, ASK_REQUEST);
  assert.equal(requestResult.reasonCode, "BLOCK_PROVIDER_REQUEST_TOO_LARGE");
  assert.equal(tooLargeRequest.transportCallCount, 0);

  const unexpectedResponse = enabled(async () => ({ status: "200", body: {} } as never));
  const unexpectedResult = await approvedAgent(unexpectedResponse).run(DEMO_POLICY, ASK_REQUEST);
  assert.equal(unexpectedResult.reasonCode, "BLOCK_PROVIDER_RESPONSE_INVALID");
  assert.equal(unexpectedResponse.transportCallCount, 1);

  let statusReads = 0;
  const responseWithGetter = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(responseWithGetter, "status", {
    enumerable: true,
    get: () => {
      statusReads += 1;
      return 200;
    },
  });
  Object.defineProperty(responseWithGetter, "body", {
    enumerable: true,
    value: { text: "must not be accepted", citations: [] },
  });
  const responseGetterProvider = enabled(async () => responseWithGetter as never);
  const responseGetterResult = await approvedAgent(responseGetterProvider).run(DEMO_POLICY, ASK_REQUEST);
  assert.equal(responseGetterResult.reasonCode, "BLOCK_PROVIDER_RESPONSE_INVALID");
  assert.equal(statusReads, 0);

  const samples: readonly [ReasonCode, unknown, Partial<TrustedTransportProviderConfig>?][] = [
    ["BLOCK_PROVIDER_RESPONSE_INVALID", { text: 42, citations: [] }],
    ["BLOCK_PROVIDER_RESPONSE_INVALID", { text: "ok", citations: [], extra: true }],
    ["BLOCK_PROVIDER_RESPONSE_TOO_LARGE", { text: "x".repeat(256), citations: [] }, { maxResponseBytes: 64 }],
    ["BLOCK_PROVIDER_CITATION_INVALID", { text: "ok", citations: ["other-source"] }],
    ["BLOCK_PROVIDER_CITATION_INVALID", { text: "ok", citations: ["help-hours", "help-hours"] }],
  ];
  for (const [reason, body, overrides] of samples) {
    const provider = enabled(async () => ({ status: 200, body }), overrides);
    const result = await approvedAgent(provider).run(DEMO_POLICY, ASK_REQUEST);
    assert.equal(result.reasonCode, reason);
    assert.equal(provider.transportCallCount, 1);
  }

  const oversizedWithToJson = { text: "x".repeat(1_024), citations: [] as string[] };
  Object.defineProperty(oversizedWithToJson, "toJSON", {
    enumerable: false,
    value: () => ({ text: "x", citations: [] }),
  });
  const toJsonProvider = enabled(async () => ({ status: 200, body: oversizedWithToJson }), {
    maxResponseBytes: 64,
  });
  const toJsonResult = await approvedAgent(toJsonProvider).run(DEMO_POLICY, ASK_REQUEST);
  assert.equal(toJsonResult.reasonCode, "BLOCK_PROVIDER_RESPONSE_TOO_LARGE");

  let getterReads = 0;
  const getterBody = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(getterBody, "text", {
    enumerable: true,
    get: () => {
      getterReads += 1;
      return getterReads === 1 ? "ok" : "x".repeat(1_024);
    },
  });
  Object.defineProperty(getterBody, "citations", { enumerable: true, value: [] });
  const getterProvider = enabled(async () => ({ status: 200, body: getterBody }));
  const getterResult = await approvedAgent(getterProvider).run(DEMO_POLICY, ASK_REQUEST);
  assert.equal(getterResult.reasonCode, "BLOCK_PROVIDER_RESPONSE_INVALID");
  assert.equal(getterReads, 0);

  const plainProvider = enabled(async () => ({
    status: 200,
    body: { text: "Stable plain response.", citations: ["help-hours"] },
  }));
  const plainResult = await approvedAgent(plainProvider).run(DEMO_POLICY, ASK_REQUEST);
  assert.equal(plainResult.ok, true);
  if (plainResult.ok) {
    assert.equal(plainResult.output.text, "Stable plain response.");
    assert.deepEqual(plainResult.output.citations, ["help-hours"]);
  }
});

test("invalid trusted adapter configuration is rejected before any transport is available", () => {
  const transport: ProviderTransport = async () => ({ status: 200, body: { text: "ok", citations: [] } });
  assert.throws(() => new TransportModelProvider(transport, { enabled: true, timeoutMs: 0 }), /Invalid trusted/);
  assert.throws(() => new TransportModelProvider(transport, { enabled: true, endpoint: "user-controlled" } as never), /Invalid trusted/);
});
