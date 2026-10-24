import { chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { ProviderAdapterError } from "./transportProvider.js";

export const OPENAI_DEMO_MODEL = "gpt-6-luna";
export const OPENAI_DEMO_STANDARD_INPUT_USD_PER_MILLION = 0.10;
export const OPENAI_DEMO_STANDARD_OUTPUT_USD_PER_MILLION = 0.50;
export const OPENAI_DEMO_LONG_INPUT_USD_PER_MILLION = 0.20;
export const OPENAI_DEMO_LONG_OUTPUT_USD_PER_MILLION = 0.75;
export const OPENAI_DEMO_LONG_CONTEXT_THRESHOLD = 272_000;
export const OPENAI_DEMO_MAX_OUTPUT_TOKENS = 256;
export const OPENAI_DEMO_MAX_INPUT_TOKENS = 1_050_000 - OPENAI_DEMO_MAX_OUTPUT_TOKENS;
export const OPENAI_DEMO_MAX_REQUESTS = 2;
export const OPENAI_DEMO_TOTAL_BUDGET_USD = 5;

export const calculateOpenAICostUsd = (inputTokens: number, outputTokens: number) => {
  const longContext = inputTokens > OPENAI_DEMO_LONG_CONTEXT_THRESHOLD;
  const inputRate = longContext
    ? OPENAI_DEMO_LONG_INPUT_USD_PER_MILLION
    : OPENAI_DEMO_STANDARD_INPUT_USD_PER_MILLION;
  const outputRate = longContext
    ? OPENAI_DEMO_LONG_OUTPUT_USD_PER_MILLION
    : OPENAI_DEMO_STANDARD_OUTPUT_USD_PER_MILLION;
  return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
};

export const OPENAI_DEMO_RESERVATION_USD =
  (OPENAI_DEMO_MAX_INPUT_TOKENS * OPENAI_DEMO_LONG_INPUT_USD_PER_MILLION +
    OPENAI_DEMO_MAX_OUTPUT_TOKENS * OPENAI_DEMO_LONG_OUTPUT_USD_PER_MILLION) / 1_000_000;

export interface OpenAIUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

type EntryStatus = "reserved" | "confirmed" | "uncertain";

export interface BudgetEntry {
  requestKey: string;
  reservedUsd: number;
  status: EntryStatus;
  actualUsd?: number;
  usage?: OpenAIUsage;
}

interface BudgetState {
  schemaVersion: 1;
  model: typeof OPENAI_DEMO_MODEL;
  standardInputUsdPerMillion: number;
  standardOutputUsdPerMillion: number;
  longInputUsdPerMillion: number;
  longOutputUsdPerMillion: number;
  longContextThreshold: number;
  budgetUsd: number;
  maxRequests: number;
  runId?: string;
  priorReservedUsd?: number;
  entries: BudgetEntry[];
}

export interface OpenAIBudgetSnapshot {
  reservedUsd: number;
  confirmedActualUsd: number;
  halted: boolean;
  priorReservedUsd: number;
  totalReservedExposureUsd: number;
  entries: readonly Readonly<BudgetEntry>[];
}

export interface OpenAIBudgetLedger {
  reserve(requestKey: string): Promise<void>;
  confirm(requestKey: string, usage: OpenAIUsage): Promise<void>;
  markUncertain(requestKey: string): Promise<void>;
  snapshot(): Promise<OpenAIBudgetSnapshot>;
}

export interface FileOpenAIBudgetContract {
  runId: string;
  maxRequests: number;
  priorReservedUsd: number;
  validatePrior?: () => Promise<void>;
}

interface NormalizedBudgetContract {
  runId?: string;
  maxRequests: number;
  priorReservedUsd: number;
  validatePrior?: () => Promise<void>;
}

const defaultContract = (): NormalizedBudgetContract => ({
  maxRequests: OPENAI_DEMO_MAX_REQUESTS,
  priorReservedUsd: 0,
});

function normalizeContract(value?: FileOpenAIBudgetContract): NormalizedBudgetContract {
  if (value === undefined) return defaultContract();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value.runId) ||
      !Number.isInteger(value.maxRequests) || value.maxRequests < 1 || value.maxRequests > 16 ||
      !Number.isFinite(value.priorReservedUsd) || value.priorReservedUsd < 0 ||
      value.priorReservedUsd > OPENAI_DEMO_TOTAL_BUDGET_USD ||
      (value.validatePrior !== undefined && typeof value.validatePrior !== "function")) {
    throw new Error("Invalid trusted OpenAI budget contract");
  }
  return Object.freeze({
    runId: value.runId,
    maxRequests: value.maxRequests,
    priorReservedUsd: value.priorReservedUsd,
    ...(value.validatePrior ? { validatePrior: value.validatePrior } : {}),
  });
}

