import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { P7_AMENDMENT_AUTHORIZED_POST_LIMIT, P7LocalCallBudget, P7_LOCAL_POST_HARD_LIMIT } from "../src/p7LocalCallBudget.js";

test("P7 budget preserves the hard 40 ceiling and enforces the narrower authorized 32 POST ceiling", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p7-call-budget-"));
  const path = join(directory, "budget.json");
  const budget = new P7LocalCallBudget(path);
  await budget.claimDevelopmentOnce();
  assert.equal(P7_LOCAL_POST_HARD_LIMIT, 40);
  for (let index = 0; index < P7_AMENDMENT_AUTHORIZED_POST_LIMIT; index += 1) {
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
  }), /authorized POST limit/);
  assert.equal(await budget.readReservedPosts(), 32);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  const persisted = JSON.parse(await readFile(path, "utf8"));
  assert.equal(persisted.reservations.length, 32);
  assert.equal(persisted.reservations[31].ordinal, 32);
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

test("correction development claim preserves the original ten-call history and is single-use", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p7-correction-claim-"));
  const path = join(directory, "budget.json");
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
  await budget.claimCorrectionDevelopmentOnce();
  await budget.reserve({
    phase: "correction-development",
    promptConfigId: "P7_ROUTE_V2",
    caseId: "P7-01",
    stage: "proposal",
  });
  assert.equal(await budget.readReservedPosts(), 11);
  await assert.rejects(new P7LocalCallBudget(path).claimCorrectionDevelopmentOnce(), /already claimed/);
});

test("correction claim refuses missing history and parallel reuse", async () => {
  const missingDirectory = await mkdtemp(join(tmpdir(), "p7-correction-missing-"));
  await assert.rejects(
    new P7LocalCallBudget(join(missingDirectory, "budget.json")).claimCorrectionDevelopmentOnce(),
    /preserved ten-call/,
  );

  const directory = await mkdtemp(join(tmpdir(), "p7-correction-parallel-"));
  const path = join(directory, "budget.json");
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
  const attempts = await Promise.allSettled([
    new P7LocalCallBudget(path).claimCorrectionDevelopmentOnce(),
    new P7LocalCallBudget(path).claimCorrectionDevelopmentOnce(),
  ]);
  assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(attempts.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(await new P7LocalCallBudget(path).readReservedPosts(), 10);
});

test("correction claim upgrades the preserved legacy ten-call ledger without resetting it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p7-correction-legacy-"));
  const path = join(directory, "budget.json");
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
  const legacy = JSON.parse(await readFile(path, "utf8"));
  delete legacy.authorizedLimit;
  delete legacy.correctionDevelopmentClaimedAt;
  delete legacy.workingTimeWorkflowClaimedAt;
  delete legacy.workingTimeWorkflowCorrectionClaim;
  delete legacy.workingTimeRemainingPathsClaim;
  const { open } = await import("node:fs/promises");
  const handle = await open(path, "w", 0o600);
  await handle.writeFile(`${JSON.stringify(legacy, null, 2)}\n`);
  await handle.close();

  const upgraded = new P7LocalCallBudget(path);
  assert.equal(await upgraded.readReservedPosts(), 10);
  await upgraded.claimCorrectionDevelopmentOnce();
  await upgraded.reserve({
    phase: "correction-development", promptConfigId: "P7_ROUTE_V2", caseId: "P7-01", stage: "proposal",
  });
  assert.equal(await upgraded.readReservedPosts(), 11);
  const persisted = JSON.parse(await readFile(path, "utf8"));
  assert.equal(persisted.authorizedLimit, 32);
  assert.equal(typeof persisted.correctionDevelopmentClaimedAt, "string");
});

test("working-time workflow claim preserves eleven-call history, is single-use and caps the phase at eight", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p8-workflow-claim-"));
  const path = join(directory, "budget.json");
  const budget = new P7LocalCallBudget(path);
  await budget.claimDevelopmentOnce();
  for (let index = 0; index < 10; index += 1) await budget.reserve({ phase: "development", promptConfigId: index < 5 ? "P7_SKILLS_A" : "P7_SKILLS_B", caseId: `prior-${index + 1}`, stage: "proposal" });
  await budget.claimCorrectionDevelopmentOnce();
  await budget.reserve({ phase: "correction-development", promptConfigId: "P7_ROUTE_V2", caseId: "P7-01", stage: "proposal" });
  await budget.claimWorkingTimeWorkflowOnce();
  assert.deepEqual(await budget.readSummary(), { reservedPosts: 11, developmentClaimed: true, correctionDevelopmentClaimed: true, workingTimeWorkflowClaimed: true, workingTimeWorkflowCorrectionClaimed: false, workingTimeRemainingPathsClaimed: false });
  for (let index = 0; index < 8; index += 1) await budget.reserve({ phase: "working-time-workflow", promptConfigId: "P8_WORKING_TIME_V1", caseId: `WF-${index + 1}`, stage: index % 2 === 0 ? "understand" : "draft" });
  await assert.rejects(budget.reserve({ phase: "working-time-workflow", promptConfigId: "P8_WORKING_TIME_V1", caseId: "WF-overflow", stage: "understand" }), /workflow POST limit/);
  await assert.rejects(new P7LocalCallBudget(path).claimWorkingTimeWorkflowOnce(), /already claimed/);
  assert.equal(await budget.readReservedPosts(), 19);
});

