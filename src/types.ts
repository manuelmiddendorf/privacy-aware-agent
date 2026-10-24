export type TaskKind = "ask" | "draft" | "summarize";
export type DataClassification = "safe" | "redactable" | "sensitive" | "uncertain";

export type ReasonCode =
  | "SAFE_GENERIC"
  | "SAFE_ALLOWED_DOCUMENT"
  | "REDACTABLE_DIRECT_IDENTIFIER"
  | "BLOCK_HEALTH_DATA"
  | "BLOCK_CHILD_DATA"
  | "BLOCK_SENSITIVE_PERSONNEL"
  | "BLOCK_CREDENTIAL"
  | "BLOCK_FINANCIAL_IDENTIFIER"
  | "BLOCK_DIRECT_PERSON_NAME"
  | "BLOCK_UNCERTAIN_CONTEXT"
  | "BLOCK_POLICY_INVALID"
  | "BLOCK_REQUEST_INVALID"
  | "BLOCK_SOURCE_DENIED"
  | "BLOCK_CAPABILITY_DENIED"
  | "BLOCK_EVIDENCE_REQUIRED"
  | "BLOCK_EVIDENCE_INSUFFICIENT"
  | "BLOCK_DOCUMENT_SENSITIVE"
  | "BLOCK_REDACTION_FAILED"
  | "BLOCK_FINAL_CONTEXT_NOT_SAFE"
  | "BLOCK_CLASSIFICATION_INVALID"
  | "BLOCK_INPUT_TOO_LARGE"
  | "BLOCK_TECHNICAL_ERROR"
  | "BLOCK_PROVIDER_ERROR"
  | "BLOCK_PROVIDER_DISABLED"
  | "BLOCK_PROVIDER_CANCELLED"
  | "BLOCK_PROVIDER_TIMEOUT"
  | "BLOCK_PROVIDER_TRANSPORT"
  | "BLOCK_PROVIDER_RATE_LIMIT"
  | "BLOCK_PROVIDER_QUOTA"
  | "BLOCK_PROVIDER_REJECTED"
  | "BLOCK_PROVIDER_REQUEST_TOO_LARGE"
  | "BLOCK_PROVIDER_RESPONSE_INVALID"
  | "BLOCK_PROVIDER_RESPONSE_TOO_LARGE"
  | "BLOCK_PROVIDER_CITATION_INVALID"
  | "BLOCK_PROVIDER_BUDGET"
  | "BLOCK_PROVIDER_USAGE_UNKNOWN";

export interface ClassificationResult {
  classification: DataClassification;
  reasonCode: ReasonCode;
}

export interface TrustedSourcePolicy {
  id: string;
  capabilities: readonly ["read"];
  allowedTasks: readonly TaskKind[];
  maxDocumentBytes: number;
}

export interface TrustedPolicyContext {
  schemaVersion: 1;
  policyId: string;
  tenantId: string;
  principalId: string;
  roleIds: readonly string[];
  capabilities: Readonly<Record<TaskKind, boolean>> & { actions: false };
  sources: readonly TrustedSourcePolicy[];
  maxInputBytes: number;
}

export interface AgentRequest {
  task: TaskKind;
  text: string;
  sourceIds: readonly string[];
}

export interface KnowledgeDocument {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  classification: "safe";
}

export interface ProviderInput {
  task: TaskKind;
  text: string;
  documents: readonly KnowledgeDocument[];
}

export interface ProviderOutput {
  text: string;
  citations: readonly string[];
}

export interface ProviderCallOptions {
  signal?: AbortSignal;
}

export interface ModelProvider {
  readonly name: string;
  readonly callCount: number;
  generate(input: ProviderInput, options?: ProviderCallOptions): Promise<ProviderOutput>;
}

export interface AgentSuccess {
  ok: true;
  classification: "safe" | "redactable";
  reasonCode: ReasonCode;
  redactions: number;
  provider: string;
  output: ProviderOutput;
}

export interface AgentBlocked {
  ok: false;
  classification: "sensitive" | "uncertain";
  reasonCode: ReasonCode;
}

export type AgentResult = AgentSuccess | AgentBlocked;

export interface AuditEvent {
  event: "allowed" | "blocked" | "provider_error";
  policyId: string;
  task: TaskKind;
  reasonCode: ReasonCode;
  sourceCount: number;
  redactionCount: number;
}
