import type { ClassificationResult } from "./types.js";

export type ResearchIdentifierType =
  | "person_name"
  | "person_alias"
  | "email"
  | "postal_address"
  | "contextual_short_alias";

export interface ResearchIdentifier {
  readonly subjectId: string;
  readonly type: ResearchIdentifierType;
  readonly value: string;
}

export interface ResearchSource {
  readonly id: string;
  readonly organizationId: string;
  readonly identifiers: readonly ResearchIdentifier[];
}

export interface LocalResearchRequest {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly sourceIds: readonly string[];
  readonly purpose: "GENERAL_WORKING_TIME_RESEARCH";
  readonly language: "de" | "en";
  readonly text: string;
}

export interface AuthorizedResearchGeneration {
  readonly organizationId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly authorizationVersion: number;
  readonly requestGeneration: number;
  readonly purpose: "GENERAL_WORKING_TIME_RESEARCH";
  readonly sourceIds: readonly string[];
}

export interface LocalResearchModelInput {
  readonly originalText: string;
  readonly language: "de" | "en";
  readonly purpose: "GENERAL_WORKING_TIME_RESEARCH";
  readonly authorizedIdentifiers: readonly ResearchIdentifier[];
}

export interface LocalResearchModelAdapter {
  readonly name: string;
  readonly callCount: number;
  classify(input: LocalResearchModelInput, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export interface ResearchMockInput {
  readonly researchIntent: "WORKING_TIME_CHANGE";
  readonly jurisdiction: "DE";
  readonly language: "de" | "en";
  readonly text: string;
}

export interface ResearchMockOutput {
  readonly text: string;
}

export interface ResearchMockProvider {
  readonly name: "MOCK_OFFLINE";
  readonly callCount: number;
  generate(input: ResearchMockInput, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export interface ClosedResearchIntent {
  readonly schemaVersion: 1;
  readonly decision: "generalize" | "block" | "uncertain";
  readonly researchIntent: "WORKING_TIME_CHANGE";
  readonly jurisdiction: "DE";
  readonly language: "de" | "en";
}

export type IdentifierMatchState = "none" | "exact" | "fuzzy" | "ambiguous" | "short_alias_uncertain";

export interface ConfirmedIdentifierRange {
  readonly start: number;
  readonly end: number;
  readonly type: ResearchIdentifierType;
}

export interface IdentifierMatchResult {
  readonly state: IdentifierMatchState;
  readonly matchedTypes: readonly ResearchIdentifierType[];
  readonly subjectCount: number;
  readonly confirmedRanges: readonly ConfirmedIdentifierRange[];
}

export interface LocalResearchSuccess {
  readonly ok: true;
  readonly originalText: string;
  readonly decision: "generalize";
  readonly researchIntent: "WORKING_TIME_CHANGE";
  readonly jurisdiction: "DE";
  readonly language: "de" | "en";
  readonly outboundText: string;
  readonly provider: "MOCK_OFFLINE";
  readonly answer: string;
}

export interface LocalResearchBlocked {
  readonly ok: false;
  readonly reasonCode:
    | "BLOCK_RESEARCH_REQUEST_INVALID"
    | "BLOCK_RESEARCH_SOURCE_DENIED"
    | "BLOCK_RESEARCH_STALE_GENERATION"
    | "BLOCK_RESEARCH_PRIVACY"
    | "BLOCK_RESEARCH_IDENTIFIER_UNCERTAIN"
    | "BLOCK_RESEARCH_MODEL"
    | "BLOCK_RESEARCH_MODEL_SCHEMA"
    | "BLOCK_RESEARCH_MODEL_DECISION"
    | "BLOCK_RESEARCH_FINAL_SCAN"
    | "BLOCK_RESEARCH_PROVIDER"
    | "BLOCK_RESEARCH_PROVIDER_RESPONSE";
}

export type LocalResearchResult = LocalResearchSuccess | LocalResearchBlocked;

export interface ResearchPrivacyGuard {
  classify(text: string, maxBytes: number): ClassificationResult;
}
