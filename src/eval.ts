import { DEMO_POLICY } from "./demoPolicy.js";
import { MockProvider } from "./mockProvider.js";
import { PrivacyAwareAgent, type EvidenceAssessor, type PrivacyGuard } from "./orchestrator.js";
import { classifyText, redactDirectIdentifiers } from "./privacyGate.js";
import type { AgentRequest, ModelProvider, ReasonCode, TrustedPolicyContext } from "./types.js";

type Category = "task" | "policy" | "source" | "evidence" | "privacy";

interface EvalCase {
  category: Category;
  name: string;
  request: AgentRequest;
  expectedOk: boolean;
  expectedReason?: ReasonCode;
  expectedProviderCalls: number;
  policy?: unknown;
  guardFactory?: () => PrivacyGuard;
  evidenceAssessorFactory?: () => EvidenceAssessor;
  providerFactory?: () => ModelProvider;
}

const request = (task: AgentRequest["task"], text: string, sourceIds: readonly string[] = []): AgentRequest => ({ task, text, sourceIds });

const withCapabilities = (changes: Partial<TrustedPolicyContext["capabilities"]>) => ({
  ...DEMO_POLICY,
  capabilities: { ...DEMO_POLICY.capabilities, ...changes },
});

const draftSourcePolicy = {
  ...DEMO_POLICY,
  sources: [{ ...DEMO_POLICY.sources[0], allowedTasks: ["ask", "draft", "summarize"] as const }],
};

const unsafeSourcePolicy = {
  ...DEMO_POLICY,
  sources: [...DEMO_POLICY.sources, {
    id: "unsafe-synthetic",
    capabilities: ["read"] as const,
    allowedTasks: ["ask"] as const,
    maxDocumentBytes: 4_096,
  }],
};