const freshState = (contract: NormalizedBudgetContract = defaultContract()): BudgetState => ({
  schemaVersion: 1,
  model: OPENAI_DEMO_MODEL,
  standardInputUsdPerMillion: OPENAI_DEMO_STANDARD_INPUT_USD_PER_MILLION,
  standardOutputUsdPerMillion: OPENAI_DEMO_STANDARD_OUTPUT_USD_PER_MILLION,
  longInputUsdPerMillion: OPENAI_DEMO_LONG_INPUT_USD_PER_MILLION,
  longOutputUsdPerMillion: OPENAI_DEMO_LONG_OUTPUT_USD_PER_MILLION,
  longContextThreshold: OPENAI_DEMO_LONG_CONTEXT_THRESHOLD,
  budgetUsd: OPENAI_DEMO_TOTAL_BUDGET_USD,
  maxRequests: contract.maxRequests,
  ...(contract.runId ? { runId: contract.runId, priorReservedUsd: contract.priorReservedUsd } : {}),
  entries: [],
});

const budgetError = () => new ProviderAdapterError("BLOCK_PROVIDER_BUDGET");
const usageError = () => new ProviderAdapterError("BLOCK_PROVIDER_USAGE_UNKNOWN");

function validUsage(value: OpenAIUsage): boolean {
  return Number.isSafeInteger(value.inputTokens) && value.inputTokens >= 0 &&
    Number.isSafeInteger(value.outputTokens) && value.outputTokens >= 0 &&
    Number.isSafeInteger(value.reasoningTokens) && value.reasoningTokens >= 0 &&
    value.reasoningTokens <= value.outputTokens &&
    value.inputTokens <= OPENAI_DEMO_MAX_INPUT_TOKENS &&
    value.outputTokens <= OPENAI_DEMO_MAX_OUTPUT_TOKENS;
}

function validateState(value: unknown, contract: NormalizedBudgetContract): BudgetState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw budgetError();
  const state = value as Partial<BudgetState>;
  if (state.schemaVersion !== 1 || state.model !== OPENAI_DEMO_MODEL ||
      state.standardInputUsdPerMillion !== OPENAI_DEMO_STANDARD_INPUT_USD_PER_MILLION ||
      state.standardOutputUsdPerMillion !== OPENAI_DEMO_STANDARD_OUTPUT_USD_PER_MILLION ||
      state.longInputUsdPerMillion !== OPENAI_DEMO_LONG_INPUT_USD_PER_MILLION ||
      state.longOutputUsdPerMillion !== OPENAI_DEMO_LONG_OUTPUT_USD_PER_MILLION ||
      state.longContextThreshold !== OPENAI_DEMO_LONG_CONTEXT_THRESHOLD ||
      state.budgetUsd !== OPENAI_DEMO_TOTAL_BUDGET_USD ||
      state.maxRequests !== contract.maxRequests ||
      state.runId !== contract.runId ||
      (state.priorReservedUsd ?? 0) !== contract.priorReservedUsd ||
      !Array.isArray(state.entries)) {
    throw budgetError();
  }
  for (const entry of state.entries) {
    if (!entry || typeof entry !== "object" || typeof entry.requestKey !== "string" ||
        typeof entry.reservedUsd !== "number" || entry.reservedUsd !== OPENAI_DEMO_RESERVATION_USD ||
        !["reserved", "confirmed", "uncertain"].includes(entry.status)) throw budgetError();
  }
  return state as BudgetState;
}

function snapshotState(state: BudgetState): OpenAIBudgetSnapshot {
  const reservedUsd = state.entries.reduce((sum, entry) => sum + entry.reservedUsd, 0);
  const priorReservedUsd = state.priorReservedUsd ?? 0;
  return {
    reservedUsd,
    confirmedActualUsd: state.entries.reduce((sum, entry) => sum + (entry.actualUsd ?? 0), 0),
    halted: state.entries.some((entry) => entry.status === "reserved" || entry.status === "uncertain"),
    priorReservedUsd,
    totalReservedExposureUsd: priorReservedUsd + reservedUsd,
    entries: state.entries.map((entry) => entry.usage ? { ...entry, usage: { ...entry.usage } } : { ...entry }),
  };
}

