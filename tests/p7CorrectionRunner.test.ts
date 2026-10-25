import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { captureP7BenchmarkProposal, runP7CorrectionDevelopment } from "../src/p7CorrectionRunner.js";
import { P7LocalCallBudget } from "../src/p7LocalCallBudget.js";
import { P6_OLLAMA_MODEL } from "../src/ollamaResearchAdapter.js";

function envelope(content: unknown) {
  return {
    status: 200,
    body: JSON.stringify({
      model: P6_OLLAMA_MODEL,
      done: true,
      done_reason: "stop",
      message: { role: "assistant", content: JSON.stringify(content) },
    }),
  };
}

async function createHistoricalLedger(path: string): Promise<void> {
  const budget = new P7LocalCallBudget(path);
  await budget.claimDevelopmentOnce();
  for (let index = 0; index < 10; index += 1) {
    await budget.reserve({
      phase: "development",
      promptConfigId: index < 5 ? "P7_SKILLS_A" : "P7_SKILLS_B",
      caseId: `prior-${index + 1}`,
      stage: "proposal",
    });
  }
}

test("historical route-v2 runner rejects the evolved working tree before claim, report or transport", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p7-route-v2-"));
  const ledgerPath = join(directory, "budget.json");
  await createHistoricalLedger(ledgerPath);
  const ledgerBefore = await readFile(ledgerPath, "utf8");
  let calls = 0;
  const outputPath = join(directory, "report.json");
  await assert.rejects(runP7CorrectionDevelopment({
    root: resolve("."), outputPath, ledgerPath,
    transport: async () => { calls += 1; return envelope({}); },
  }), /route-v2 frozen input mismatch; stop before local inference/);
  assert.equal(calls, 0);
  assert.equal(await readFile(ledgerPath, "utf8"), ledgerBefore);
  const ledger = JSON.parse(ledgerBefore) as { reservedPosts: number; correctionDevelopmentClaimedAt: string | null };
  assert.equal(ledger.reservedPosts, 10);
  assert.equal(ledger.correctionDevelopmentClaimedAt, null);
  await assert.rejects(readFile(outputPath, "utf8"), (error: unknown) =>
    (error as NodeJS.ErrnoException).code === "ENOENT");
});

test("historical route-v2 frozen-source rejection is repeatable without consuming the ledger", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p7-route-v2-repeat-"));
  const ledgerPath = join(directory, "budget.json");
  await createHistoricalLedger(ledgerPath);
  const ledgerBefore = await readFile(ledgerPath, "utf8");
  let calls = 0;
  for (const outputName of ["report-first.json", "report-second.json"]) {
    await assert.rejects(runP7CorrectionDevelopment({
      root: resolve("."),
      outputPath: join(directory, outputName),
      ledgerPath,
      transport: async () => { calls += 1; return envelope({}); },
    }), /route-v2 frozen input mismatch; stop before local inference/);
  }
  assert.equal(calls, 0);
  assert.equal(await readFile(ledgerPath, "utf8"), ledgerBefore);
});

test("benchmark proposal capture keeps only valid routes and bounded structural markers", () => {
  assert.deepEqual(captureP7BenchmarkProposal({ schemaVersion: 1, route: "COMPOSE_TEXT" }), {
    captured: true,
    byteLength: 42,
    value: { schemaVersion: 1, route: "COMPOSE_TEXT" },
  });
  assert.deepEqual(captureP7BenchmarkProposal({ schemaVersion: 1, route: "UNKNOWN_ROUTE" }), {
    captured: false,
    reason: "unknown_route",
    topLevelKeys: ["schemaVersion", "route"],
  });
  const arbitraryKey = `secret-${"x".repeat(2_000)}`;
  assert.deepEqual(captureP7BenchmarkProposal({ schemaVersion: 1, route: "COMPOSE_TEXT", [arbitraryKey]: "value" }), {
    captured: false,
    reason: "too_large",
    topLevelKeys: ["schemaVersion", "route", "unknown"],
  });
});
