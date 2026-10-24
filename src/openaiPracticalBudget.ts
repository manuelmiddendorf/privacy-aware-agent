import { resolve } from "node:path";
import {
  FileOpenAIBudgetLedger,
  OPENAI_DEMO_RESERVATION_USD,
  type OpenAIBudgetLedger,
  type OpenAIBudgetSnapshot,
} from "./openaiBudget.js";
import { ProviderAdapterError } from "./transportProvider.js";

export const OPENAI_PRACTICAL_RUN_ID = "paa-practical-p3-2026-10-24-v1";
export const OPENAI_PRACTICAL_MAX_REQUESTS = 3;
export const OPENAI_PRIOR_RESERVED_USD = OPENAI_DEMO_RESERVATION_USD * 2;
export const OPENAI_PRIOR_ACTUAL_USD = 0.0001069;
export const OPENAI_PRACTICAL_TOTAL_EXPOSURE_USD =
  OPENAI_PRIOR_RESERVED_USD + OPENAI_DEMO_RESERVATION_USD * OPENAI_PRACTICAL_MAX_REQUESTS;

export const OPENAI_PRIOR_LEDGER_PATH = resolve(process.cwd(), ".local/openai-live-demo-budget.json");
export const OPENAI_PRACTICAL_LEDGER_PATH = resolve(process.cwd(), ".local/openai-practical-p3-budget.json");

const PRIOR_ENTRIES = Object.freeze([
  Object.freeze({
    requestKey: "a0bfbdaefdc31d36234ca261d66796d198185324cfaf705be7e1351044034605",
    inputTokens: 224,
    outputTokens: 53,
    reasoningTokens: 0,
    actualUsd: 0.0000489,
  }),
  Object.freeze({
    requestKey: "5a8b30a3e6d92745eb479ac7a7c165db6e73a84515603028c8714f96b2186535",
    inputTokens: 180,
    outputTokens: 80,
    reasoningTokens: 0,
    actualUsd: 0.000058,
  }),
]);

const budgetError = () => new ProviderAdapterError("BLOCK_PROVIDER_BUDGET");
const near = (left: number, right: number) => Math.abs(left - right) < 1e-12;

export async function validateCompletedPriorLedger(prior: OpenAIBudgetLedger): Promise<OpenAIBudgetSnapshot> {
  const snapshot = await prior.snapshot();
  if (snapshot.halted || snapshot.entries.length !== PRIOR_ENTRIES.length ||
      !near(snapshot.reservedUsd, OPENAI_PRIOR_RESERVED_USD) ||
      !near(snapshot.totalReservedExposureUsd, OPENAI_PRIOR_RESERVED_USD) ||
      !near(snapshot.confirmedActualUsd, OPENAI_PRIOR_ACTUAL_USD)) {
    throw budgetError();
  }
  for (let index = 0; index < PRIOR_ENTRIES.length; index += 1) {
    const actual = snapshot.entries[index];
    const expected = PRIOR_ENTRIES[index]!;
    if (!actual || actual.status !== "confirmed" || actual.requestKey !== expected.requestKey ||
        !near(actual.reservedUsd, OPENAI_DEMO_RESERVATION_USD) ||
        !near(actual.actualUsd ?? Number.NaN, expected.actualUsd) ||
        actual.usage?.inputTokens !== expected.inputTokens ||
        actual.usage.outputTokens !== expected.outputTokens ||
        actual.usage.reasoningTokens !== expected.reasoningTokens) {
      throw budgetError();
    }
  }
  return snapshot;
}

export interface PracticalBudgetPaths {
  priorLedgerPath: string;
  practicalLedgerPath: string;
}

export function createPracticalOpenAIBudgetLedger(paths: PracticalBudgetPaths = {
  priorLedgerPath: OPENAI_PRIOR_LEDGER_PATH,
  practicalLedgerPath: OPENAI_PRACTICAL_LEDGER_PATH,
}): FileOpenAIBudgetLedger {
  const prior = new FileOpenAIBudgetLedger(paths.priorLedgerPath);
  return new FileOpenAIBudgetLedger(paths.practicalLedgerPath, {
    runId: OPENAI_PRACTICAL_RUN_ID,
    maxRequests: OPENAI_PRACTICAL_MAX_REQUESTS,
    priorReservedUsd: OPENAI_PRIOR_RESERVED_USD,
    validatePrior: async () => { await validateCompletedPriorLedger(prior); },
  });
}
