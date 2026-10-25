import { createHash } from "node:crypto";
import { open, mkdir, readFile, rename, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export const P7_LOCAL_POST_HARD_LIMIT = 40;
export const P7_AMENDMENT_AUTHORIZED_POST_LIMIT = 32;

export interface P7CallReservation {
  readonly ordinal: number;
  readonly phase: "development" | "correction-development" | "working-time-workflow" | "holdout" | "ui-smoke";
  readonly promptConfigId: "P7_SKILLS_A" | "P7_SKILLS_B" | "P7_ROUTE_V2" | "P8_WORKING_TIME_V1";
  readonly caseId: string;
  readonly stage: "proposal" | "generation" | "understand" | "draft";
  readonly reservedAt: string;
}

interface P7CallLedger {
  readonly schemaVersion: 1;
  readonly campaign: "P7_LOCAL_SKILLS";
  readonly hardLimit: 40;
  readonly authorizedLimit: 32;
  readonly developmentClaimedAt: string | null;
  readonly correctionDevelopmentClaimedAt: string | null;
  readonly workingTimeWorkflowClaimedAt: string | null;
  readonly workingTimeWorkflowCorrectionClaim: null | {
    readonly claimedAt: string;
    readonly historicalReportSha256: string;
    readonly correctedCoreSha256: string;
    readonly runtimeMetadataSha256: string;
  };
  readonly workingTimeRemainingPathsClaim: null | {
    readonly claimedAt: string;
    readonly protocolSha256: string;
    readonly evidenceReportSha256: string;
    readonly fixtureSha256: string;
    readonly ledgerBeforeSha256: string;
    readonly sourceCoreSha256: string;
    readonly helperSha256: string;
    readonly runtimeMetadataSha256: string;
  };
  readonly reservedPosts: number;
  readonly reservations: readonly P7CallReservation[];
}

function validReservation(value: unknown, index: number): value is P7CallReservation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).sort().join("|") === "caseId|ordinal|phase|promptConfigId|reservedAt|stage" &&
    item.ordinal === index + 1 && ["development", "correction-development", "working-time-workflow", "holdout", "ui-smoke"].includes(item.phase as string) &&
    (item.promptConfigId === "P7_SKILLS_A" || item.promptConfigId === "P7_SKILLS_B" || item.promptConfigId === "P7_ROUTE_V2" || item.promptConfigId === "P8_WORKING_TIME_V1") &&
    typeof item.caseId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(item.caseId) &&
    (item.stage === "proposal" || item.stage === "generation" || item.stage === "understand" || item.stage === "draft") &&
    typeof item.reservedAt === "string" && !Number.isNaN(Date.parse(item.reservedAt));
}

