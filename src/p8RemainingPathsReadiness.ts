import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { P7LocalCallBudget } from "./p7LocalCallBudget.js";

export const P8_REMAINING_PATHS_PROTOCOL_SHA256 = "a7ea3adee40c2b38024f2819acd95012763b9a67c75326b10688d7f9f34734ff";
export const P8_REMAINING_PATHS_REPORT_SHA256 = "640d4c5b86915f44d10dbde39fcdba4a40e37c9c71566c788ac5f595f4a67bd2";
export const P8_REMAINING_PATHS_LEDGER_SHA256 = "e6e42cc9a800833dd4f99471fe7843cd3f6d75cd0a03f196dcccc612cc827771";
export const P8_REMAINING_PATHS_FIXTURE_SHA256 = "84d126eb3ae5ea0132c59ae64fd894280b0a081a52441ada89c5afc381ded264";
export const P8_REMAINING_PATHS_SOURCE_SHA256: string = "3b1c14a5b1fea75d73fb58d7bf367fd53bd9402ab3acac3b5655254798b3c261";
export const P8_REMAINING_PATHS_HELPER_SHA256: string = "111c0b138c4bcfa977ceb355219c0c2d5784e19983af366ec69f2a5a9d6228cb";

export const P8_REMAINING_PATHS_SOURCE_FILES = [
  "docs/P8-WORKING-TIME-WORKFLOW-CONTRACT.md",
  "docs/P8-WORKFLOW-CASES.json",
  "src/researchOutboundBoundary.ts",
  "src/localResearchLane.ts",
  "src/workingTimeContractWorkflow.ts",
  "src/workingTimeResearchCatalog.ts",
  "src/ollamaResearchAdapter.ts",
  "src/ollamaWorkingTimeWorkflowAdapter.ts",
  "src/p7LocalCallBudget.ts",
  "src/p8WorkflowReadiness.ts",
  "tests/localResearchLane.test.ts",
  "tests/workingTimeContractWorkflow.test.ts",
  "tests/workingTimeResearchCatalog.test.ts",
  "tests/ollamaWorkingTimeWorkflowAdapter.test.ts",
  "tests/p7LocalCallBudget.test.ts",
  "tests/p8WorkflowReadiness.test.ts",
  "scripts/p8-ollama-serve.sh",
  "scripts/p8-observe-runtime.sh",
] as const;

export const P8_REMAINING_PATHS_HELPER_FILES = [
  "src/p8RemainingPathsRunner.ts",
  "tests/p8RemainingPathsRunner.test.ts",
] as const;

async function fileSha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function orderedRemainingPathsHash(root: string, files: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const path of files) {
    hash.update(path);
    hash.update(Buffer.from([0]));
    hash.update(await readFile(resolve(root, path)));
  }
  return hash.digest("hex");
}

export async function verifyP8RemainingPathsModelFreePreflight(options: {
  readonly root: string;
  readonly protocolPath: string;
  readonly evidenceReportPath: string;
  readonly ledgerPath: string;
}): Promise<void> {
  if (P8_REMAINING_PATHS_SOURCE_SHA256 === "UNFROZEN" || P8_REMAINING_PATHS_HELPER_SHA256 === "UNFROZEN") {
    throw new Error("P8 remaining paths source is not independently frozen; stop before runtime or claim");
  }
  const [protocolHash, reportHash, fixtureHash, ledgerHash, sourceHash, helperHash, sandboxHash, ledger] = await Promise.all([
    fileSha256(options.protocolPath),
    fileSha256(options.evidenceReportPath),
    fileSha256(resolve(options.root, "docs/P8-WORKFLOW-CASES.json")),
    fileSha256(options.ledgerPath),
    orderedRemainingPathsHash(options.root, P8_REMAINING_PATHS_SOURCE_FILES),
    orderedRemainingPathsHash(options.root, P8_REMAINING_PATHS_HELPER_FILES),
    fileSha256(resolve(options.root, "scripts/p7-ollama-existing-identity.sb")),
    new P7LocalCallBudget(options.ledgerPath).readSummary(),
  ]);
  if (protocolHash !== P8_REMAINING_PATHS_PROTOCOL_SHA256 || reportHash !== P8_REMAINING_PATHS_REPORT_SHA256 ||
      fixtureHash !== P8_REMAINING_PATHS_FIXTURE_SHA256 || ledgerHash !== P8_REMAINING_PATHS_LEDGER_SHA256 ||
      sourceHash !== P8_REMAINING_PATHS_SOURCE_SHA256 || helperHash !== P8_REMAINING_PATHS_HELPER_SHA256 ||
      sandboxHash !== "3f1e6911c5013ac6c7cadaba6f4e73cd4d934c56dd25b43343badb8d8fc1dbe6" || ledger.reservedPosts !== 15 ||
      !ledger.developmentClaimed || !ledger.correctionDevelopmentClaimed || !ledger.workingTimeWorkflowClaimed ||
      !ledger.workingTimeWorkflowCorrectionClaimed || ledger.workingTimeRemainingPathsClaimed) {
    throw new Error("P8 remaining paths model-free preflight mismatch; stop before runtime or claim");
  }
}
