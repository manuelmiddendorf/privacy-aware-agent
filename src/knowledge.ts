import { Buffer } from "node:buffer";
import type { KnowledgeDocument, TrustedPolicyContext } from "./types.js";

const DOCUMENTS: ReadonlyMap<string, KnowledgeDocument> = new Map([
  ["help-hours", {
    id: "help-hours",
    tenantId: "demo-tenant",
    title: "Synthetic help: office hours",
    body: "The synthetic support desk is open Monday through Thursday from 09:00 to 16:00.",
    classification: "safe",
  }],
  ["help-reset", {
    id: "help-reset",
    tenantId: "demo-tenant",
    title: "Synthetic help: reset flow",
    body: "Open Settings, choose Reset demo preferences, and confirm. This affects synthetic demo preferences only.",
    classification: "safe",
  }],
  ["meeting-preparation", {
    id: "meeting-preparation",
    tenantId: "demo-tenant",
    title: "Synthetic board meeting preparation",
    body: "1. Collect topics and the meeting goal. 2. Create the agenda. 3. Link the relevant documents. 4. Send the invitation.",
    classification: "safe",
  }],
  ["unsafe-synthetic", {
    id: "unsafe-synthetic",
    tenantId: "demo-tenant",
    title: "Synthetic mislabeled document",
    body: "This synthetic fixture contains a password and must never reach the provider.",
    classification: "safe",
  }],
]);

export class KnowledgeAccessError extends Error {
  constructor(message: "source denied" | "source too large") {
    super(message);
    this.name = "KnowledgeAccessError";
  }
}

export function loadAuthorizedDocuments(policy: TrustedPolicyContext, sourceIds: readonly string[]): KnowledgeDocument[] {
  const sourceRules = new Map(policy.sources.map((source) => [source.id, source]));
  return sourceIds.map((sourceId) => {
    const rule = sourceRules.get(sourceId);
    const document = DOCUMENTS.get(sourceId);
    if (!rule || !document || document.tenantId !== policy.tenantId) throw new KnowledgeAccessError("source denied");
    if (Buffer.byteLength(JSON.stringify(document), "utf8") > rule.maxDocumentBytes) throw new KnowledgeAccessError("source too large");
    return document;
  });
}