function parseLedger(text: string): P7CallLedger {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("P7 call ledger is invalid"); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("P7 call ledger is invalid");
  const ledger = value as Record<string, unknown>;
  const keys = Object.keys(ledger).sort().join("|");
  const legacyKeys = "campaign|developmentClaimedAt|hardLimit|reservations|reservedPosts|schemaVersion";
  const currentKeys = "authorizedLimit|campaign|correctionDevelopmentClaimedAt|developmentClaimedAt|hardLimit|reservations|reservedPosts|schemaVersion";
  const workflowKeys = "authorizedLimit|campaign|correctionDevelopmentClaimedAt|developmentClaimedAt|hardLimit|reservations|reservedPosts|schemaVersion|workingTimeWorkflowClaimedAt";
  const workflowCorrectionKeys = "authorizedLimit|campaign|correctionDevelopmentClaimedAt|developmentClaimedAt|hardLimit|reservations|reservedPosts|schemaVersion|workingTimeWorkflowClaimedAt|workingTimeWorkflowCorrectionClaim";
  const remainingPathsKeys = "authorizedLimit|campaign|correctionDevelopmentClaimedAt|developmentClaimedAt|hardLimit|reservations|reservedPosts|schemaVersion|workingTimeRemainingPathsClaim|workingTimeWorkflowClaimedAt|workingTimeWorkflowCorrectionClaim";
  const correctionClaim = ledger.workingTimeWorkflowCorrectionClaim;
  const validCorrectionClaim = correctionClaim === null || (typeof correctionClaim === "object" && !Array.isArray(correctionClaim) && correctionClaim !== null &&
    Object.keys(correctionClaim).sort().join("|") === "claimedAt|correctedCoreSha256|historicalReportSha256|runtimeMetadataSha256" &&
    typeof (correctionClaim as Record<string, unknown>).claimedAt === "string" && !Number.isNaN(Date.parse((correctionClaim as Record<string, unknown>).claimedAt as string)) &&
    ["correctedCoreSha256", "historicalReportSha256", "runtimeMetadataSha256"].every((key) => typeof (correctionClaim as Record<string, unknown>)[key] === "string" && /^[a-f0-9]{64}$/.test((correctionClaim as Record<string, unknown>)[key] as string)));
  const remainingClaim = ledger.workingTimeRemainingPathsClaim;
  const validRemainingClaim = remainingClaim === null || (typeof remainingClaim === "object" && !Array.isArray(remainingClaim) && remainingClaim !== null &&
    Object.keys(remainingClaim).sort().join("|") === "claimedAt|evidenceReportSha256|fixtureSha256|helperSha256|ledgerBeforeSha256|protocolSha256|runtimeMetadataSha256|sourceCoreSha256" &&
    typeof (remainingClaim as Record<string, unknown>).claimedAt === "string" && !Number.isNaN(Date.parse((remainingClaim as Record<string, unknown>).claimedAt as string)) &&
    ["protocolSha256", "evidenceReportSha256", "fixtureSha256", "ledgerBeforeSha256", "sourceCoreSha256", "helperSha256", "runtimeMetadataSha256"].every((key) => typeof (remainingClaim as Record<string, unknown>)[key] === "string" && /^[a-f0-9]{64}$/.test((remainingClaim as Record<string, unknown>)[key] as string)));
  if ((keys !== legacyKeys && keys !== currentKeys && keys !== workflowKeys && keys !== workflowCorrectionKeys && keys !== remainingPathsKeys) ||
      ledger.schemaVersion !== 1 || ledger.campaign !== "P7_LOCAL_SKILLS" || ledger.hardLimit !== P7_LOCAL_POST_HARD_LIMIT ||
      ((keys === currentKeys || keys === workflowKeys || keys === workflowCorrectionKeys || keys === remainingPathsKeys) && ledger.authorizedLimit !== P7_AMENDMENT_AUTHORIZED_POST_LIMIT) ||
      !(ledger.developmentClaimedAt === null ||
        (typeof ledger.developmentClaimedAt === "string" && !Number.isNaN(Date.parse(ledger.developmentClaimedAt)))) ||
      ((keys === currentKeys || keys === workflowKeys || keys === workflowCorrectionKeys || keys === remainingPathsKeys) && !(ledger.correctionDevelopmentClaimedAt === null ||
        (typeof ledger.correctionDevelopmentClaimedAt === "string" && !Number.isNaN(Date.parse(ledger.correctionDevelopmentClaimedAt))))) ||
      ((keys === workflowKeys || keys === workflowCorrectionKeys || keys === remainingPathsKeys) && !(ledger.workingTimeWorkflowClaimedAt === null ||
        (typeof ledger.workingTimeWorkflowClaimedAt === "string" && !Number.isNaN(Date.parse(ledger.workingTimeWorkflowClaimedAt))))) ||
      ((keys === workflowCorrectionKeys || keys === remainingPathsKeys) && !validCorrectionClaim) ||
      (keys === remainingPathsKeys && !validRemainingClaim) ||
      !Number.isInteger(ledger.reservedPosts) || (ledger.reservedPosts as number) < 0 ||
      (ledger.reservedPosts as number) > P7_LOCAL_POST_HARD_LIMIT || !Array.isArray(ledger.reservations) ||
      ledger.reservations.length !== ledger.reservedPosts ||
      !ledger.reservations.every((item, index) => validReservation(item, index))) {
    throw new Error("P7 call ledger is invalid");
  }
  return {
    ...(ledger as unknown as Omit<P7CallLedger, "authorizedLimit" | "correctionDevelopmentClaimedAt" | "workingTimeWorkflowClaimedAt" | "workingTimeWorkflowCorrectionClaim">),
    authorizedLimit: P7_AMENDMENT_AUTHORIZED_POST_LIMIT,
    correctionDevelopmentClaimedAt: keys === currentKeys || keys === workflowKeys || keys === workflowCorrectionKeys || keys === remainingPathsKeys ? ledger.correctionDevelopmentClaimedAt as string | null : null,
    workingTimeWorkflowClaimedAt: keys === workflowKeys || keys === workflowCorrectionKeys || keys === remainingPathsKeys ? ledger.workingTimeWorkflowClaimedAt as string | null : null,
    workingTimeWorkflowCorrectionClaim: keys === workflowCorrectionKeys || keys === remainingPathsKeys ? correctionClaim as P7CallLedger["workingTimeWorkflowCorrectionClaim"] : null,
    workingTimeRemainingPathsClaim: keys === remainingPathsKeys ? remainingClaim as P7CallLedger["workingTimeRemainingPathsClaim"] : null,
  };
}

