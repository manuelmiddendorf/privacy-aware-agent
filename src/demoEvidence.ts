import type { EvidenceAssessor } from "./orchestrator.js";
import type { AgentRequest, KnowledgeDocument } from "./types.js";

const SYNTHETIC_DOCUMENTS: Readonly<Record<string, KnowledgeDocument>> = Object.freeze({
  "help-hours": Object.freeze({
    id: "help-hours",
    tenantId: "demo-tenant",
    title: "Synthetic help: office hours",
    body: "The synthetic support desk is open Monday through Thursday from 09:00 to 16:00.",
    classification: "safe",
  }),
  "help-reset": Object.freeze({
    id: "help-reset",
    tenantId: "demo-tenant",
    title: "Synthetic help: reset flow",
    body: "Open Settings, choose Reset demo preferences, and confirm. This affects synthetic demo preferences only.",
    classification: "safe",
  }),
  "meeting-preparation": Object.freeze({
    id: "meeting-preparation",
    tenantId: "demo-tenant",
    title: "Synthetic board meeting preparation",
    body: "1. Collect topics and the meeting goal. 2. Create the agenda. 3. Link the relevant documents. 4. Send the invitation.",
    classification: "safe",
  }),
});

const sameStrings = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sameDocument = (left: KnowledgeDocument, right: KnowledgeDocument) =>
  left.id === right.id && left.tenantId === right.tenantId && left.title === right.title &&
  left.body === right.body && left.classification === right.classification;

/**
 * Fixture-only host decision for fixed synthetic requests. This is not a
 * relevance engine and must never be constructed from an incoming request.
 */
export function createExactSyntheticEvidenceAssessor(
  expectedRequest: AgentRequest,
  expectedDocuments?: readonly KnowledgeDocument[],
): EvidenceAssessor {
  const requestSnapshot: AgentRequest = {
    task: expectedRequest.task,
    text: expectedRequest.text,
    sourceIds: [...expectedRequest.sourceIds],
  };
  const documentSnapshot = (expectedDocuments ?? expectedRequest.sourceIds.map((id) => {
    const document = SYNTHETIC_DOCUMENTS[id];
    if (!document) throw new Error("Unknown synthetic evidence fixture");
    return document;
  })).map((document) => ({ ...document }));

  return Object.freeze({
    isSufficient(request: AgentRequest, documents: readonly KnowledgeDocument[]) {
      return request.task === requestSnapshot.task && request.text === requestSnapshot.text &&
        sameStrings(request.sourceIds, requestSnapshot.sourceIds) &&
        documents.length === documentSnapshot.length &&
        documents.every((document, index) => sameDocument(document, documentSnapshot[index]!));
    },
  });
}
