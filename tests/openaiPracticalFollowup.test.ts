import assert from "node:assert/strict";
import { mkdtemp, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileOpenAIBudgetLedger,
  OPENAI_DEMO_RESERVATION_USD,
} from "../src/openaiBudget.js";
import {
  createPracticalOpenAIBudgetLedger,
  OPENAI_PRACTICAL_MAX_REQUESTS,
  OPENAI_PRACTICAL_RUN_ID,
  OPENAI_PRACTICAL_TOTAL_EXPOSURE_USD,
  OPENAI_PRIOR_RESERVED_USD,
} from "../src/openaiPracticalBudget.js";
import {
  OPENAI_PRACTICAL_SCENARIOS,
  runOpenAIPracticalScenarios,
} from "../src/openaiPracticalScenarios.js";
import { ProviderAdapterError } from "../src/transportProvider.js";
import type { ModelProvider, ProviderInput, ProviderOutput } from "../src/types.js";

const PRIOR = [
  {
    key: "a0bfbdaefdc31d36234ca261d66796d198185324cfaf705be7e1351044034605",
    usage: { inputTokens: 224, outputTokens: 53, reasoningTokens: 0 },
  },
  {
    key: "5a8b30a3e6d92745eb479ac7a7c165db6e73a84515603028c8714f96b2186535",
    usage: { inputTokens: 180, outputTokens: 80, reasoningTokens: 0 },
  },
] as const;

async function seedPrior(path: string) {
  const ledger = new FileOpenAIBudgetLedger(path);
  for (const entry of PRIOR) {
    await ledger.reserve(entry.key);
    await ledger.confirm(entry.key, entry.usage);
  }
}

async function paths() {
  const directory = await mkdtemp(join(tmpdir(), "paa-openai-p3-"));
  return {
    priorLedgerPath: join(directory, "prior.json"),
    practicalLedgerPath: join(directory, "p3.json"),
  };
}

const budgetBlocked = (error: unknown) =>
  error instanceof ProviderAdapterError && error.reasonCode === "BLOCK_PROVIDER_BUDGET";

test("the P3 ledger counts the immutable prior run, caps at three, and blocks restart", async () => {
  const filePaths = await paths();
  await seedPrior(filePaths.priorLedgerPath);
  const ledger = createPracticalOpenAIBudgetLedger(filePaths);
  const before = await ledger.snapshot();
  assert.equal(before.priorReservedUsd, OPENAI_PRIOR_RESERVED_USD);
  assert.equal(before.totalReservedExposureUsd, OPENAI_PRIOR_RESERVED_USD);
  for (let index = 0; index < OPENAI_PRACTICAL_MAX_REQUESTS; index += 1) {
    const key = String(index + 1).repeat(64);
    await ledger.reserve(key);
    await ledger.confirm(key, { inputTokens: 100 + index, outputTokens: 20, reasoningTokens: 0 });
  }
  const after = await ledger.snapshot();
  assert.equal(after.entries.length, 3);
  assert.equal(after.halted, false);
  assert.ok(Math.abs(after.totalReservedExposureUsd - OPENAI_PRACTICAL_TOTAL_EXPOSURE_USD) < 1e-12);
  assert.ok(after.totalReservedExposureUsd < 5);
  assert.equal((await stat(filePaths.practicalLedgerPath)).mode & 0o777, 0o600);

  const restarted = createPracticalOpenAIBudgetLedger(filePaths);
  await assert.rejects(() => restarted.reserve("f".repeat(64)), budgetBlocked);
});

