import assert from "node:assert/strict";
import test from "node:test";
import {
  OllamaAdapterError,
  OllamaResearchAdapter,
  createLoopbackOllamaTransport,
  P6_OLLAMA_MANIFEST_SHA256,
  P6_OLLAMA_MODEL,
  P6_OLLAMA_URL,
  type OllamaResearchTransport,
} from "../src/ollamaResearchAdapter.js";
import type { LocalResearchModelInput } from "../src/localResearchTypes.js";

const INPUT: LocalResearchModelInput = {
  originalText: "Talea Fantasie möchte ihre Vertragsstunden ändern.",
  language: "de",
  purpose: "GENERAL_WORKING_TIME_RESEARCH",
  authorizedIdentifiers: [{ subjectId: "person-talea", type: "person_name", value: "Talea Fantasie" }],
};

const config = (overrides = {}) => ({
  enabled: true,
  verifiedManifestSha256: P6_OLLAMA_MANIFEST_SHA256,
  timeoutMs: 100,
  maxRequestBytes: 32_768,
  maxResponseBytes: 8_192,
  ...overrides,
});

const successBody = JSON.stringify({
  model: P6_OLLAMA_MODEL,
  done: true,
  done_reason: "stop",
  message: {
    role: "assistant",
    content: JSON.stringify({
      schemaVersion: 1,
      decision: "generalize",
      researchIntent: "WORKING_TIME_CHANGE",
      jurisdiction: "DE",
      language: "de",
    }),
  },
});

test("fixed loopback request pins model, non-streaming schema and contains no tools or cloud fallback", async () => {
  let captured: Parameters<OllamaResearchTransport>[0] | undefined;
  const adapter = new OllamaResearchAdapter(async (request) => {
    captured = request;
    return { status: 200, body: successBody };
  }, config());
  const result = await adapter.classify(INPUT);
  assert.equal(adapter.callCount, 1);
  assert.equal(adapter.transportCallCount, 1);
  assert.equal(captured?.url, P6_OLLAMA_URL);
  const body = JSON.parse(captured?.body ?? "null");
  assert.equal(body.model, P6_OLLAMA_MODEL);
  assert.equal(body.stream, false);
  assert.equal(body.think, false);
  assert.equal(body.keep_alive, 0);
  assert.equal(body.tools, undefined);
  assert.equal(body.format.additionalProperties, false);
  assert.equal(body.messages[1].content.includes(INPUT.originalText), true);
  assert.deepEqual(result, {
    schemaVersion: 1,
    decision: "generalize",
    researchIntent: "WORKING_TIME_CHANGE",
    jurisdiction: "DE",
    language: "de",
  });
});

test("disabled or unverified manifests make zero transport calls", async () => {
  for (const override of [
    { enabled: false },
    { verifiedManifestSha256: "0".repeat(64) },
  ]) {
    let calls = 0;
    const adapter = new OllamaResearchAdapter(async () => {
      calls += 1;
      return { status: 200, body: successBody };
    }, config(override));
    await assert.rejects(adapter.classify(INPUT), OllamaAdapterError);
    assert.equal(calls, 0);
    assert.equal(adapter.transportCallCount, 0);
  }
});

test("invalid inputs and oversized requests stop before transport", async () => {
  let calls = 0;
  const transport: OllamaResearchTransport = async () => {
    calls += 1;
    return { status: 200, body: successBody };
  };
  const invalid = new OllamaResearchAdapter(transport, config());
  await assert.rejects(invalid.classify({ ...INPUT, purpose: "OTHER" } as never), /INPUT_INVALID/);
  const oversized = new OllamaResearchAdapter(transport, config({ maxRequestBytes: 64 }));
  await assert.rejects(oversized.classify(INPUT), /REQUEST_TOO_LARGE/);
  assert.equal(calls, 0);
});

