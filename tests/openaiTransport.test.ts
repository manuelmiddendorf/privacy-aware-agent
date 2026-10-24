import assert from "node:assert/strict";
import { mkdtemp, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createExactSyntheticEvidenceAssessor } from "../src/demoEvidence.js";
import { DEMO_POLICY } from "../src/demoPolicy.js";
import { runDemoScenarios } from "../src/demoScenarios.js";
import { PrivacyAwareAgent } from "../src/orchestrator.js";
import {
  FileOpenAIBudgetLedger,
  MemoryOpenAIBudgetLedger,
  OPENAI_DEMO_MAX_REQUESTS,
  OPENAI_DEMO_MODEL,
  OPENAI_DEMO_RESERVATION_USD,
  OPENAI_DEMO_TOTAL_BUDGET_USD,
  type OpenAIBudgetLedger,
} from "../src/openaiBudget.js";
import { createOpenAIResponsesTransport, OPENAI_RESPONSES_URL } from "../src/openaiTransport.js";
import { ProviderAdapterError, TransportModelProvider } from "../src/transportProvider.js";
import type { AgentRequest } from "../src/types.js";

const ASK: AgentRequest = {
  task: "ask",
  text: "List only the approved preparation steps for the synthetic board meeting.",
  sourceIds: ["meeting-preparation"],
};

const approvedAskAgent = (provider: TransportModelProvider) =>
  new PrivacyAwareAgent(provider, undefined, createExactSyntheticEvidenceAssessor(ASK));

const responseBody = (output: { text: string; citations: string[] }, usage: unknown = {
  input_tokens: 100,
  output_tokens: 40,
  output_tokens_details: { reasoning_tokens: 0 },
}) => ({
  id: "resp_synthetic",
  status: "completed",
  model: OPENAI_DEMO_MODEL,
  service_tier: "default",
  store: false,
  usage,
  output: [{
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
  }],
});

const provider = (
  fetchImpl: typeof fetch,
  budget: OpenAIBudgetLedger = new MemoryOpenAIBudgetLedger(),
  timeoutMs = 100,
) => new TransportModelProvider(createOpenAIResponsesTransport({
  enabled: true,
  apiKey: "synthetic-test-key",
  budget,
  fetchImpl,
}), {
  enabled: true,
  timeoutMs,
  maxRequestBytes: 32_768,
  maxResponseBytes: 16_384,
});

test("OpenAI transport is independently disabled by default", async () => {
  let fetchCalls = 0;
  const transport = createOpenAIResponsesTransport({
    enabled: false,
    budget: new MemoryOpenAIBudgetLedger(),
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response();
    },
  });
  const adapter = new TransportModelProvider(transport, { enabled: true });
  const result = await approvedAskAgent(adapter).run(DEMO_POLICY, ASK);
  assert.equal(result.reasonCode, "BLOCK_PROVIDER_DISABLED");
  assert.equal(fetchCalls, 0);
});

test("fixed Responses request is stateless, tool-free, bounded and billed from strict usage", async () => {
  const budget = new MemoryOpenAIBudgetLedger();
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const adapter = provider(async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(JSON.stringify(responseBody({ text: "Synthetic answer.", citations: ["meeting-preparation"] })), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, budget);
  const result = await approvedAskAgent(adapter).run(DEMO_POLICY, ASK);
  assert.equal(result.ok, true);
  assert.equal(capturedUrl, OPENAI_RESPONSES_URL);
  assert.equal(capturedInit?.method, "POST");
  assert.equal(capturedInit?.redirect, "error");
  assert.equal((capturedInit?.headers as Record<string, string>).authorization, "Bearer synthetic-test-key");
  const request = JSON.parse(String(capturedInit?.body));
  assert.equal(request.model, OPENAI_DEMO_MODEL);
  assert.equal(request.service_tier, "default");
  assert.equal(request.store, false);
  assert.equal(request.reasoning.effort, "none");
  assert.equal(request.max_output_tokens, 256);
  assert.equal(request.truncation, "disabled");
  assert.deepEqual(request.tools, []);
  assert.equal(request.tool_choice, "none");
  assert.equal(request.metadata, undefined);
  assert.equal(request.user, undefined);
  const snapshot = await budget.snapshot();
  assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.entries[0]?.status, "confirmed");
  assert.equal(snapshot.entries[0]?.usage?.inputTokens, 100);
  assert.equal(snapshot.entries[0]?.usage?.outputTokens, 40);
  assert.equal(snapshot.halted, false);
});

