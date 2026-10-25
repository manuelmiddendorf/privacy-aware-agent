import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { P7LocalCallBudget } from "./p7LocalCallBudget.js";

export const P8_WORKFLOW_PROTOCOL_SHA256 = "d721b00c0334c8cdc7bd85ee98aee4bc0bdb734e0159405c2f83fcdc9fccb9fe";
export const P8_FIELDSET_CORRECTION_PROTOCOL_SHA256 = "65e5a8e5bf045fb8cc6c0b7fa5146316dcecbcdeabceb5f83433b646854d6c63";
export const P8_FAILED_REPORT_SHA256 = "fcdb0e869bf7689ce823bebdf9af9436a0052318be04269383538c2a074ce255";
export const P8_FAILED_LEDGER_SHA256 = "5aee7da562b7143d1bf01f2f5876e5941d60d0a69963f6ca67d0e4d62ab3bc76";
export const P8_FAILED_SOURCE_ARCHIVE_SHA256 = "5aa484b7aa7e0d7ccf7bd55a54b9e9f7aa6f5209e0a5def48954514e68f2f6b6";
export const P8_SANDBOX_PROFILE_SHA256 = "3f1e6911c5013ac6c7cadaba6f4e73cd4d934c56dd25b43343badb8d8fc1dbe6";
export const P8_PINNED_RUNTIME_SHA256 = "61e3067857f23046338a3d1a14360ce749fbe0aa0b6168e728b7d11c1e219619";
export const P8_PINNED_MANIFEST_FILE_SHA256 = "6214d088d3846e16c9fe00adcbabdbfddc61ce4a70daacc46cb2310c38603054";
export const P8_PINNED_MODEL_MANIFEST_SHA256 = "0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0";

// This value is filled only after independent source review. `UNFROZEN` is a hard stop.
export const P8_WORKFLOW_CORE_SHA256: string = "966a953ef8a00e2a0fd4acca2772e924e94fb49c5acece5452ca263dbd4d8ce0";

export const P8_WORKFLOW_CORE_FILES = [
  "docs/P8-WORKING-TIME-WORKFLOW-CONTRACT.md",
  "docs/P8-WORKFLOW-CASES.json",
  "src/researchOutboundBoundary.ts",
  "src/localResearchLane.ts",
  "src/workingTimeContractWorkflow.ts",
  "src/workingTimeResearchCatalog.ts",
  "src/ollamaWorkingTimeWorkflowAdapter.ts",
  "src/p7LocalCallBudget.ts",
  "src/p8WorkflowRunner.ts",
  "tests/localResearchLane.test.ts",
  "tests/workingTimeContractWorkflow.test.ts",
  "tests/workingTimeResearchCatalog.test.ts",
  "tests/ollamaWorkingTimeWorkflowAdapter.test.ts",
  "tests/p7LocalCallBudget.test.ts",
  "tests/p8WorkflowRunner.test.ts",
  "scripts/p8-ollama-serve.sh",
  "scripts/p8-observe-runtime.sh",
] as const;

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

async function fileSha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function orderedP8WorkflowCoreHash(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const path of P8_WORKFLOW_CORE_FILES) {
    hash.update(path);
    hash.update(Buffer.from([0]));
    hash.update(await readFile(resolve(root, path)));
  }
  return hash.digest("hex");
}

export async function verifyP8ModelFreePreflight(options: {
  readonly root: string;
  readonly protocolPath: string;
  readonly ledgerPath: string;
}): Promise<void> {
  if (P8_WORKFLOW_CORE_SHA256 === "UNFROZEN") throw new Error("P8 workflow source is not independently frozen; stop before runtime or claim");
  const [protocolHash, coreHash, sandboxHash, ledger] = await Promise.all([
    fileSha256(options.protocolPath),
    orderedP8WorkflowCoreHash(options.root),
    fileSha256(resolve(options.root, "scripts/p7-ollama-existing-identity.sb")),
    new P7LocalCallBudget(options.ledgerPath).readSummary(),
  ]);
  if (protocolHash !== P8_WORKFLOW_PROTOCOL_SHA256 || coreHash !== P8_WORKFLOW_CORE_SHA256 || sandboxHash !== P8_SANDBOX_PROFILE_SHA256 ||
      ledger.reservedPosts !== 11 || !ledger.developmentClaimed || !ledger.correctionDevelopmentClaimed || ledger.workingTimeWorkflowClaimed) {
    throw new Error("P8 model-free preflight mismatch; stop before runtime or claim");
  }
}

export async function verifyP8CorrectionModelFreePreflight(options: {
  readonly root: string;
  readonly correctionProtocolPath: string;
  readonly historicalReportPath: string;
  readonly historicalSourceArchivePath: string;
  readonly ledgerPath: string;
}): Promise<void> {
  if (P8_WORKFLOW_CORE_SHA256 === "UNFROZEN") throw new Error("P8 corrected workflow source is not independently frozen; stop before runtime or claim");
  const [protocolHash, reportHash, archiveHash, ledgerHash, coreHash, sandboxHash, ledger] = await Promise.all([
    fileSha256(options.correctionProtocolPath),
    fileSha256(options.historicalReportPath),
    fileSha256(options.historicalSourceArchivePath),
    fileSha256(options.ledgerPath),
    orderedP8WorkflowCoreHash(options.root),
    fileSha256(resolve(options.root, "scripts/p7-ollama-existing-identity.sb")),
    new P7LocalCallBudget(options.ledgerPath).readSummary(),
  ]);
  if (protocolHash !== P8_FIELDSET_CORRECTION_PROTOCOL_SHA256 || reportHash !== P8_FAILED_REPORT_SHA256 ||
      archiveHash !== P8_FAILED_SOURCE_ARCHIVE_SHA256 || ledgerHash !== P8_FAILED_LEDGER_SHA256 || coreHash !== P8_WORKFLOW_CORE_SHA256 ||
      sandboxHash !== P8_SANDBOX_PROFILE_SHA256 || ledger.reservedPosts !== 12 || !ledger.developmentClaimed ||
      !ledger.correctionDevelopmentClaimed || !ledger.workingTimeWorkflowClaimed || ledger.workingTimeWorkflowCorrectionClaimed) {
    throw new Error("P8 correction preflight mismatch; stop before runtime or claim");
  }
}

export function verifyP8LoopbackRuntimeReady(value: unknown, now = Date.now()): void {
  const keys = ["schemaVersion", "runtimePid", "listenerPid", "listenerHost", "listenerPort", "observedAt", "runtimeVersion", "runtimeSha256", "manifestFileSha256", "modelManifestSha256", "sandboxVerified"];
  if (!exactRecord(value, keys)) throw new Error("P8 runtime readiness metadata invalid");
  const item = value as Record<string, unknown>;
  const observed = typeof item.observedAt === "string" ? Date.parse(item.observedAt) : Number.NaN;
  if (item.schemaVersion !== 1 || !Number.isInteger(item.runtimePid) || (item.runtimePid as number) < 1 || item.listenerPid !== item.runtimePid ||
      item.listenerHost !== "127.0.0.1" || item.listenerPort !== 11435 || item.runtimeVersion !== "0.40.4" ||
      item.runtimeSha256 !== P8_PINNED_RUNTIME_SHA256 || item.manifestFileSha256 !== P8_PINNED_MANIFEST_FILE_SHA256 ||
      item.modelManifestSha256 !== P8_PINNED_MODEL_MANIFEST_SHA256 || item.sandboxVerified !== true ||
      Number.isNaN(observed) || observed > now || now - observed > 30_000) {
    throw new Error("P8 runtime is not the freshly observed pinned loopback listener");
  }
}
