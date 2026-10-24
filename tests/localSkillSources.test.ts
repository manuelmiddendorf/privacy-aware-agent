import assert from "node:assert/strict";
import test from "node:test";
import { LocalSkillAuthority } from "../src/localSkillAuthority.js";
import { createHostResolvedSource, createInlineSyntheticSource, snapshotAuthorizedLocalSkillSources } from "../src/localSkillSources.js";
import type { TrustedLocalSkillPolicy } from "../src/localSkillTypes.js";

const POLICY: TrustedLocalSkillPolicy = {
  schemaVersion: 1,
  policyId: "p7-test-policy",
  organizationId: "p7-lab-org-a",
  principalId: "synthetic-user",
  sessionId: "synthetic-session",
  authorizationVersion: 1,
  purpose: "SYNTHETIC_LOCAL_EDITORIAL",
  contentScope: "SYNTHETIC_DEMO_ONLY",
  executableSkillIds: ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"],
  readableSourceIds: ["allowed-source"],
  allowInlineSyntheticAttachments: true,
  allowSensitiveSyntheticExamples: true,
  actions: false,
  persistence: false,
  limits: {
    maxRequestBytes: 8_192,
    maxSourceCount: 4,
    maxSourceTitleBytes: 128,
    maxSourceBytes: 12_288,
    maxAggregateSourceBytes: 24_576,
    maxParagraphCount: 64,
    maxParagraphBytes: 4_096,
    maxProposalBytes: 2_048,
    maxOutputBytes: 8_192,
    maxModelContextBytes: 12_288,
    maxModelOutputTokens: 768,
  },
};

test("authorized plain text receives stable request-local paragraph IDs without truncation", () => {
  const source = createInlineSyntheticSource({ id: "inline-1", organizationId: POLICY.organizationId, title: "Hinweis" },
    "Erster Absatz.\n\nZweiter Absatz vollständig.");
  const authority = new LocalSkillAuthority(POLICY);
  authority.begin({ schemaVersion: 1, requestNonce: "nonce-0001", text: "Fasse zusammen", sources: [source] });
  const documents = snapshotAuthorizedLocalSkillSources([source], authority.policy.limits);
  assert.deepEqual(documents[0]?.paragraphs.map(({ id, text }) => ({ id, text })), [
    { id: "inline-1:p01", text: "Erster Absatz." },
    { id: "inline-1:p02", text: "Zweiter Absatz vollständig." },
  ]);
  assert.equal(documents[0]?.sectionLabel, "Abschnitt 1");
});

test("denied host source is rejected before its content accessor runs", () => {
  let reads = 0;
  const denied = createHostResolvedSource({ id: "denied-source", organizationId: POLICY.organizationId, title: "Nicht freigegeben" }, () => {
    reads += 1;
    return "Dieser Inhalt darf nicht gelesen werden.";
  });
  const authority = new LocalSkillAuthority(POLICY);
  assert.throws(() => authority.begin({ schemaVersion: 1, requestNonce: "nonce-0002", text: "Fasse zusammen", sources: [denied] }), /source denied/);
  assert.equal(reads, 0);
});

test("foreign organizations and fabricated source handles never become readable", () => {
  const authority = new LocalSkillAuthority(POLICY);
  const foreign = createInlineSyntheticSource({ id: "inline-foreign", organizationId: "p7-lab-org-b", title: "Fremd" }, "Fremder Text");
  assert.throws(() => authority.begin({ schemaVersion: 1, requestNonce: "nonce-0003", text: "Fasse zusammen", sources: [foreign] }), /source denied/);
  const fabricated = {
    metadata: { id: "allowed-source", organizationId: POLICY.organizationId, title: "Fake", kind: "HOST_RESOLVED", capabilities: ["read"], readOnly: true },
    readText: () => "Fake",
  };
  assert.throws(() => authority.begin({ schemaVersion: 1, requestNonce: "nonce-0004", text: "Fasse zusammen", sources: [fabricated as never] }), /source denied/);
});

test("oversized text fails instead of being silently truncated", () => {
  const source = createInlineSyntheticSource({ id: "inline-large", organizationId: POLICY.organizationId, title: "Groß" }, "x".repeat(12_289));
  assert.throws(() => snapshotAuthorizedLocalSkillSources([source], POLICY.limits), /source too large/);
});