test("auth rejection is redacted, makes one attempt and halts later calls", async () => {
  const budget = new MemoryOpenAIBudgetLedger();
  let fetchCalls = 0;
  const adapter = provider(async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ error: { code: "invalid_api_key", message: "must not escape" } }), {
      status: 401,
    });
  }, budget);
  const first = await approvedAskAgent(adapter).run(DEMO_POLICY, ASK);
  assert.equal(first.reasonCode, "BLOCK_PROVIDER_REJECTED");
  assert.doesNotMatch(JSON.stringify(first), /invalid_api_key|must not escape/);
  const second = await new PrivacyAwareAgent(adapter).run(DEMO_POLICY, {
    task: "draft",
    text: "Write a general synthetic invitation.",
    sourceIds: [],
  });
  assert.equal(second.reasonCode, "BLOCK_PROVIDER_BUDGET");
  assert.equal(fetchCalls, 1);
  assert.equal((await budget.snapshot()).halted, true);
});

test("timeout marks the reserved attempt uncertain and blocks a restart", async () => {
  const budget = new MemoryOpenAIBudgetLedger();
  let fetchCalls = 0;
  const adapter = provider(async (_input, init) => {
    fetchCalls += 1;
    await new Promise<void>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("synthetic abort")), { once: true });
      void resolve;
    });
    return new Response();
  }, budget, 10);
  const first = await approvedAskAgent(adapter).run(DEMO_POLICY, ASK);
  assert.equal(first.reasonCode, "BLOCK_PROVIDER_TIMEOUT");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await new PrivacyAwareAgent(adapter).run(DEMO_POLICY, {
    task: "draft",
    text: "Write a general synthetic invitation.",
    sourceIds: [],
  });
  assert.equal(second.reasonCode, "BLOCK_PROVIDER_BUDGET");
  assert.equal(fetchCalls, 1);
  assert.equal((await budget.snapshot()).halted, true);
});

test("missing or contradictory usage blocks output and stops future calls", async () => {
  const budget = new MemoryOpenAIBudgetLedger();
  let fetchCalls = 0;
  const adapter = provider(async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify(responseBody({ text: "must not pass", citations: ["meeting-preparation"] }, {
      input_tokens: 100,
    })), { status: 200 });
  }, budget);
  const first = await approvedAskAgent(adapter).run(DEMO_POLICY, ASK);
  assert.equal(first.reasonCode, "BLOCK_PROVIDER_USAGE_UNKNOWN");
  const second = await approvedAskAgent(adapter).run(DEMO_POLICY, ASK);
  assert.equal(second.reasonCode, "BLOCK_PROVIDER_BUDGET");
  assert.equal(fetchCalls, 1);
});