const cases: EvalCase[] = [
  // Task behavior: every successful task has the evidence shape required by its contract.
  { category: "task", name: "ask-meeting-preparation", request: request("ask", "List only the approved preparation steps for the synthetic board meeting.", ["meeting-preparation"]), expectedOk: true, expectedProviderCalls: 1 },
  { category: "task", name: "ask-reset", request: request("ask", "How are demo preferences reset?", ["help-reset"]), expectedOk: true, expectedProviderCalls: 1 },
  { category: "task", name: "summarize-hours", request: request("summarize", "Summarize the approved page.", ["help-hours"]), expectedOk: true, expectedProviderCalls: 1 },
  { category: "task", name: "summarize-user-text", request: request("summarize", "Summarize this general text about preparing a room before a meeting."), expectedOk: true, expectedProviderCalls: 1 },
  { category: "task", name: "draft-gardening-placeholders", request: request("draft", "Write a friendly gardening-day invitation for [Date] at [Time] in [Location]. Do not send it."), expectedOk: true, expectedProviderCalls: 1 },
  { category: "task", name: "draft-email-redaction", request: request("draft", "Draft a neutral reply to demo@example.test."), expectedOk: true, expectedProviderCalls: 1 },
  { category: "task", name: "draft-phone-redaction", request: request("draft", "Draft a generic callback note for +49 30 12345678."), expectedOk: true, expectedProviderCalls: 1 },
  { category: "task", name: "draft-member-redaction", request: request("draft", "Draft a generic receipt for member-id: demo-42."), expectedOk: true, expectedProviderCalls: 1 },
  { category: "task", name: "draft-with-authorized-source", policy: draftSourcePolicy, request: request("draft", "Draft a neutral notice from the approved page.", ["help-hours"]), expectedOk: true, expectedProviderCalls: 1 },

  // Trusted policy behavior.
  { category: "policy", name: "ask-capability-denied", policy: withCapabilities({ ask: false }), request: request("ask", "Generic question.", ["help-hours"]), expectedOk: false, expectedReason: "BLOCK_CAPABILITY_DENIED", expectedProviderCalls: 0 },
  { category: "policy", name: "summarize-capability-denied", policy: withCapabilities({ summarize: false }), request: request("summarize", "Generic summary.", ["help-hours"]), expectedOk: false, expectedReason: "BLOCK_CAPABILITY_DENIED", expectedProviderCalls: 0 },
  { category: "policy", name: "draft-capability-denied", policy: withCapabilities({ draft: false }), request: request("draft", "Generic draft."), expectedOk: false, expectedReason: "BLOCK_CAPABILITY_DENIED", expectedProviderCalls: 0 },
  { category: "policy", name: "role-does-not-grant-capability", policy: { ...withCapabilities({ ask: false }), roleIds: ["super-admin"] }, request: request("ask", "Generic question.", ["help-hours"]), expectedOk: false, expectedReason: "BLOCK_CAPABILITY_DENIED", expectedProviderCalls: 0 },
  { category: "policy", name: "extra-policy-field", policy: { ...DEMO_POLICY, userOverride: true }, request: request("ask", "Generic question.", ["help-hours"]), expectedOk: false, expectedReason: "BLOCK_POLICY_INVALID", expectedProviderCalls: 0 },
  { category: "policy", name: "actions-enabled", policy: { ...DEMO_POLICY, capabilities: { ...DEMO_POLICY.capabilities, actions: true } }, request: request("draft", "Generic draft."), expectedOk: false, expectedReason: "BLOCK_POLICY_INVALID", expectedProviderCalls: 0 },
  { category: "policy", name: "schema-version", policy: { ...DEMO_POLICY, schemaVersion: 2 }, request: request("draft", "Generic draft."), expectedOk: false, expectedReason: "BLOCK_POLICY_INVALID", expectedProviderCalls: 0 },
  { category: "policy", name: "writable-source", policy: { ...DEMO_POLICY, sources: [{ ...DEMO_POLICY.sources[0], capabilities: ["write"] }] }, request: request("ask", "Generic question.", ["help-hours"]), expectedOk: false, expectedReason: "BLOCK_POLICY_INVALID", expectedProviderCalls: 0 },
  { category: "policy", name: "invalid-input-limit", policy: { ...DEMO_POLICY, maxInputBytes: 0 }, request: request("draft", "Generic draft."), expectedOk: false, expectedReason: "BLOCK_POLICY_INVALID", expectedProviderCalls: 0 },

  // Source authorization, tenancy, size, content, and task scope.
  { category: "source", name: "unknown-source", request: request("ask", "Generic question.", ["unknown-source"]), expectedOk: false, expectedReason: "BLOCK_SOURCE_DENIED", expectedProviderCalls: 0 },
  { category: "source", name: "duplicate-source", request: request("ask", "Generic question.", ["help-hours", "help-hours"]), expectedOk: false, expectedReason: "BLOCK_SOURCE_DENIED", expectedProviderCalls: 0 },
  { category: "source", name: "too-many-sources", request: request("ask", "Generic question.", Array.from({ length: 17 }, (_, index) => `source-${index}`)), expectedOk: false, expectedReason: "BLOCK_SOURCE_DENIED", expectedProviderCalls: 0 },
  { category: "source", name: "unsafe-document", policy: unsafeSourcePolicy, request: request("ask", "Read the approved fixture.", ["unsafe-synthetic"]), expectedOk: false, expectedReason: "BLOCK_DOCUMENT_SENSITIVE", expectedProviderCalls: 0 },
  { category: "source", name: "tenant-mismatch", policy: { ...DEMO_POLICY, tenantId: "other-synthetic-tenant" }, request: request("ask", "Generic question.", ["help-hours"]), expectedOk: false, expectedReason: "BLOCK_SOURCE_DENIED", expectedProviderCalls: 0 },
  { category: "source", name: "source-size-limit", policy: { ...DEMO_POLICY, sources: [{ ...DEMO_POLICY.sources[0], maxDocumentBytes: 1 }] }, request: request("ask", "Generic question.", ["help-hours"]), expectedOk: false, expectedReason: "BLOCK_SOURCE_DENIED", expectedProviderCalls: 0 },
  { category: "source", name: "source-task-mismatch", policy: { ...DEMO_POLICY, sources: [{ ...DEMO_POLICY.sources[0], allowedTasks: ["ask"] as const }] }, request: request("summarize", "Generic summary.", ["help-hours"]), expectedOk: false, expectedReason: "BLOCK_SOURCE_DENIED", expectedProviderCalls: 0 },
  { category: "source", name: "second-approved-source", request: request("ask", "Use the approved reset page.", ["help-reset"]), expectedOk: true, expectedProviderCalls: 1 },
  { category: "source", name: "two-approved-sources", request: request("ask", "Use both approved pages.", ["help-hours", "help-reset"]), expectedOk: true, expectedProviderCalls: 1 },

  // Task-specific evidence rules and their ordering before privacy/provider work.
  { category: "evidence", name: "notice-period-without-source", request: request("ask", "What is the binding notice period and exact deadline?"), expectedOk: false, expectedReason: "BLOCK_EVIDENCE_REQUIRED", expectedProviderCalls: 0 },
  { category: "evidence", name: "summarize-user-text-without-source", request: request("summarize", "Summarize this general note about setting up chairs."), expectedOk: true, expectedProviderCalls: 1 },
  { category: "evidence", name: "ask-without-source-sensitive", request: request("ask", "Summarize a diagnosis."), expectedOk: false, expectedReason: "BLOCK_EVIDENCE_REQUIRED", expectedProviderCalls: 0 },
  { category: "evidence", name: "summarize-user-text-with-redaction", request: request("summarize", "Summarize this general note for demo@example.test."), expectedOk: true, expectedProviderCalls: 1 },
  { category: "evidence", name: "ask-one-source", request: request("ask", "Generic question.", ["help-hours"]), expectedOk: true, expectedProviderCalls: 1 },
  { category: "evidence", name: "ask-two-sources", request: request("ask", "Generic question.", ["help-hours", "help-reset"]), expectedOk: true, expectedProviderCalls: 1 },
  { category: "evidence", name: "summarize-one-source", request: request("summarize", "Generic summary.", ["help-hours"]), expectedOk: true, expectedProviderCalls: 1 },
  { category: "evidence", name: "summarize-two-sources", request: request("summarize", "Generic summary.", ["help-hours", "help-reset"]), expectedOk: true, expectedProviderCalls: 1 },
  { category: "evidence", name: "draft-needs-no-source", request: request("draft", "Draft a generic checklist."), expectedOk: true, expectedProviderCalls: 1 },
  {
    category: "evidence",
    name: "notice-period-selected-sources-insufficient",
    request: request("ask", "What binding notice period applies to our next general meeting?", ["meeting-preparation"]),
    expectedOk: false,
    expectedReason: "BLOCK_EVIDENCE_INSUFFICIENT",
    expectedProviderCalls: 0,
    evidenceAssessorFactory: () => ({
      isSufficient: (_request, documents) => documents.some((document) => document.id === "binding-notice-period"),
    }),
  },

  // Conservative minimum privacy cases, including remainder and final-context checks.
  { category: "privacy", name: "health-simple", request: request("draft", "Die Person hat Fieber."), expectedOk: false, expectedReason: "BLOCK_HEALTH_DATA", expectedProviderCalls: 0 },
  { category: "privacy", name: "child-illness", request: request("draft", "A child has a fever. Draft a personal update."), expectedOk: false, expectedReason: "BLOCK_HEALTH_DATA", expectedProviderCalls: 0 },
  { category: "privacy", name: "name-after-person-context", request: request("draft", "Bitte schreibe an die erfundene Person Nora Beispiel eine neutrale Einladung."), expectedOk: false, expectedReason: "BLOCK_DIRECT_PERSON_NAME", expectedProviderCalls: 0 },
  { category: "privacy", name: "name-before-group-context", request: request("draft", "Nora Beispiel aus der einzigen roten Gruppe erreicht ihr unter nora@example.invalid."), expectedOk: false, expectedReason: "BLOCK_DIRECT_PERSON_NAME", expectedProviderCalls: 0 },
  { category: "privacy", name: "personnel", request: request("draft", "Draft a performance review."), expectedOk: false, expectedReason: "BLOCK_SENSITIVE_PERSONNEL", expectedProviderCalls: 0 },
  { category: "privacy", name: "credential", request: request("draft", "Use this password to sign in."), expectedOk: false, expectedReason: "BLOCK_CREDENTIAL", expectedProviderCalls: 0 },
  { category: "privacy", name: "financial", request: request("draft", "Store this IBAN."), expectedOk: false, expectedReason: "BLOCK_FINANCIAL_IDENTIFIER", expectedProviderCalls: 0 },
  { category: "privacy", name: "uncertain", request: request("draft", "Read the unknown attachment."), expectedOk: false, expectedReason: "BLOCK_UNCERTAIN_CONTEXT", expectedProviderCalls: 0 },
  {
    category: "privacy",
    name: "post-redaction-health-remainder",
    request: request("draft", "Reply to demo@example.test about Fieber."),
    expectedOk: false,
    expectedReason: "BLOCK_FINAL_CONTEXT_NOT_SAFE",
    expectedProviderCalls: 0,
    guardFactory: () => {
      let firstScan = true;
      return {
        classify(text, maxBytes) {
          if (firstScan) {
            firstScan = false;
            return { classification: "redactable", reasonCode: "REDACTABLE_DIRECT_IDENTIFIER" };
          }
          return classifyText(text, maxBytes);
        },
        redact: redactDirectIdentifiers,
      };
    },
  },
  {
    category: "privacy",
    name: "final-context-redactable",
    request: request("draft", "demo@example.test"),
    expectedOk: false,
    expectedReason: "BLOCK_FINAL_CONTEXT_NOT_SAFE",
    expectedProviderCalls: 0,
    guardFactory: () => ({
      classify: () => ({ classification: "redactable", reasonCode: "REDACTABLE_DIRECT_IDENTIFIER" }),
      redact: () => ({ text: "still@example.test", count: 1 }),
    }),
  },
  {
    category: "privacy",
    name: "invalid-initial-classification",
    request: request("draft", "Generic draft."),
    expectedOk: false,
    expectedReason: "BLOCK_CLASSIFICATION_INVALID",
    expectedProviderCalls: 0,
    guardFactory: () => {
      let scans = 0;
      return {
        classify() {
          scans += 1;
          return scans === 1
            ? { classification: "unknown", reasonCode: "SAFE_GENERIC" } as never
            : { classification: "safe", reasonCode: "SAFE_GENERIC" };
        },
        redact: redactDirectIdentifiers,
      };
    },
  },
];