test("missing, unfinished, uncertain, changed, or concurrently locked prior state fails closed", async () => {
  const missing = await paths();
  await assert.rejects(() => createPracticalOpenAIBudgetLedger(missing).snapshot(), budgetBlocked);

  const unfinished = await paths();
  const unfinishedPrior = new FileOpenAIBudgetLedger(unfinished.priorLedgerPath);
  await unfinishedPrior.reserve(PRIOR[0].key);
  await assert.rejects(() => createPracticalOpenAIBudgetLedger(unfinished).reserve("a".repeat(64)), budgetBlocked);

  const uncertain = await paths();
  await seedPrior(uncertain.priorLedgerPath);
  await new FileOpenAIBudgetLedger(uncertain.priorLedgerPath).markUncertain(PRIOR[1].key);
  await assert.rejects(() => createPracticalOpenAIBudgetLedger(uncertain).reserve("b".repeat(64)), budgetBlocked);

  const changed = await paths();
  await seedPrior(changed.priorLedgerPath);
  const changedState = JSON.parse(await readFile(changed.priorLedgerPath, "utf8")) as {
    entries: Array<{ usage: { inputTokens: number } }>;
  };
  changedState.entries[0]!.usage.inputTokens += 1;
  await writeFile(changed.priorLedgerPath, `${JSON.stringify(changedState, null, 2)}\n`, { mode: 0o600 });
  await assert.rejects(() => createPracticalOpenAIBudgetLedger(changed).snapshot(), budgetBlocked);

  const locked = await paths();
  await seedPrior(locked.priorLedgerPath);
  const lockPath = `${locked.priorLedgerPath}.lock`;
  const lock = await open(lockPath, "wx", 0o600);
  try {
    await assert.rejects(() => createPracticalOpenAIBudgetLedger(locked).reserve("c".repeat(64)), budgetBlocked);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
});

test("parallel starts cannot both reserve the P3 ledger", async () => {
  const filePaths = await paths();
  await seedPrior(filePaths.priorLedgerPath);
  const first = createPracticalOpenAIBudgetLedger(filePaths);
  const second = createPracticalOpenAIBudgetLedger(filePaths);
  const attempts = await Promise.allSettled([
    first.reserve("d".repeat(64)),
    second.reserve("e".repeat(64)),
  ]);
  assert.equal(attempts.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((entry) => entry.status === "rejected").length, 1);
});

test("the compiled P3 scenarios run sequentially and contain only P01-P03", async () => {
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  const provider: ModelProvider = {
    name: "SYNTHETIC_P3_DOUBLE",
    get callCount() { return calls; },
    async generate(input: ProviderInput): Promise<ProviderOutput> {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      if (input.task === "ask") {
        return { text: "Link the relevant documents. Send the invitation.", citations: ["meeting-preparation"] };
      }
      if (input.task === "draft") {
        return { text: "Please bring reusable cups to our community picnic at [Location] on [Date]. Thank you!", citations: [] };
      }
      return { text: "- Arrange the chairs and place reusable cups near the entrance.\n- Return the chairs afterwards.", citations: [] };
    },
  };
  assert.deepEqual(OPENAI_PRACTICAL_SCENARIOS.map((scenario) => scenario.id), ["P01", "P02", "P03"]);
  const results = await runOpenAIPracticalScenarios(provider);
  assert.equal(results.length, 3);
  assert.equal(calls, 3);
  assert.equal(maximumActive, 1);
  assert.ok(results.every((result) => result.ok && result.providerCalls === 1 && result.qualityPassed));
  assert.ok(results.every((result) => Number.isFinite(result.endToEndLatencyMs) && result.endToEndLatencyMs >= 0));
});

test("the compiled run contract remains fixed and conservatively below the cumulative ceiling", () => {
  assert.equal(OPENAI_PRACTICAL_RUN_ID, "paa-practical-p3-2026-10-24-v1");
  assert.equal(OPENAI_PRACTICAL_MAX_REQUESTS, 3);
  assert.ok(Math.abs(OPENAI_PRACTICAL_TOTAL_EXPOSURE_USD -
    (OPENAI_PRIOR_RESERVED_USD + OPENAI_DEMO_RESERVATION_USD * 3)) < 1e-12);
  assert.ok(OPENAI_PRACTICAL_TOTAL_EXPOSURE_USD < 5);
});
