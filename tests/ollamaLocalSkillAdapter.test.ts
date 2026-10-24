import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  OllamaLocalSkillAdapter,
  P7_GENERATION_OUTPUT_TOKENS,
  P7_MAX_HTTP_REQUEST_BYTES,
  P7_MAX_MODEL_PROMPT_BYTES,
  P7_OLLAMA_NUM_CTX,
  P7_PROMPT_CONFIG_CANONICAL,
  P7_PROMPT_CONFIGS,
  type TrustedP7OllamaConfig,
} from "../src/ollamaLocalSkillAdapter.js";
import {
  OllamaAdapterError,
  P6_OLLAMA_MANIFEST_SHA256,
  P6_OLLAMA_MODEL,
  P6_OLLAMA_URL,
  type OllamaResearchTransport,
} from "../src/ollamaResearchAdapter.js";
import type { LocalSkillDocumentSnapshot, LocalSkillGenerationInput, LocalSkillProposalInput } from "../src/localSkillTypes.js";

const DOCUMENT: LocalSkillDocumentSnapshot = {
  id: "inline-1",
  title: "Synthetic note",
  kind: "INLINE_SYNTHETIC",
  sectionLabel: "Abschnitt 1",
  paragraphs: [{ id: "inline-1:p01", text: "Synthetic paragraph.", ordinal: 1 }],
};
const PROPOSAL_INPUT: LocalSkillProposalInput = {
  requestText: "Write a synthetic note.",
  documents: [DOCUMENT],
  executableSkillIds: ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"],
};
const GENERATION_INPUT: LocalSkillGenerationInput = {
  skillIds: ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"],
  requestText: "Explain and draft.",
  documents: [DOCUMENT],
};

const config = (overrides: Partial<TrustedP7OllamaConfig> = {}): TrustedP7OllamaConfig => ({
  enabled: true,
  verifiedManifestSha256: P6_OLLAMA_MANIFEST_SHA256,
  promptConfigId: "P7_SKILLS_A",
  timeoutMs: 100,
  maxRequestBytes: P7_MAX_HTTP_REQUEST_BYTES,
  maxResponseBytes: 8_192,
  maxOutputTokens: P7_GENERATION_OUTPUT_TOKENS,
  ...overrides,
});

const envelope = (content: unknown, overrides: Record<string, unknown> = {}) => JSON.stringify({
  model: P6_OLLAMA_MODEL,
  done: true,
  done_reason: "stop",
  message: { role: "assistant", content: JSON.stringify(content) },
  ...overrides,
});

test("both prompt configurations are distinct, frozen and match the checked-in hashes", async () => {
  const configured = JSON.parse(await readFile("config/p7-prompt-configs.json", "utf8")) as {
    configurations: { id: keyof typeof P7_PROMPT_CONFIG_CANONICAL; canonicalPromptSha256: string }[];
  };
  const actual = Object.fromEntries(Object.entries(P7_PROMPT_CONFIG_CANONICAL).map(([id, value]) =>
    [id, createHash("sha256").update(value).digest("hex")]));
  assert.deepEqual(configured.configurations.map(({ id, canonicalPromptSha256 }) => ({ id, canonicalPromptSha256 })), [
    { id: "P7_SKILLS_A", canonicalPromptSha256: actual.P7_SKILLS_A },
    { id: "P7_SKILLS_B", canonicalPromptSha256: actual.P7_SKILLS_B },
  ]);
  assert.notEqual(actual.P7_SKILLS_A, actual.P7_SKILLS_B);
  assert.notEqual(P7_PROMPT_CONFIGS.P7_SKILLS_A.proposalSystem, P7_PROMPT_CONFIGS.P7_SKILLS_B.proposalSystem);
});

test("proposal uses the pinned loopback request and identical budgets for both fixed prompts", async () => {
  for (const promptConfigId of ["P7_SKILLS_A", "P7_SKILLS_B"] as const) {
    let captured: Parameters<OllamaResearchTransport>[0] | undefined;
    const adapter = new OllamaLocalSkillAdapter(async (request) => {
      captured = request;
      return { status: 200, body: envelope({ schemaVersion: 1, decision: "select", skillIds: ["TEXT_COMPOSITION"], clarificationCode: null }) };
    }, config({ promptConfigId }));
    assert.deepEqual(await adapter.propose(PROPOSAL_INPUT),
      { schemaVersion: 1, decision: "select", skillIds: ["TEXT_COMPOSITION"], clarificationCode: null });
    assert.equal(captured?.url, P6_OLLAMA_URL);
    const body = JSON.parse(captured?.body ?? "null");
    assert.equal(body.model, P6_OLLAMA_MODEL);
    assert.equal(body.stream, false);
    assert.equal(body.think, false);
    assert.equal(body.keep_alive, 0);
    assert.equal(body.tools, undefined);
    assert.deepEqual(body.options, { temperature: 0, seed: 29, num_ctx: P7_OLLAMA_NUM_CTX, num_predict: 128 });
    assert.equal(body.messages[0].content, P7_PROMPT_CONFIGS[promptConfigId].proposalSystem);
    assert.equal(body.format.additionalProperties, false);
    assert.equal(adapter.transportCallCount, 1);
  }
});