function reserveInState(state: BudgetState, requestKey: string): void {
  if (!/^[a-f0-9]{64}$/.test(requestKey) || state.entries.some((entry) => entry.requestKey === requestKey) ||
      state.entries.some((entry) => entry.status !== "confirmed") || state.entries.length >= state.maxRequests) {
    throw budgetError();
  }
  const reserved = state.entries.reduce((sum, entry) => sum + entry.reservedUsd, 0);
  if ((state.priorReservedUsd ?? 0) + reserved + OPENAI_DEMO_RESERVATION_USD > state.budgetUsd) {
    throw budgetError();
  }
  state.entries.push({ requestKey, reservedUsd: OPENAI_DEMO_RESERVATION_USD, status: "reserved" });
}

function confirmInState(state: BudgetState, requestKey: string, usage: OpenAIUsage): void {
  const entry = state.entries.find((candidate) => candidate.requestKey === requestKey);
  if (!entry || entry.status !== "reserved") throw usageError();
  const actualUsd = validUsage(usage) ? calculateOpenAICostUsd(usage.inputTokens, usage.outputTokens) : Number.NaN;
  if (!Number.isFinite(actualUsd) || actualUsd > entry.reservedUsd) {
    entry.status = "uncertain";
    throw usageError();
  }
  entry.status = "confirmed";
  entry.actualUsd = actualUsd;
  entry.usage = { ...usage };
}

function uncertainInState(state: BudgetState, requestKey: string): void {
  const entry = state.entries.find((candidate) => candidate.requestKey === requestKey);
  if (entry?.status === "reserved" || entry?.status === "confirmed") entry.status = "uncertain";
}

export class MemoryOpenAIBudgetLedger implements OpenAIBudgetLedger {
  private readonly state = freshState();
  async reserve(requestKey: string): Promise<void> { reserveInState(this.state, requestKey); }
  async confirm(requestKey: string, usage: OpenAIUsage): Promise<void> { confirmInState(this.state, requestKey, usage); }
  async markUncertain(requestKey: string): Promise<void> { uncertainInState(this.state, requestKey); }
  async snapshot(): Promise<OpenAIBudgetSnapshot> { return snapshotState(this.state); }
}

export class FileOpenAIBudgetLedger implements OpenAIBudgetLedger {
  private readonly lockPath: string;
  private readonly contract: NormalizedBudgetContract;
  constructor(private readonly filePath: string, contract?: FileOpenAIBudgetContract) {
    this.lockPath = `${filePath}.lock`;
    this.contract = normalizeContract(contract);
  }

  private async withState<T>(mutate: (state: BudgetState) => T, persist: boolean): Promise<T> {
    await this.contract.validatePrior?.();
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    let lock;
    try {
      lock = await open(this.lockPath, "wx", 0o600);
    } catch {
      throw budgetError();
    }
    try {
      let state = freshState(this.contract);
      try {
        state = validateState(JSON.parse(await readFile(this.filePath, "utf8")), this.contract);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
      }
      let result: T;
      let deferredError: unknown;
      try {
        result = mutate(state);
      } catch (error) {
        deferredError = error;
        result = undefined as T;
      }
      if (persist) {
        const tempPath = `${this.filePath}.${process.pid}.tmp`;
        const temp = await open(tempPath, "wx", 0o600);
        try {
          await temp.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
        } finally {
          await temp.close();
        }
        await rename(tempPath, this.filePath);
        await chmod(this.filePath, 0o600);
      }
      if (deferredError) throw deferredError;
      return result;
    } finally {
      await lock.close();
      await unlink(this.lockPath).catch(() => undefined);
    }
  }

  reserve(requestKey: string): Promise<void> {
    return this.withState((state) => reserveInState(state, requestKey), true);
  }
  confirm(requestKey: string, usage: OpenAIUsage): Promise<void> {
    return this.withState((state) => confirmInState(state, requestKey, usage), true);
  }
  markUncertain(requestKey: string): Promise<void> {
    return this.withState((state) => uncertainInState(state, requestKey), true);
  }
  snapshot(): Promise<OpenAIBudgetSnapshot> {
    return this.withState((state) => snapshotState(state), false);
  }
}
