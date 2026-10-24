import type { TrustedPolicyContext } from "./types.js";

export const DEMO_POLICY = Object.freeze({
  schemaVersion: 1,
  policyId: "demo-policy-v1",
  tenantId: "demo-tenant",
  principalId: "synthetic-user",
  roleIds: ["demo-reader"],
  capabilities: { ask: true, draft: true, summarize: true, actions: false },
  sources: [
    { id: "help-hours", capabilities: ["read"], allowedTasks: ["ask", "summarize"], maxDocumentBytes: 4_096 },
    { id: "help-reset", capabilities: ["read"], allowedTasks: ["ask", "summarize"], maxDocumentBytes: 4_096 },
    { id: "meeting-preparation", capabilities: ["read"], allowedTasks: ["ask", "summarize"], maxDocumentBytes: 4_096 },
  ],
  maxInputBytes: 8_192,
} as const satisfies TrustedPolicyContext);
