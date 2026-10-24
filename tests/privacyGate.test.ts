import assert from "node:assert/strict";
import test from "node:test";
import { classifyText, redactDirectIdentifiers } from "../src/privacyGate.js";

test("blocks sensitive and uncertain categories with stable reason codes", () => {
  assert.equal(classifyText("patient diagnosis", 1_000).reasonCode, "BLOCK_HEALTH_DATA");
  assert.equal(classifyText("the child's name", 1_000).reasonCode, "BLOCK_CHILD_DATA");
  assert.equal(classifyText("employee salary", 1_000).reasonCode, "BLOCK_SENSITIVE_PERSONNEL");
  assert.equal(classifyText("password: example", 1_000).reasonCode, "BLOCK_CREDENTIAL");
  assert.equal(classifyText("unknown attachment", 1_000).reasonCode, "BLOCK_UNCERTAIN_CONTEXT");
  assert.equal(classifyText("Anna Beispiel ist heute da.", 1_000).reasonCode, "BLOCK_DIRECT_PERSON_NAME");
  assert.equal(classifyText("Bitte schreibe an die erfundene Person Nora Beispiel eine neutrale Einladung.", 1_000).reasonCode, "BLOCK_DIRECT_PERSON_NAME");
  assert.equal(classifyText("Nora Beispiel aus der einzigen roten Gruppe erreicht ihr unter nora@example.invalid.", 1_000).reasonCode, "BLOCK_DIRECT_PERSON_NAME");
  assert.equal(classifyText("Bitte antworte der Person Lina Muster mit einer neutralen Nachricht.", 1_000).reasonCode, "BLOCK_DIRECT_PERSON_NAME");
  assert.equal(classifyText("Emil Probe aus der blauen Gruppe ist heute zuständig.", 1_000).reasonCode, "BLOCK_DIRECT_PERSON_NAME");
  assert.equal(classifyText("Das Kind ist heute müde.", 1_000).reasonCode, "BLOCK_CHILD_DATA");
  assert.equal(classifyText("Die Person hat Fieber.", 1_000).reasonCode, "BLOCK_HEALTH_DATA");
});

test("pseudonymizes direct identifiers without calling it anonymization", () => {
  const result = redactDirectIdentifiers("Email a@example.test or call +49 30 12345678.");
  assert.equal(result.count, 2);
  assert.doesNotMatch(result.text, /example\.test|12345678/);
});

test("rejects oversized input", () => {
  assert.equal(classifyText("abcdef", 5).reasonCode, "BLOCK_INPUT_TOO_LARGE");
});