test("one generation call has the exact fixed pair schema and no tool or action channel", async () => {
  let captured = "";
  const adapter = new OllamaLocalSkillAdapter(async (request) => {
    captured = request.body;
    return { status: 200, body: envelope({
      schemaVersion: 1,
      parts: [
        { skillId: "DOCUMENT_UNDERSTANDING", kind: "answer", text: "Synthetic answer", citationParagraphIds: ["inline-1:p01"] },
        { skillId: "TEXT_COMPOSITION", kind: "draft", text: "Synthetic draft", citationParagraphIds: [] },
      ],
    }) };
  }, config());
  await adapter.generate(GENERATION_INPUT);
  const body = JSON.parse(captured);
  assert.deepEqual(body.options, { temperature: 0, seed: 29, num_ctx: P7_OLLAMA_NUM_CTX, num_predict: P7_GENERATION_OUTPUT_TOKENS });
  assert.deepEqual(body.format.properties.parts.prefixItems.map((item: { properties: { skillId: { const: string } } }) => item.properties.skillId.const),
    ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"]);
  assert.equal(body.tools, undefined);
  assert.equal(adapter.generationCallCount, 1);
  assert.equal(adapter.transportCallCount, 1);
});

test("disabled, unverified and oversized requests make zero transport calls", async () => {
  for (const override of [
    { enabled: false },
    { verifiedManifestSha256: "0".repeat(64) },
    { maxRequestBytes: 32 },
  ]) {
    let calls = 0;
    const adapter = new OllamaLocalSkillAdapter(async () => {
      calls += 1;
      return { status: 200, body: envelope({}) };
    }, config(override));
    await assert.rejects(adapter.propose(PROPOSAL_INPUT), OllamaAdapterError);
    assert.equal(calls, 0);
    assert.equal(adapter.transportCallCount, 0);
  }
});

test("inherited prompt keys and model-context overflow fail before transport", async () => {
  const noop: OllamaResearchTransport = async () => {
    throw new Error("must not run");
  };
  for (const promptConfigId of ["constructor", "__proto__"] as const) {
    assert.throws(() => new OllamaLocalSkillAdapter(noop, config({
      promptConfigId: promptConfigId as unknown as TrustedP7OllamaConfig["promptConfigId"],
    })), /invalid P7 Ollama config/);
  }

  let calls = 0;
  const adapter = new OllamaLocalSkillAdapter(async () => {
    calls += 1;
    return { status: 200, body: envelope({}) };
  }, config());
  const oversized: LocalSkillProposalInput = {
    ...PROPOSAL_INPUT,
    requestText: "x".repeat(P7_MAX_MODEL_PROMPT_BYTES),
  };
  await assert.rejects(adapter.propose(oversized), /REQUEST_TOO_LARGE/);
  assert.equal(calls, 0);
  assert.equal(adapter.transportCallCount, 0);
});

test("timeout and caller abort stop even when the injected transport ignores abort", async () => {
  const adapter = new OllamaLocalSkillAdapter(async () => await new Promise(() => {}), config({ timeoutMs: 10 }));
  await assert.rejects(adapter.propose(PROPOSAL_INPUT), /TIMEOUT/);

  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const controller = new AbortController();
  const heldAdapter = new OllamaLocalSkillAdapter(async () => {
    await held;
    return { status: 200, body: envelope({ schemaVersion: 1, decision: "clarify", skillIds: [], clarificationCode: "NEED_TASK_OR_SOURCE" }) };
  }, config());
  const pending = heldAdapter.propose(PROPOSAL_INPUT, { signal: controller.signal });
  controller.abort();
  release();
  await assert.rejects(pending, /CANCELLED/);
});

test("incomplete envelopes and synchronous transport errors fail once without retry", async () => {
  for (const body of [
    envelope({}, { done: false }),
    envelope({}, { done_reason: "length" }),
    envelope({}, { model: "qwen3:latest" }),
    "not-json",
  ]) {
    let calls = 0;
    const adapter = new OllamaLocalSkillAdapter(async () => {
      calls += 1;
      return { status: 200, body };
    }, config());
    await assert.rejects(adapter.propose(PROPOSAL_INPUT), OllamaAdapterError);
    assert.equal(calls, 1);
  }
  let syncCalls = 0;
  const sync = new OllamaLocalSkillAdapter(() => {
    syncCalls += 1;
    throw new Error("synthetic sync failure");
  }, config());
  await assert.rejects(sync.propose(PROPOSAL_INPUT), /TRANSPORT/);
  assert.equal(syncCalls, 1);
});

test("adapter contains no second fetch engine and snapshots input before transport", async () => {
  const source = await readFile("src/ollamaLocalSkillAdapter.ts", "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  let captured = "";
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const mutable = JSON.parse(JSON.stringify(PROPOSAL_INPUT)) as LocalSkillProposalInput;
  const adapter = new OllamaLocalSkillAdapter(async (request) => {
    captured = request.body;
    await held;
    return { status: 200, body: envelope({ schemaVersion: 1, decision: "select", skillIds: ["TEXT_COMPOSITION"], clarificationCode: null }) };
  }, config());
  const pending = adapter.propose(mutable);
  (mutable as { requestText: string }).requestText = "mutated";
  release();
  await pending;
  assert.match(captured, /Write a synthetic note/);
  assert.doesNotMatch(captured, /mutated/);
});
