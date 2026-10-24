import { authorizeRequest, validateAgentRequest, validateTaskEvidence, validateTrustedPolicy } from "./policy.js";
import { classifyText, redactDirectIdentifiers } from "./privacyGate.js";
import { KnowledgeAccessError, loadAuthorizedDocuments } from "./knowledge.js";
import { ProviderAdapterError, isProviderAdapterReasonCode } from "./transportProvider.js";
import type { AgentRequest, AgentResult, AuditEvent, KnowledgeDocument, ModelProvider, ReasonCode } from "./types.js";

export interface PrivacyGuard {
  classify(text: string, maxBytes: number): ReturnType<typeof classifyText>;
  redact(text: string): ReturnType<typeof redactDirectIdentifiers>;
}

export interface EvidenceAssessor {
  isSufficient(request: AgentRequest, documents: readonly KnowledgeDocument[]): boolean;
}

export interface AgentRunOptions {
  signal?: AbortSignal;
}

const DEFAULT_GUARD: PrivacyGuard = {
  classify: classifyText,
  redact: redactDirectIdentifiers,
};

const DEFAULT_EVIDENCE_ASSESSOR: EvidenceAssessor = {
  isSufficient: (_request, documents) => documents.length === 0,
};

export class PrivacyAwareAgent {
  readonly audit: AuditEvent[] = [];

  constructor(
    private readonly provider: ModelProvider,
    private readonly guard: PrivacyGuard = DEFAULT_GUARD,
    private readonly evidenceAssessor: EvidenceAssessor = DEFAULT_EVIDENCE_ASSESSOR,
  ) {}

  async run(untrustedPolicy: unknown, untrustedRequest: AgentRequest, options: AgentRunOptions = {}): Promise<AgentResult> {
    let policyId = "invalid";
    let request: AgentRequest = { task: "ask", text: "", sourceIds: [] };
    const block = (reasonCode: ReasonCode, task = request.task): AgentResult => {
      this.audit.push({ event: "blocked", policyId, task, reasonCode, sourceCount: request.sourceIds.length, redactionCount: 0 });
      return { ok: false, classification: "uncertain", reasonCode };
    };

    try {
      if (options.signal?.aborted) return block("BLOCK_PROVIDER_CANCELLED");
      const policy = validateTrustedPolicy(untrustedPolicy);
      policyId = policy.policyId;
      try {
        request = validateAgentRequest(untrustedRequest);
      } catch {
        return block("BLOCK_REQUEST_INVALID");
      }
      try {
        authorizeRequest(policy, request);
      } catch (error) {
        const reason = error instanceof Error && error.message === "capability denied"
          ? "BLOCK_CAPABILITY_DENIED"
          : "BLOCK_SOURCE_DENIED";
        return block(reason);
      }
      try {
        validateTaskEvidence(request);
      } catch {
        return block("BLOCK_EVIDENCE_REQUIRED");
      }

      const initial = this.guard.classify(request.text, policy.maxInputBytes);
      if (!(["safe", "redactable", "sensitive", "uncertain"] as const).includes(initial?.classification)) {
        return block("BLOCK_CLASSIFICATION_INVALID");
      }
      if (initial.classification === "sensitive" || initial.classification === "uncertain") {
        this.audit.push({ event: "blocked", policyId, task: request.task, reasonCode: initial.reasonCode, sourceCount: request.sourceIds.length, redactionCount: 0 });
        return { ok: false, classification: initial.classification, reasonCode: initial.reasonCode };
      }

      const redacted = initial.classification === "redactable"
        ? this.guard.redact(request.text)
        : { text: request.text, count: 0 };
      if (initial.classification === "redactable" && redacted.count === 0) return block("BLOCK_REDACTION_FAILED");

      let documents: KnowledgeDocument[];
      try {
        documents = loadAuthorizedDocuments(policy, request.sourceIds);
      } catch (error) {
        if (error instanceof KnowledgeAccessError) return block("BLOCK_SOURCE_DENIED");
        throw error;
      }
      for (const document of documents) {
        const documentScan = this.guard.classify(`${document.title}\n${document.body}\n${document.id}`, document.body.length * 4 + 1_024);
        if (documentScan.classification !== "safe") return block("BLOCK_DOCUMENT_SENSITIVE");
      }

      // The complete provider context is scanned again after pseudonymization.
      const finalContext = JSON.stringify({ task: request.task, text: redacted.text, documents });
      const finalScan = this.guard.classify(finalContext, policy.maxInputBytes + documents.reduce((n, d) => n + d.body.length * 4 + 1_024, 0));
      if (finalScan.classification !== "safe") {
        return block("BLOCK_FINAL_CONTEXT_NOT_SAFE");
      }
      if (this.evidenceAssessor.isSufficient(request, documents) !== true) {
        return block("BLOCK_EVIDENCE_INSUFFICIENT");
      }

      let output;
      try {
        output = await this.provider.generate(
          { task: request.task, text: redacted.text, documents },
          options.signal ? { signal: options.signal } : undefined,
        );
      } catch (error) {
        const reasonCode = error instanceof ProviderAdapterError && isProviderAdapterReasonCode(error.reasonCode)
          ? error.reasonCode
          : "BLOCK_PROVIDER_ERROR";
        this.audit.push({ event: "provider_error", policyId, task: request.task, reasonCode, sourceCount: documents.length, redactionCount: redacted.count });
        return { ok: false, classification: "uncertain", reasonCode };
      }
      this.audit.push({ event: "allowed", policyId, task: request.task, reasonCode: initial.reasonCode, sourceCount: documents.length, redactionCount: redacted.count });
      return { ok: true, classification: initial.classification, reasonCode: initial.reasonCode, redactions: redacted.count, provider: this.provider.name, output };
    } catch {
      return block(policyId === "invalid" ? "BLOCK_POLICY_INVALID" : "BLOCK_TECHNICAL_ERROR");
    }
  }
}
