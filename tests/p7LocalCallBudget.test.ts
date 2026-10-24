import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { P7LocalCallBudget, P7_LOCAL_POST_HARD_LIMIT } from "../src/p7LocalCallBudget.js";

test("P7 budget persists every reservation before the hard fortieth POST", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p7-call-budget-"));
  const path = join(directory, "budget.json");
  const budget = new P7LocalCallBudget(path);
  await budget.claimDevelopmentOnce();
  for (let index = 0; index < P7_LOCAL_POST_HARD_LIMIT; index += 1) {
    const reservation = await budget.reserve({
      phase: index < 18 ? "development" : "holdout",
      promptConfigId: index % 2 === 0 ? "P7_SKILLS_A" : "P7_SKILLS_B",
      caseId: `case-${index + 1}`,
      stage: index % 2 === 0 ? "proposal" : "generation",
    });
    assert.equal(reservation.ordinal, index + 1);
  }
  await assert.rejects(budget.reserve({
    phase: "ui-smoke", promptConfigId: "P7_SKILLS_A", caseId: "overflow", stage: "proposal",
  }), /hard limit/);
  assert.equal(await budget.readReservedPosts(), 40);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  const persisted = JSON.parse(await readFile(path, "utf8"));
  assert.equal(persisted.reservations.length, 40);
  assert.equal(persisted.reservations[39].ordinal, 40);
});

test("P7 budget rejects malformed state instead of resetting its count", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p7-call-budget-invalid-"));
  const path = join(directory, "budget.json");
  const handle = await import("node:fs/promises").then(({ open }) => open(path, "wx", 0o600));
  await handle.writeFile('{"reservedPosts":0}\n');
  await handle.close();
  const budget = new P7LocalCallBudget(path);
  await assert.rejects(budget.readReservedPosts(), /invalid/);
  await assert.rejects(budget.reserve({
    phase: "development", promptConfigId: "P7_SKILLS_A", caseId: "blocked", stage: "proposal",
  }), /invalid/);
});

test("development phase is durably single-use after partial or complete runs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p7-development-claim-"));
  const path = join(directory, "budget.json");
  const first = new P7LocalCallBudget(path);
  await first.claimDevelopmentOnce();
  await first.reserve({
    phase: "development", promptConfigId: "P7_SKILLS_A", caseId: "P7-01", stage: "proposal",
  });
  await assert.rejects(new P7LocalCallBudget(path).claimDevelopmentOnce(), /already claimed/);
  assert.equal(await new P7LocalCallBudget(path).readReservedPosts(), 1);

  const fullDirectory = await mkdtemp(join(tmpdir(), "p7-development-complete-"));
  const fullPath = join(fullDirectory, "budget.json");
  const full = new P7LocalCallBudget(fullPath);
  await full.claimDevelopmentOnce();
  for (let index = 0; index < 18; index += 1) {
    await full.reserve({
      phase: "development",
      promptConfigId: index < 9 ? "P7_SKILLS_A" : "P7_SKILLS_B",
      caseId: `P7-${String(index + 1).padStart(2, "0")}`,
      stage: index % 2 === 0 ? "proposal" : "generation",
    });
  }
  await assert.rejects(new P7LocalCallBudget(fullPath).claimDevelopmentOnce(), /already claimed/);
  assert.equal(await new P7LocalCallBudget(fullPath).readReservedPosts(), 18);
});

test("parallel development claims allow exactly one winner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p7-development-parallel-"));
  const path = join(directory, "budget.json");
  const attempts = await Promise.allSettled([
    new P7LocalCallBudget(path).claimDevelopmentOnce(),
    new P7LocalCallBudget(path).claimDevelopmentOnce(),
  ]);
  assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(attempts.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(await new P7LocalCallBudget(path).readReservedPosts(), 0);
});
