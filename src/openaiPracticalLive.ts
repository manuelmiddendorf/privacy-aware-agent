import { loadProtectedLocalOpenAIKey } from "./openaiKey.js";
import {
  createPracticalOpenAIBudgetLedger,
  OPENAI_PRACTICAL_MAX_REQUESTS,
  OPENAI_PRACTICAL_RUN_ID,
  OPENAI_PRACTICAL_TOTAL_EXPOSURE_USD,
  OPENAI_PRIOR_ACTUAL_USD,
  OPENAI_PRIOR_RESERVED_USD,
} from "./openaiPracticalBudget.js";
import { runOpenAIPracticalScenarios } from "./openaiPracticalScenarios.js";
import { createOpenAIResponsesTransport } from "./openaiTransport.js";
import { TransportModelProvider } from "./transportProvider.js";

if (process.env.PAA_OPENAI_PRACTICAL_P3_ENABLED !== "1") {
  throw new Error("Practical OpenAI follow-up is disabled; a separate reviewed live gate is required");
}

const budget = createPracticalOpenAIBudgetLedger();
const before = await budget.snapshot();
if (before.entries.length !== 0 || before.halted ||
    before.totalReservedExposureUsd !== OPENAI_PRIOR_RESERVED_USD) {
  throw new Error("Practical OpenAI follow-up ledger is not in its reviewed initial state");
}

const provider = new TransportModelProvider(createOpenAIResponsesTransport({
  enabled: true,
  apiKey: await loadProtectedLocalOpenAIKey(),
  budget,
}), {
  enabled: true,
  timeoutMs: 15_000,
  maxRequestBytes: 32_768,
  maxResponseBytes: 16_384,
});

const scenarios = await runOpenAIPracticalScenarios(provider);
if (scenarios.length !== OPENAI_PRACTICAL_MAX_REQUESTS ||
    scenarios.some((scenario) => !scenario.ok || scenario.providerCalls !== 1) ||
    provider.transportCallCount !== OPENAI_PRACTICAL_MAX_REQUESTS) {
  throw new Error("Practical OpenAI follow-up stopped before completing the reviewed three-call contract");
}

const after = await budget.snapshot();
if (after.entries.length !== OPENAI_PRACTICAL_MAX_REQUESTS || after.halted ||
    after.entries.some((entry) => entry.status !== "confirmed") ||
    after.totalReservedExposureUsd !== OPENAI_PRACTICAL_TOTAL_EXPOSURE_USD) {
  throw new Error("Practical OpenAI follow-up budget state is incomplete or uncertain");
}

console.log(JSON.stringify({
  runId: OPENAI_PRACTICAL_RUN_ID,
  scenarios: scenarios.map((scenario, index) => ({
    ...scenario,
    usage: after.entries[index]?.usage,
    calculatedCostUsd: after.entries[index]?.actualUsd,
  })),
  providerCalls: provider.callCount,
  transportCalls: provider.transportCallCount,
  budget: {
    priorReservedUsd: OPENAI_PRIOR_RESERVED_USD,
    priorActualUsd: OPENAI_PRIOR_ACTUAL_USD,
    practicalReservedUsd: after.reservedUsd,
    practicalActualUsd: after.confirmedActualUsd,
    cumulativeReservedExposureUsd: after.totalReservedExposureUsd,
    cumulativeCalculatedActualUsd: OPENAI_PRIOR_ACTUAL_USD + after.confirmedActualUsd,
  },
}, null, 2));
