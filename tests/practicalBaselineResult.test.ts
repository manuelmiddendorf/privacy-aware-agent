import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

test("the frozen P1 artifact preserves the preregistered offline original run", async () => {
  const catalogText = await readFile(resolve("docs/PRACTICAL-CASES-P1.json"), "utf8");
  const resultText = await readFile(resolve("docs/PRACTICAL-BASELINE-RESULT-P1.json"), "utf8");
  assert.equal(sha256(catalogText), "5f92fce1b657d6b9cbf7a78ddb3a163955e8d05b6c26451c9e10b3d0d47f3e5c");
  assert.equal(sha256(resultText), "2f29de6e992840abc71c40d035a976e48d351ab1bb048dafc118ddc5d570c765");

  const result = JSON.parse(resultText) as {
    provider: string;
    networkCalls: number;
    caseCount: number;
    results: Array<{
      id: string;
      actual: { ok: boolean; reasonCode: string };
      providerCalls: number;
      providerInputs: Array<{ text: string; documents: Array<{ id: string }> }>;
      fixtureBoundAssessorDiagnostic?: { result: { reasonCode: string }; providerCalls: number };
    }>;
  };
  assert.equal(result.provider, "MOCK_OFFLINE");
  assert.equal(result.networkCalls, 0);
  assert.equal(result.caseCount, 16);
  assert.equal(result.results.length, 16);
  assert.ok(result.results.every((entry) => entry.actual.ok ? entry.providerCalls === 1 : entry.providerCalls === 0));

  const byId = new Map(result.results.map((entry) => [entry.id, entry]));
  for (const id of ["P09", "P10", "P11"]) {
    assert.equal(byId.get(id)?.actual.ok, true);
    assert.equal(byId.get(id)?.providerInputs.length, 1);
  }
  for (const id of ["P08", "P14"]) {
    assert.equal(byId.get(id)?.actual.reasonCode, "BLOCK_SOURCE_DENIED");
    assert.equal(byId.get(id)?.providerInputs.length, 0);
  }
  assert.equal(byId.get("P06")?.fixtureBoundAssessorDiagnostic?.result.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT");
  assert.equal(byId.get("P06")?.fixtureBoundAssessorDiagnostic?.providerCalls, 0);
  assert.ok(result.results.flatMap((entry) => entry.providerInputs)
    .every((input) => input.documents.every((document) => document.id !== "practice-private-minutes")));
  assert.doesNotMatch(resultText, /OPENAI_API_KEY|Bearer\s|\.env\.openai|openai-live-demo-budget|sk-[A-Za-z0-9]/);
});
