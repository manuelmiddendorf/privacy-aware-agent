import { Buffer } from "node:buffer";
import { InMemoryResearchAuthority } from "./localResearchAuthority.js";
import { classifyText } from "./privacyGate.js";
import { assertPrivacySafeResearchOutbound } from "./researchOutboundBoundary.js";
import { ScopeBoundIdentifierRegister } from "./scopeBoundIdentifierRegister.js";
import type {
  ClosedResearchIntent,
  LocalResearchModelAdapter,
  LocalResearchResult,
  ResearchMockOutput,
  ResearchMockProvider,
  ResearchPrivacyGuard,
} from "./localResearchTypes.js";

const OUTBOUND_TEXT = "General information about changing contractual working hours in Germany.";
const CLOSED_KEYS = ["schemaVersion", "decision", "researchIntent", "jurisdiction", "language"] as const;

function blocked(reasonCode: Extract<LocalResearchResult, { ok: false }>['reasonCode']): LocalResearchResult {
  return { ok: false, reasonCode };
}

function isPlainDataObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== keys.length || !keys.every((key) => key in descriptors)) return false;
  return Object.values(descriptors).every((descriptor) => "value" in descriptor && descriptor.enumerable === true);
}

export function validateClosedResearchIntent(value: unknown): ClosedResearchIntent {
  if (!isPlainDataObject(value, CLOSED_KEYS) || value.schemaVersion !== 1 ||
      !["generalize", "block", "uncertain"].includes(value.decision as string) ||
      value.researchIntent !== "WORKING_TIME_CHANGE" || value.jurisdiction !== "DE" ||
      (value.language !== "de" && value.language !== "en")) {
    throw new Error("invalid closed research intent");
  }
  return value as unknown as ClosedResearchIntent;
}

export function renderResearchIntent(intent: ClosedResearchIntent): string {
  if (intent.decision !== "generalize" || intent.researchIntent !== "WORKING_TIME_CHANGE" || intent.jurisdiction !== "DE" ||
      (intent.language !== "de" && intent.language !== "en")) {
    throw new Error("unsupported research intent");
  }
  return OUTBOUND_TEXT;
}

function validateMockOutput(value: unknown): ResearchMockOutput {
  if (!isPlainDataObject(value, ["text"]) || typeof value.text !== "string" || value.text.length < 1 ||
      Buffer.byteLength(value.text, "utf8") > 8_192) {
    throw new Error("invalid mock response");
  }
  return value as unknown as ResearchMockOutput;
}

export class LocalResearchLane {
  constructor(
    private readonly authority: InMemoryResearchAuthority,
    private readonly localModel: LocalResearchModelAdapter,
    private readonly provider: ResearchMockProvider,
    private readonly guard: ResearchPrivacyGuard = { classify: classifyText },
  ) {}