test("timeout aborts and returns even when an injected transport ignores abort", async () => {
  let signal: AbortSignal | undefined;
  const adapter = new OllamaResearchAdapter(async (_request, options) => {
    signal = options.signal;
    return await new Promise(() => {});
  }, config({ timeoutMs: 10 }));
  const started = Date.now();
  await assert.rejects(adapter.classify(INPUT), /TIMEOUT/);
  assert.equal(signal?.aborted, true);
  assert.ok(Date.now() - started < 500);
  assert.equal(adapter.transportCallCount, 1);
});

test("caller cancellation before start makes zero calls and during transport discards the result", async () => {
  const before = new AbortController();
  before.abort();
  const beforeAdapter = new OllamaResearchAdapter(async () => ({ status: 200, body: successBody }), config());
  await assert.rejects(beforeAdapter.classify(INPUT, { signal: before.signal }), /CANCELLED/);
  assert.equal(beforeAdapter.callCount, 0);
  assert.equal(beforeAdapter.transportCallCount, 0);

  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const transportStarted = new Promise<void>((resolve) => { started = resolve; });
  const during = new AbortController();
  const duringAdapter = new OllamaResearchAdapter(async () => {
    started();
    await held;
    return { status: 200, body: successBody };
  }, config());
  const pending = duringAdapter.classify(INPUT, { signal: during.signal });
  await transportStarted;
  during.abort();
  release();
  await assert.rejects(pending, /CANCELLED/);
});

test("invalid, oversized and non-200 responses fail once without retries", async () => {
  const responses = [
    { status: 503, body: "{}" },
    { status: 200, body: "not json" },
    { status: 200, body: JSON.stringify({ message: { role: "assistant", content: "not json" } }) },
    { status: 200, body: JSON.stringify({ model: P6_OLLAMA_MODEL, done: false, message: { role: "assistant", content: "{}" } }) },
    { status: 200, body: JSON.stringify({ model: "qwen3:latest", done: true, done_reason: "stop", message: { role: "assistant", content: "{}" } }) },
    { status: 200, body: JSON.stringify({ model: P6_OLLAMA_MODEL, done: true, done_reason: "length", message: { role: "assistant", content: "{}" } }) },
    { status: 200, body: "x".repeat(8_193) },
  ];
  for (const response of responses) {
    let calls = 0;
    const adapter = new OllamaResearchAdapter(async () => {
      calls += 1;
      return response;
    }, config());
    await assert.rejects(adapter.classify(INPUT), OllamaAdapterError);
    assert.equal(calls, 1);
    assert.equal(adapter.transportCallCount, 1);
  }
});

test("a synchronous transport failure is contained and cleans up its timeout", async () => {
  const adapter = new OllamaResearchAdapter(() => {
    throw new Error("synthetic synchronous failure");
  }, config({ timeoutMs: 10 }));
  await assert.rejects(adapter.classify(INPUT), /TRANSPORT/);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(adapter.transportCallCount, 1);
});

test("response cap does not wait indefinitely for stream cancellation", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("12345"));
    },
    cancel() {
      return new Promise(() => {});
    },
  });
  const transport = createLoopbackOllamaTransport(async () => new Response(stream, { status: 200 }));
  const started = Date.now();
  await assert.rejects(transport({
    url: P6_OLLAMA_URL,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }, { signal: new AbortController().signal, maxResponseBytes: 4 }), /RESPONSE_TOO_LARGE/);
  assert.ok(Date.now() - started < 500);
});

test("input is snapshotted before the transport await", async () => {
  let release!: () => void;
  let capturedBody = "";
  const held = new Promise<void>((resolve) => { release = resolve; });
  const mutable = {
    ...INPUT,
    authorizedIdentifiers: INPUT.authorizedIdentifiers.map((identifier) => ({ ...identifier })),
  };
  const adapter = new OllamaResearchAdapter(async (request) => {
    capturedBody = request.body;
    await held;
    return { status: 200, body: successBody };
  }, config());
  const pending = adapter.classify(mutable);
  mutable.originalText = "mutated private text";
  mutable.authorizedIdentifiers[0]!.value = "Changed Person";
  release();
  await pending;
  assert.match(capturedBody, /Talea Fantasie/);
  assert.doesNotMatch(capturedBody, /mutated private text|Changed Person/);
});
