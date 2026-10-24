export const LOCAL_SKILL_IDS = [
  "DOCUMENT_UNDERSTANDING",
  "INFORMATION_COMPARISON",
  "TEXT_COMPOSITION",
  "PROCESS_PREPARATION",
  "GENERAL_RESEARCH",
] as const;

export type LocalSkillId = typeof LOCAL_SKILL_IDS[number];
export type ExecutableLocalSkillId = "DOCUMENT_UNDERSTANDING" | "TEXT_COMPOSITION";
export type LocalSkillSourceKind = "HOST_RESOLVED" | "INLINE_SYNTHETIC";

export interface LocalSkillCatalogEntry {
  readonly id: LocalSkillId;
  readonly label: string;
  readonly status: "executable" | "planned";
  readonly inputContract: string;
  readonly outputContract: string;
  readonly sourceRightsContract: string;
  readonly processingBoundary: "LOCAL_ONLY";
}

export interface LocalSkillLimits {
  readonly maxRequestBytes: number;
  readonly maxSourceCount: number;
  readonly maxSourceTitleBytes: number;
  readonly maxSourceBytes: number;
  readonly maxAggregateSourceBytes: number;
  readonly maxParagraphCount: number;
  readonly maxParagraphBytes: number;
  readonly maxProposalBytes: number;
  readonly maxOutputBytes: number;
  readonly maxModelContextBytes: number;
  readonly maxModelOutputTokens: number;
}

export interface TrustedLocalSkillPolicy {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly organizationId: string;
  readonly principalId: string;
  readonly sessionId: string;
  readonly authorizationVersion: number;
  readonly purpose: "SYNTHETIC_LOCAL_EDITORIAL";
  readonly contentScope: "SYNTHETIC_DEMO_ONLY";
  readonly executableSkillIds: readonly ExecutableLocalSkillId[];
  readonly readableSourceIds: readonly string[];
  readonly allowInlineSyntheticAttachments: boolean;
  readonly allowSensitiveSyntheticExamples: boolean;
  readonly actions: false;
  readonly persistence: false;
  readonly limits: LocalSkillLimits;
}

export interface LocalSkillSourceMetadata {
  readonly id: string;
  readonly organizationId: string;
  readonly title: string;
  readonly kind: LocalSkillSourceKind;
  readonly capabilities: readonly ["read"];
  readonly readOnly: true;
}

export interface LocalSkillSourceHandle {
  readonly metadata: LocalSkillSourceMetadata;
  readText(): string;
}

export interface LocalSkillRequest {
  readonly schemaVersion: 1;
  readonly requestNonce: string;
  readonly text: string;
  readonly sources: readonly LocalSkillSourceHandle[];
}

export interface LocalSkillAuthorizationToken {
  readonly organizationId: string;
  readonly principalId: string;
  readonly sessionId: string;
  readonly authorizationVersion: number;
  readonly authorityEpoch: number;
  readonly requestGeneration: number;
  readonly purpose: "SYNTHETIC_LOCAL_EDITORIAL";
  readonly requestNonce: string;
  readonly sourceIds: readonly string[];
}

export interface LocalSkillParagraph {
  readonly id: string;
  readonly text: string;
  readonly ordinal: number;
}

export interface LocalSkillDocumentSnapshot {
  readonly id: string;
  readonly title: string;
  readonly kind: LocalSkillSourceKind;
  readonly sectionLabel: "Abschnitt 1";
  readonly paragraphs: readonly LocalSkillParagraph[];
}

export interface LocalSkillProposalInput {
  readonly requestText: string;
  readonly documents: readonly LocalSkillDocumentSnapshot[];
  readonly executableSkillIds: readonly ExecutableLocalSkillId[];
}

export interface LocalSkillGenerationInput {
  readonly skillIds: readonly ExecutableLocalSkillId[];
  readonly requestText: string;
  readonly documents: readonly LocalSkillDocumentSnapshot[];
}

export interface LocalSkillModel {
  readonly name: string;
  readonly proposalCallCount: number;
  readonly generationCallCount: number;
  propose(input: LocalSkillProposalInput, options?: { signal?: AbortSignal }): Promise<unknown>;
  generate(input: LocalSkillGenerationInput, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export interface LocalSkillCitation {
  readonly paragraphId: string;
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly sectionLabel: "Abschnitt 1";
  readonly paragraphLabel: string;
}

export interface LocalSkillResultPart {
  readonly skillId: ExecutableLocalSkillId;
  readonly resultKind: "answer" | "draft";
  readonly text: string;
  readonly citations: readonly LocalSkillCitation[];
}

export interface LocalSkillSuccess {
  readonly ok: true;
  readonly requestNonce: string;
  readonly skillIds: readonly ExecutableLocalSkillId[];
  readonly provider: string;
  readonly parts: readonly LocalSkillResultPart[];
  readonly sourceTitles: readonly string[];
}

export interface LocalSkillStopped {
  readonly ok: false;
  readonly requestNonce: string;
  readonly reasonCode:
    | "LOCAL_SKILL_REQUEST_INVALID"
    | "LOCAL_SKILL_SOURCE_DENIED"
    | "LOCAL_SKILL_SOURCE_INVALID"
    | "LOCAL_SKILL_INPUT_TOO_LARGE"
    | "LOCAL_SKILL_CONTEXT_TOO_LARGE"
    | "LOCAL_SKILL_STALE_GENERATION"
    | "LOCAL_SKILL_CANCELLED"
    | "LOCAL_SKILL_MODEL_ERROR"
    | "LOCAL_SKILL_MODEL_SCHEMA"
    | "LOCAL_SKILL_CLARIFICATION_REQUIRED"
    | "LOCAL_SKILL_UNSUPPORTED"
    | "LOCAL_SKILL_COMBINATION_DENIED"
    | "LOCAL_SKILL_OUTPUT_INVALID";
  readonly message: string;
}

export type LocalSkillResult = LocalSkillSuccess | LocalSkillStopped;