function emptyLedger(): P7CallLedger {
  return {
    schemaVersion: 1,
    campaign: "P7_LOCAL_SKILLS",
    hardLimit: 40,
    authorizedLimit: 32,
    developmentClaimedAt: null,
    correctionDevelopmentClaimedAt: null,
    workingTimeWorkflowClaimedAt: null,
    workingTimeWorkflowCorrectionClaim: null,
    workingTimeRemainingPathsClaim: null,
    reservedPosts: 0,
    reservations: [],
  };
}

async function loadLedger(path: string): Promise<P7CallLedger> {
  try { return parseLedger(await readFile(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger();
    throw error;
  }
}

export class P7LocalCallBudget {
  readonly #lockPath: string;

  constructor(readonly path: string) {
    this.#lockPath = `${path}.lock`;
  }

  async readReservedPosts(): Promise<number> {
    return (await loadLedger(this.path)).reservedPosts;
  }

  async readSummary(): Promise<{ reservedPosts: number; developmentClaimed: boolean; correctionDevelopmentClaimed: boolean; workingTimeWorkflowClaimed: boolean; workingTimeWorkflowCorrectionClaimed: boolean; workingTimeRemainingPathsClaimed: boolean }> {
    const ledger = await loadLedger(this.path);
    return Object.freeze({ reservedPosts: ledger.reservedPosts, developmentClaimed: ledger.developmentClaimedAt !== null, correctionDevelopmentClaimed: ledger.correctionDevelopmentClaimedAt !== null, workingTimeWorkflowClaimed: ledger.workingTimeWorkflowClaimedAt !== null, workingTimeWorkflowCorrectionClaimed: ledger.workingTimeWorkflowCorrectionClaim !== null, workingTimeRemainingPathsClaimed: ledger.workingTimeRemainingPathsClaim !== null });
  }

  async #withLock<T>(action: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    try {
      await mkdir(this.#lockPath, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("P7 call ledger is locked; stop without a POST");
      throw error;
    }
    try {
      return await action();
    } finally {
      await rmdir(this.#lockPath).catch(() => undefined);
    }
  }

  async #persist(ledger: P7CallLedger, suffix: string): Promise<void> {
    const temporary = join(dirname(this.path), `.call-budget-${process.pid}-${suffix}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(ledger, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, this.path);
  }

  async claimDevelopmentOnce(): Promise<string> {
    return await this.#withLock(async () => {
      const current = await loadLedger(this.path);
      if (current.developmentClaimedAt !== null) {
        throw new Error("P7 development phase was already claimed; stop without a POST");
      }
      const claimedAt = new Date().toISOString();
      await this.#persist({ ...current, developmentClaimedAt: claimedAt }, "development-claim");
      return claimedAt;
    });
  }

  async claimCorrectionDevelopmentOnce(): Promise<string> {
    return await this.#withLock(async () => {
      const current = await loadLedger(this.path);
      if (current.correctionDevelopmentClaimedAt !== null) {
        throw new Error("P7 correction development phase was already claimed; stop without a POST");
      }
      if (current.developmentClaimedAt === null || current.reservedPosts !== 10) {
        throw new Error("P7 correction requires the preserved ten-call development history");
      }
      const claimedAt = new Date().toISOString();
      await this.#persist({ ...current, correctionDevelopmentClaimedAt: claimedAt }, "correction-development-claim");
      return claimedAt;
    });
  }

  async claimWorkingTimeWorkflowOnce(): Promise<string> {
    return await this.#withLock(async () => {
      const current = await loadLedger(this.path);
      if (current.workingTimeWorkflowClaimedAt !== null) throw new Error("P8 working-time workflow phase was already claimed; stop without a POST");
      if (current.developmentClaimedAt === null || current.correctionDevelopmentClaimedAt === null || current.reservedPosts !== 11 ||
          current.reservations[10]?.phase !== "correction-development") {
        throw new Error("P8 workflow requires the preserved eleven-call history including the technical V2 stop");
      }
      const claimedAt = new Date().toISOString();
      await this.#persist({ ...current, workingTimeWorkflowClaimedAt: claimedAt }, "working-time-workflow-claim");
      return claimedAt;
    });
  }

  async claimWorkingTimeWorkflowCorrectionOnce(input: { historicalReportSha256: string; correctedCoreSha256: string; runtimeMetadataSha256: string }): Promise<string> {
    return await this.#withLock(async () => {
      const current = await loadLedger(this.path);
      if (current.workingTimeWorkflowCorrectionClaim !== null) throw new Error("P8 working-time correction was already claimed; stop without a POST");
      if (input.historicalReportSha256 !== "fcdb0e869bf7689ce823bebdf9af9436a0052318be04269383538c2a074ce255" ||
          !/^[a-f0-9]{64}$/.test(input.correctedCoreSha256) || !/^[a-f0-9]{64}$/.test(input.runtimeMetadataSha256) ||
          current.reservedPosts !== 12 || current.workingTimeWorkflowClaimedAt === null ||
          current.reservations.filter(({ phase }) => phase === "working-time-workflow").length !== 1 ||
          current.reservations[11]?.phase !== "working-time-workflow" || current.reservations[11]?.caseId !== "WF01_COMPLETE_LOCAL" || current.reservations[11]?.stage !== "understand") {
        throw new Error("P8 correction requires the preserved failed first-run history");
      }
      const claim = Object.freeze({ claimedAt: new Date().toISOString(), ...input });
      await this.#persist({ ...current, workingTimeWorkflowCorrectionClaim: claim }, "working-time-correction-claim");
      return claim.claimedAt;
    });
  }

  async claimWorkingTimeRemainingPathsOnce(input: { protocolSha256: string; evidenceReportSha256: string; fixtureSha256: string; ledgerBeforeSha256: string; sourceCoreSha256: string; helperSha256: string; runtimeMetadataSha256: string }): Promise<string> {
    return await this.#withLock(async () => {
      const ledgerBytes = await readFile(this.path);
      const current = parseLedger(ledgerBytes.toString("utf8"));
      if (current.workingTimeRemainingPathsClaim !== null) throw new Error("P8 remaining paths were already claimed; stop without a POST");
      const expected = {
        protocolSha256: "a7ea3adee40c2b38024f2819acd95012763b9a67c75326b10688d7f9f34734ff",
        evidenceReportSha256: "640d4c5b86915f44d10dbde39fcdba4a40e37c9c71566c788ac5f595f4a67bd2",
        fixtureSha256: "84d126eb3ae5ea0132c59ae64fd894280b0a081a52441ada89c5afc381ded264",
        ledgerBeforeSha256: "e6e42cc9a800833dd4f99471fe7843cd3f6d75cd0a03f196dcccc612cc827771",
      } as const;
      if (input.protocolSha256 !== expected.protocolSha256 || input.evidenceReportSha256 !== expected.evidenceReportSha256 || input.fixtureSha256 !== expected.fixtureSha256 ||
          input.ledgerBeforeSha256 !== expected.ledgerBeforeSha256 || createHash("sha256").update(ledgerBytes).digest("hex") !== expected.ledgerBeforeSha256 ||
          !/^[a-f0-9]{64}$/.test(input.sourceCoreSha256) || !/^[a-f0-9]{64}$/.test(input.helperSha256) || !/^[a-f0-9]{64}$/.test(input.runtimeMetadataSha256) ||
          current.reservedPosts !== 15 || current.workingTimeWorkflowClaimedAt === null || current.workingTimeWorkflowCorrectionClaim === null ||
          current.reservations.filter(({ phase }) => phase === "working-time-workflow").length !== 4 ||
          current.reservations[11]?.caseId !== "WF01_COMPLETE_LOCAL" || current.reservations[11]?.stage !== "understand" ||
          current.reservations[12]?.caseId !== "WF01_COMPLETE_LOCAL" || current.reservations[12]?.stage !== "understand" ||
          current.reservations[13]?.caseId !== "WF01_COMPLETE_LOCAL" || current.reservations[13]?.stage !== "draft" ||
          current.reservations[14]?.caseId !== "WF02_MISSING_THEN_CONFIRMED" || current.reservations[14]?.stage !== "understand") {
        throw new Error("P8 remaining paths require the exact preserved fifteen-call history");
      }
      const claim = Object.freeze({ claimedAt: new Date().toISOString(), ...input });
      await this.#persist({ ...current, workingTimeRemainingPathsClaim: claim }, "working-time-remaining-paths-claim");
      return claim.claimedAt;
    });
  }

  async reserve(input: Omit<P7CallReservation, "ordinal" | "reservedAt">): Promise<P7CallReservation> {
    return await this.#withLock(async () => {
      const current = await loadLedger(this.path);
      if (input.phase === "development" && current.developmentClaimedAt === null) {
        throw new Error("P7 development phase is not claimed; stop without a POST");
      }
      if (input.phase === "correction-development" && current.correctionDevelopmentClaimedAt === null) {
        throw new Error("P7 correction development phase is not claimed; stop without a POST");
      }
      if (input.phase === "working-time-workflow") {
        if (current.workingTimeWorkflowClaimedAt === null) throw new Error("P8 working-time workflow phase is not claimed; stop without a POST");
        if ((input.caseId === "WF02_EXPLICIT_CONFIRMED_ACTION" || input.caseId === "WF03_COMPLETE_MOCK_RESEARCH") && current.workingTimeRemainingPathsClaim === null) throw new Error("P8 remaining paths are not claimed; stop without a POST");
        if (current.reservations.filter(({ phase }) => phase === "working-time-workflow").length >= 8) throw new Error("P8 working-time workflow POST limit reached");
      }
      if (current.reservedPosts >= P7_LOCAL_POST_HARD_LIMIT) throw new Error("P7 local POST hard limit reached");
      if (current.reservedPosts >= P7_AMENDMENT_AUTHORIZED_POST_LIMIT) throw new Error("P7 authorized POST limit reached");
      const reservation: P7CallReservation = Object.freeze({
        ...input,
        ordinal: current.reservedPosts + 1,
        reservedAt: new Date().toISOString(),
      });
      const next: P7CallLedger = {
        ...current,
        reservedPosts: reservation.ordinal,
        reservations: [...current.reservations, reservation],
      };
      await this.#persist(next, `${reservation.ordinal}`);
      return reservation;
    });
  }
}