  async run(untrustedRequest: unknown, options: { signal?: AbortSignal } = {}): Promise<LocalResearchResult> {
    let begun;
    try {
      begun = this.authority.begin(untrustedRequest);
    } catch {
      return blocked("BLOCK_RESEARCH_REQUEST_INVALID");
    }
    if (begun === null) return blocked("BLOCK_RESEARCH_SOURCE_DENIED");
    const { request, generation } = begun;
    const identifiers = this.authority.loadIdentifiers(generation);
    if (identifiers === null) return blocked("BLOCK_RESEARCH_STALE_GENERATION");
    const register = new ScopeBoundIdentifierRegister(identifiers);
    const identifierMatch = register.match(request.text);

    let initial;
    try {
      initial = this.guard.classify(request.text, 16_384);
    } catch {
      return blocked("BLOCK_RESEARCH_PRIVACY");
    }
    if (identifierMatch.state === "fuzzy" || identifierMatch.state === "ambiguous" ||
        identifierMatch.state === "short_alias_uncertain") {
      return blocked("BLOCK_RESEARCH_IDENTIFIER_UNCERTAIN");
    }
    if (initial.classification === "sensitive") return blocked("BLOCK_RESEARCH_PRIVACY");
    if (initial.classification === "uncertain" &&
        !(initial.reasonCode === "BLOCK_DIRECT_PERSON_NAME" && identifierMatch.state === "exact")) {
      return blocked("BLOCK_RESEARCH_PRIVACY");
    }
    if (initial.classification === "redactable" && identifierMatch.state !== "exact") {
      return blocked("BLOCK_RESEARCH_PRIVACY");
    }
    if (identifierMatch.state === "exact") {
      let remainderScan;
      try {
        remainderScan = this.guard.classify(register.maskConfirmed(request.text, identifierMatch.confirmedRanges), 16_384);
      } catch {
        return blocked("BLOCK_RESEARCH_PRIVACY");
      }
      if (remainderScan.classification !== "safe") return blocked("BLOCK_RESEARCH_PRIVACY");
    }
    if (options.signal?.aborted || !this.authority.isCurrent(generation)) return blocked("BLOCK_RESEARCH_STALE_GENERATION");

    let rawIntent;
    try {
      rawIntent = await this.localModel.classify({
        originalText: request.text,
        language: request.language,
        purpose: request.purpose,
        authorizedIdentifiers: register.entries(),
      }, options.signal ? { signal: options.signal } : undefined);
    } catch {
      return blocked("BLOCK_RESEARCH_MODEL");
    }
    if (!this.authority.isCurrent(generation) || options.signal?.aborted) return blocked("BLOCK_RESEARCH_STALE_GENERATION");
    let intent;
    try {
      intent = validateClosedResearchIntent(rawIntent);
    } catch {
      return blocked("BLOCK_RESEARCH_MODEL_SCHEMA");
    }
    if (intent.language !== request.language) return blocked("BLOCK_RESEARCH_MODEL_SCHEMA");
    if (intent.decision !== "generalize") return blocked("BLOCK_RESEARCH_MODEL_DECISION");

    let outboundText;
    try {
      outboundText = renderResearchIntent(intent);
      assertPrivacySafeResearchOutbound(outboundText, { maxBytes: 1_024 });
      const scan = this.guard.classify(outboundText, 1_024);
      if (scan.classification !== "safe" || register.match(outboundText).state !== "none") {
        return blocked("BLOCK_RESEARCH_FINAL_SCAN");
      }
    } catch {
      return blocked("BLOCK_RESEARCH_FINAL_SCAN");
    }
    if (!this.authority.isCurrent(generation)) return blocked("BLOCK_RESEARCH_STALE_GENERATION");

    let rawAnswer;
    try {
      rawAnswer = await this.provider.generate({
        researchIntent: intent.researchIntent,
        jurisdiction: intent.jurisdiction,
        language: intent.language,
        text: outboundText,
      }, options.signal ? { signal: options.signal } : undefined);
    } catch {
      return blocked("BLOCK_RESEARCH_PROVIDER");
    }
    if (!this.authority.isCurrent(generation) || options.signal?.aborted) return blocked("BLOCK_RESEARCH_STALE_GENERATION");

    try {
      const answer = validateMockOutput(rawAnswer);
      const responseScan = this.guard.classify(answer.text, 8_192);
      if (responseScan.classification !== "safe" || register.match(answer.text).state !== "none") {
        return blocked("BLOCK_RESEARCH_PROVIDER_RESPONSE");
      }
      if (!this.authority.isCurrent(generation)) return blocked("BLOCK_RESEARCH_STALE_GENERATION");
      return {
        ok: true,
        originalText: request.text,
        decision: "generalize",
        researchIntent: intent.researchIntent,
        jurisdiction: intent.jurisdiction,
        language: intent.language,
        outboundText,
        provider: "MOCK_OFFLINE",
        answer: answer.text,
      };
    } catch {
      return blocked("BLOCK_RESEARCH_PROVIDER_RESPONSE");
    }
  }
}

export { OUTBOUND_TEXT };
