import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_POLICY } from "../src/demoPolicy.js";
import { authorizeRequest, validateAgentRequest, validateTaskEvidence, validateTrustedPolicy } from "../src/policy.js";

test("validates the trusted host policy and keeps actions disabled", () => {
  const policy = validateTrustedPolicy(DEMO_POLICY);
  assert.equal(policy.capabilities.actions, false);
});

test("a role name alone cannot grant a source or capability", () => {
  const roleOnly = { ...DEMO_POLICY, roleIds: ["super-admin"], capabilities: { ...DEMO_POLICY.capabilities, draft: false } };
  assert.throws(() => authorizeRequest(roleOnly, { task: "draft", text: "hello", sourceIds: [] }), /capability denied/);
  assert.throws(() => authorizeRequest(roleOnly, { task: "ask", text: "hello", sourceIds: ["arbitrary-url"] }), /source denied/);
});

test("rejects extra policy fields and writable source capability", () => {
  assert.throws(() => validateTrustedPolicy({ ...DEMO_POLICY, userOverride: true }), /shape/);
  const badSource = { ...DEMO_POLICY, sources: [{ ...DEMO_POLICY.sources[0], capabilities: ["write"] }] };
  assert.throws(() => validateTrustedPolicy(badSource), /read-only/);
});

test("request schema cannot carry policy expansion fields", () => {
  assert.throws(() => validateAgentRequest({ task: "ask", text: "hello", sourceIds: [], role: "admin" }), /shape/);
});

test("questions require approved evidence while user-provided summaries and free drafts do not", () => {
  assert.throws(() => validateTaskEvidence({ task: "ask", text: "hello", sourceIds: [] }), /evidence required/);
  assert.doesNotThrow(() => validateTaskEvidence({ task: "summarize", text: "summarize this general text", sourceIds: [] }));
  assert.doesNotThrow(() => validateTaskEvidence({ task: "draft", text: "hello", sourceIds: [] }));
});