test("working-time workflow claim refuses histories other than the preserved technical-stop count", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p8-workflow-history-"));
  const path = join(directory, "budget.json");
  const budget = new P7LocalCallBudget(path);
  await budget.claimDevelopmentOnce();
  for (let index = 0; index < 10; index += 1) await budget.reserve({ phase: "development", promptConfigId: index < 5 ? "P7_SKILLS_A" : "P7_SKILLS_B", caseId: `prior-${index + 1}`, stage: "proposal" });
  await budget.claimCorrectionDevelopmentOnce();
  await assert.rejects(budget.claimWorkingTimeWorkflowOnce(), /eleven-call history/);
  assert.equal(await budget.readReservedPosts(), 10);
});

test("working-time correction claim binds the failed report and count twelve without resetting history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p8-workflow-correction-"));
  const path = join(directory, "budget.json");
  const budget = new P7LocalCallBudget(path);
  await budget.claimDevelopmentOnce();
  for (let index = 0; index < 10; index += 1) await budget.reserve({ phase: "development", promptConfigId: index < 5 ? "P7_SKILLS_A" : "P7_SKILLS_B", caseId: `prior-${index + 1}`, stage: "proposal" });
  await budget.claimCorrectionDevelopmentOnce();
  await budget.reserve({ phase: "correction-development", promptConfigId: "P7_ROUTE_V2", caseId: "P7-01", stage: "proposal" });
  await budget.claimWorkingTimeWorkflowOnce();
  await budget.reserve({ phase: "working-time-workflow", promptConfigId: "P8_WORKING_TIME_V1", caseId: "WF01_COMPLETE_LOCAL", stage: "understand" });
  await budget.claimWorkingTimeWorkflowCorrectionOnce({ historicalReportSha256: "fcdb0e869bf7689ce823bebdf9af9436a0052318be04269383538c2a074ce255", correctedCoreSha256: "a".repeat(64), runtimeMetadataSha256: "b".repeat(64) });
  assert.equal((await budget.readSummary()).workingTimeWorkflowCorrectionClaimed, true);
  assert.equal(await budget.readReservedPosts(), 12);
  await assert.rejects(budget.claimWorkingTimeWorkflowCorrectionOnce({ historicalReportSha256: "fcdb0e869bf7689ce823bebdf9af9436a0052318be04269383538c2a074ce255", correctedCoreSha256: "a".repeat(64), runtimeMetadataSha256: "b".repeat(64) }), /already claimed/);
});

test("remaining-path reservations require their separate exact-history claim", async () => {
  const directory = await mkdtemp(join(tmpdir(), "p8-remaining-paths-gate-"));
  const path = join(directory, "budget.json");
  const budget = new P7LocalCallBudget(path);
  await budget.claimDevelopmentOnce();
  for (let index = 0; index < 10; index += 1) await budget.reserve({ phase: "development", promptConfigId: index < 5 ? "P7_SKILLS_A" : "P7_SKILLS_B", caseId: `prior-${index + 1}`, stage: "proposal" });
  await budget.claimCorrectionDevelopmentOnce();
  await budget.reserve({ phase: "correction-development", promptConfigId: "P7_ROUTE_V2", caseId: "P7-01", stage: "proposal" });
  await budget.claimWorkingTimeWorkflowOnce();
  await budget.reserve({ phase: "working-time-workflow", promptConfigId: "P8_WORKING_TIME_V1", caseId: "WF01_COMPLETE_LOCAL", stage: "understand" });
  await budget.claimWorkingTimeWorkflowCorrectionOnce({ historicalReportSha256: "fcdb0e869bf7689ce823bebdf9af9436a0052318be04269383538c2a074ce255", correctedCoreSha256: "a".repeat(64), runtimeMetadataSha256: "b".repeat(64) });
  await budget.reserve({ phase: "working-time-workflow", promptConfigId: "P8_WORKING_TIME_V1", caseId: "WF01_COMPLETE_LOCAL", stage: "understand" });
  await budget.reserve({ phase: "working-time-workflow", promptConfigId: "P8_WORKING_TIME_V1", caseId: "WF01_COMPLETE_LOCAL", stage: "draft" });
  await budget.reserve({ phase: "working-time-workflow", promptConfigId: "P8_WORKING_TIME_V1", caseId: "WF02_MISSING_THEN_CONFIRMED", stage: "understand" });
  assert.equal(await budget.readReservedPosts(), 15);
  await assert.rejects(budget.reserve({ phase: "working-time-workflow", promptConfigId: "P8_WORKING_TIME_V1", caseId: "WF02_EXPLICIT_CONFIRMED_ACTION", stage: "understand" }), /remaining paths are not claimed/);
  await assert.rejects(budget.claimWorkingTimeRemainingPathsOnce({
    protocolSha256: "a7ea3adee40c2b38024f2819acd95012763b9a67c75326b10688d7f9f34734ff",
    evidenceReportSha256: "640d4c5b86915f44d10dbde39fcdba4a40e37c9c71566c788ac5f595f4a67bd2",
    fixtureSha256: "84d126eb3ae5ea0132c59ae64fd894280b0a081a52441ada89c5afc381ded264",
    ledgerBeforeSha256: "e6e42cc9a800833dd4f99471fe7843cd3f6d75cd0a03f196dcccc612cc827771",
    sourceCoreSha256: "c".repeat(64), helperSha256: "d".repeat(64), runtimeMetadataSha256: "e".repeat(64),
  }), /exact preserved fifteen-call history/);
  assert.equal((await budget.readSummary()).workingTimeRemainingPathsClaimed, false);
  assert.equal(await budget.readReservedPosts(), 15);
});
