import { open, mkdir, readFile, rename, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export const P7_LOCAL_POST_HARD_LIMIT = 40;

export interface P7CallReservation {
  readonly ordinal: number;
  readonly phase: "development" | "holdout" | "ui-smoke";
  readonly promptConfigId: "P7_SKILLS_A" | "P7_SKILLS_B";
  readonly caseId: string;
  readonly stage: "proposal" | "generation";
  readonly reservedAt: string;
}

interface P7CallLedger {
  readonly schemaVersion: 1;
  readonly campaign: "P7_LOCAL_SKILLS";
  readonly hardLimit: 40;
  readonly developmentClaimedAt: string | null;
  readonly reservedPosts: number;
  readonly reservations: readonly P7CallReservation[];
}

function validReservation(value: unknown, index: number): value is P7CallReservation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).sort().join("|") === "caseId|ordinal|phase|promptConfigId|reservedAt|stage" &&
    item.ordinal === index + 1 && ["development", "holdout", "ui-smoke"].includes(item.phase as string) &&
    (item.promptConfigId === "P7_SKILLS_A" || item.promptConfigId === "P7_SKILLS_B") &&
    typeof item.caseId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(item.caseId) &&
    (item.stage === "proposal" || item.stage === "generation") &&
    typeof item.reservedAt === "string" && !Number.isNaN(Date.parse(item.reservedAt));
}

function parseLedger(text: string): P7CallLedger {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("P7 call ledger is invalid"); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("P7 call ledger is invalid");
  const ledger = value as Record<string, unknown>;
  if (Object.keys(ledger).sort().join("|") !== "campaign|developmentClaimedAt|hardLimit|reservations|reservedPosts|schemaVersion" ||
      ledger.schemaVersion !== 1 || ledger.campaign !== "P7_LOCAL_SKILLS" || ledger.hardLimit !== P7_LOCAL_POST_HARD_LIMIT ||
      !(ledger.developmentClaimedAt === null ||
        (typeof ledger.developmentClaimedAt === "string" && !Number.isNaN(Date.parse(ledger.developmentClaimedAt)))) ||
      !Number.isInteger(ledger.reservedPosts) || (ledger.reservedPosts as number) < 0 ||
      (ledger.reservedPosts as number) > P7_LOCAL_POST_HARD_LIMIT || !Array.isArray(ledger.reservations) ||
      ledger.reservations.length !== ledger.reservedPosts ||
      !ledger.reservations.every((item, index) => validReservation(item, index))) {
    throw new Error("P7 call ledger is invalid");
  }
  return ledger as unknown as P7CallLedger;
}

function emptyLedger(): P7CallLedger {
  return {
    schemaVersion: 1,
    campaign: "P7_LOCAL_SKILLS",
    hardLimit: 40,
    developmentClaimedAt: null,
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

  async reserve(input: Omit<P7CallReservation, "ordinal" | "reservedAt">): Promise<P7CallReservation> {
    return await this.#withLock(async () => {
      const current = await loadLedger(this.path);
      if (input.phase === "development" && current.developmentClaimedAt === null) {
        throw new Error("P7 development phase is not claimed; stop without a POST");
      }
      if (current.reservedPosts >= P7_LOCAL_POST_HARD_LIMIT) throw new Error("P7 local POST hard limit reached");
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