test("four reviewed scenarios cause exactly two sequential Responses attempts", async () => {
  let fetchCalls = 0;
  let active = 0;
  let maximumActive = 0;
  const adapter = provider(async (_input, init) => {
    fetchCalls += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    const body = JSON.parse(String(init?.body));
    const gated = JSON.parse(body.input[1].content[0].text) as { task: string; documents: { id: string }[] };
    const output = gated.task === "ask"
      ? { text: "Synthetic source-backed answer.", citations: gated.documents.map((document) => document.id) }
      : { text: "Synthetic general invitation.", citations: [] };
    active -= 1;
    return new Response(JSON.stringify(responseBody(output)), { status: 200 });
  });
  const results = await runDemoScenarios({ providerFactory: () => adapter });
  assert.deepEqual(results.map((result) => result.providerCalls), [1, 1, 0, 0]);
  assert.equal(fetchCalls, 2);
  assert.equal(maximumActive, 1);
  assert.equal(results[2]?.reasonCode, "BLOCK_HEALTH_DATA");
  assert.equal(results[3]?.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT");
});

test("abort during budget persistence is observed before fetch without an unhandled ledger rejection", async () => {
  let releaseReserve!: () => void;
  const reserveHeld = new Promise<void>((resolve) => { releaseReserve = resolve; });
  let reserveStarted!: () => void;
  const started = new Promise<void>((resolve) => { reserveStarted = resolve; });
  let uncertainCalls = 0;
  const ledger: OpenAIBudgetLedger = {
    async reserve() { reserveStarted(); await reserveHeld; },
    async confirm() { throw new Error("must not confirm"); },
    async markUncertain() { uncertainCalls += 1; throw new Error("synthetic ledger persistence failure"); },
    async snapshot() {
      return {
        reservedUsd: 0,
        confirmedActualUsd: 0,
        halted: true,
        priorReservedUsd: 0,
        totalReservedExposureUsd: 0,
        entries: [],
      };
    },
  };
  let fetchCalls = 0;
  const adapter = provider(async () => {
    fetchCalls += 1;
    return new Response();
  }, ledger);
  const cancellation = new AbortController();
  const pending = approvedAskAgent(adapter).run(DEMO_POLICY, ASK, { signal: cancellation.signal });
  await started;
  cancellation.abort();
  releaseReserve();
  const result = await pending;
  assert.equal(result.reasonCode, "BLOCK_PROVIDER_CANCELLED");
  assert.equal(fetchCalls, 0);
  assert.equal(uncertainCalls, 1);
});

test("abort during a held confirmation persists uncertainty before any restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paa-openai-confirm-race-"));
  const file = join(directory, "budget.json");
  const persistent = new FileOpenAIBudgetLedger(file);
  let releaseConfirm!: () => void;
  const confirmHeld = new Promise<void>((resolve) => { releaseConfirm = resolve; });
  let confirmStarted!: () => void;
  const confirmStart = new Promise<void>((resolve) => { confirmStarted = resolve; });
  let firstMarkAttempted!: () => void;
  const firstMarkAttempt = new Promise<void>((resolve) => { firstMarkAttempted = resolve; });
  let markCalls = 0;
  const ledger: OpenAIBudgetLedger = {
    reserve: (key) => persistent.reserve(key),
    async confirm(key, usage) {
      const lockPath = `${file}.lock`;
      const lock = await open(lockPath, "wx", 0o600);
      try {
        const state = JSON.parse(await readFile(file, "utf8")) as {
          entries: Array<Record<string, unknown>>;
        };
        const entry = state.entries.find((candidate) => candidate.requestKey === key);
        assert.ok(entry);
        entry.status = "confirmed";
        entry.actualUsd = 0.00003;
        entry.usage = usage;
        confirmStarted();
        await confirmHeld;
        await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      } finally {
        await lock.close();
        await unlink(lockPath).catch(() => undefined);
      }
    },
    async markUncertain(key) {
      markCalls += 1;
      if (markCalls === 1) firstMarkAttempted();
      await persistent.markUncertain(key);
    },
    snapshot: () => persistent.snapshot(),
  };
  const transport = createOpenAIResponsesTransport({
    enabled: true,
    apiKey: "synthetic-test-key",
    budget: ledger,
    fetchImpl: async () => new Response(JSON.stringify(responseBody({
      text: "Synthetic answer.",
      citations: ["meeting-preparation"],
    })), { status: 200 }),
  });
  const controller = new AbortController();
  const pending = transport({
    schemaVersion: 1,
    task: "ask",
    text: ASK.text,
    documents: [{
      id: "meeting-preparation",
      tenantId: "tenant-demo",
      title: "Synthetic source",
      body: "Synthetic approved source.",
    }],
  }, { signal: controller.signal });
  await confirmStart;
  controller.abort();
  await firstMarkAttempt;
  releaseConfirm();
  await assert.rejects(pending, (error) =>
    error instanceof ProviderAdapterError && error.reasonCode === "BLOCK_PROVIDER_CANCELLED");
  const restarted = new FileOpenAIBudgetLedger(file);
  await assert.rejects(() => restarted.reserve("c".repeat(64)), (error) =>
    error instanceof ProviderAdapterError && error.reasonCode === "BLOCK_PROVIDER_BUDGET");
  assert.equal((await restarted.snapshot()).halted, true);
  assert.ok(markCalls >= 2);
});

test("streaming response cap stops a body without Content-Length", async () => {
  const budget = new MemoryOpenAIBudgetLedger();
  let fetchCalls = 0;
  const adapter = provider(async () => {
    fetchCalls += 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(40_000));
        controller.enqueue(new Uint8Array(30_000));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }, budget);
  const result = await approvedAskAgent(adapter).run(DEMO_POLICY, ASK);
  assert.equal(result.reasonCode, "BLOCK_PROVIDER_RESPONSE_TOO_LARGE");
  assert.equal(fetchCalls, 1);
  assert.equal((await budget.snapshot()).halted, true);
});

test("file ledger prevents duplicate and parallel restart attempts with mode 0600", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paa-openai-budget-"));
  const file = join(directory, "budget.json");
  const first = new FileOpenAIBudgetLedger(file);
  const second = new FileOpenAIBudgetLedger(file);
  const key = "a".repeat(64);
  await first.reserve(key);
  await assert.rejects(() => second.reserve("b".repeat(64)), (error) =>
    error instanceof ProviderAdapterError && error.reasonCode === "BLOCK_PROVIDER_BUDGET");
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await second.snapshot()).halted, true);
});

test("worst-case reservation remains far below the approved total ceiling", () => {
  assert.ok(OPENAI_DEMO_RESERVATION_USD > 0);
  assert.ok(OPENAI_DEMO_RESERVATION_USD * OPENAI_DEMO_MAX_REQUESTS < 0.5);
  assert.ok(OPENAI_DEMO_RESERVATION_USD * OPENAI_DEMO_MAX_REQUESTS < OPENAI_DEMO_TOTAL_BUDGET_USD);
});