if (cases.length < 30 || cases.length > 50) throw new Error(`evaluation case count outside 30-50: ${cases.length}`);

interface Counter { total: number; passed: number; allowed: number; blocked: number; providerCalls: number }
const newCounter = (): Counter => ({ total: 0, passed: 0, allowed: 0, blocked: 0, providerCalls: 0 });
const byCategory = Object.fromEntries((["task", "policy", "source", "evidence", "privacy"] as const).map((key) => [key, newCounter()])) as Record<Category, Counter>;
const byTask = Object.fromEntries((["ask", "draft", "summarize"] as const).map((key) => [key, newCounter()])) as Record<AgentRequest["task"], Counter>;
const reasonCounts: Partial<Record<ReasonCode, number>> = {};
const failures: string[] = [];
let providerCalls = 0;
let allowed = 0;
let blocked = 0;

for (const sample of cases) {
  const provider = sample.providerFactory?.() ?? new MockProvider();
  const agent = new PrivacyAwareAgent(provider, sample.guardFactory?.(), sample.evidenceAssessorFactory?.());
  const result = await agent.run(sample.policy ?? DEMO_POLICY, sample.request);
  const passed = result.ok === sample.expectedOk &&
    (!sample.expectedReason || result.reasonCode === sample.expectedReason) &&
    provider.callCount === sample.expectedProviderCalls;

  if (!passed) failures.push(sample.name);
  if (result.ok) allowed += 1;
  else blocked += 1;
  providerCalls += provider.callCount;
  reasonCounts[result.reasonCode] = (reasonCounts[result.reasonCode] ?? 0) + 1;

  for (const counter of [byCategory[sample.category], byTask[sample.request.task]]) {
    counter.total += 1;
    counter.passed += passed ? 1 : 0;
    counter.allowed += result.ok ? 1 : 0;
    counter.blocked += result.ok ? 0 : 1;
    counter.providerCalls += provider.callCount;
  }
}

const result = {
  total: cases.length,
  passed: cases.length - failures.length,
  failed: failures.length,
  allowed,
  blocked,
  providerCalls,
  zeroCallBlocks: cases.filter((sample) => !sample.expectedOk && sample.expectedProviderCalls === 0).length,
  byCategory,
  byTask,
  reasonCounts,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
