import { Buffer } from "node:buffer";
import {
  createLocalWorkingTimeTemplate,
  createWorkingTimeMockPayload,
  validateWorkingTimeMockAnswer,
  validateWorkingTimeTemplateMockAnswer,
  type WorkingTimeResearchMock,
  type WorkingTimeTemplate,
} from "./workingTimeResearchCatalog.js";

const SOURCE_FIELDS = ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"] as const;
type SourceField = typeof SOURCE_FIELDS[number];
const REQUIRED_AMENDMENT_FIELDS: readonly SourceField[] = SOURCE_FIELDS;

export interface WorkingTimeSourceValues {
  readonly display_name: string;
  readonly current_weekly_hours: number;
  readonly contract_paragraphs: readonly { readonly id: string; readonly text: string }[];
  readonly unchanged_terms: string;
}

export interface WorkingTimeSource {
  readonly id: string;
  readonly organizationId: string;
  readonly personId: string;
  readFields(fields: readonly SourceField[]): Partial<WorkingTimeSourceValues>;
}

export interface WorkingTimeWorkflowModel {
  readonly name: string;
  readonly planCallCount: number;
  readonly draftCallCount: number;
  plan(input: {
    readonly requestText: string;
    readonly authorizedPeople: readonly { readonly personId: string; readonly displayLabel: string }[];
  }, options?: { signal?: AbortSignal }): Promise<unknown>;
  draft(input: {
    readonly requestText: string;
    readonly targetWeeklyHours: number;
    readonly effectiveDate: string;
    readonly source: Partial<WorkingTimeSourceValues>;
    readonly generalRequirements: string | null;
    readonly generalTemplate: WorkingTimeTemplate;
    readonly constraints: readonly string[];
  }, options?: { signal?: AbortSignal }): Promise<unknown>;
}

type ConfirmedIntent = {
  readonly personId: string | null;
  readonly targetWeeklyHours: number | null;
  readonly effectiveDate: string | null;
  readonly researchRequested: boolean | null;
  readonly templateRequested: boolean | null;
};

type Request = {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly sourceId: string;
  readonly purpose: "SYNTHETIC_WORKING_TIME_CONTRACT_DRAFT";
  readonly text: string;
  readonly confirmedIntent: ConfirmedIntent;
};

type Token = { readonly epoch: number; readonly generation: number; readonly organizationId: string; readonly actorId: string; readonly sessionId: string; readonly taskId: string; readonly sourceId: string };

function plainExact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.keys(descriptors).length === keys.length && keys.every((key) => key in descriptors) &&
    Object.values(descriptors).every((descriptor) => "value" in descriptor && descriptor.enumerable === true);
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function validHours(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 168;
}

function validateRequest(value: unknown): Request {
  const keys = ["schemaVersion", "organizationId", "actorId", "sessionId", "taskId", "sourceId", "purpose", "text", "confirmedIntent"];
  const confirmedKeys = ["personId", "targetWeeklyHours", "effectiveDate", "researchRequested", "templateRequested"];
  if (!plainExact(value, keys) || value.schemaVersion !== 1 || value.purpose !== "SYNTHETIC_WORKING_TIME_CONTRACT_DRAFT" ||
      !plainExact(value.confirmedIntent, confirmedKeys)) throw new Error("invalid workflow request");
  for (const key of ["organizationId", "actorId", "sessionId", "taskId", "sourceId", "text"] as const) {
    if (typeof value[key] !== "string" || value[key].length < 1 || Buffer.byteLength(value[key] as string, "utf8") > 8192) throw new Error("invalid workflow request");
  }
  const confirmed = value.confirmedIntent as Record<string, unknown>;
  if (confirmed.personId !== null && (typeof confirmed.personId !== "string" || confirmed.personId.length < 1 || confirmed.personId.length > 128)) throw new Error("invalid workflow request");
  if (confirmed.targetWeeklyHours !== null && !validHours(confirmed.targetWeeklyHours)) throw new Error("invalid workflow request");
  if (confirmed.effectiveDate !== null && !validCalendarDate(confirmed.effectiveDate)) throw new Error("invalid workflow request");
  if (confirmed.researchRequested !== null && typeof confirmed.researchRequested !== "boolean") throw new Error("invalid workflow request");
  if (confirmed.templateRequested !== null && typeof confirmed.templateRequested !== "boolean") throw new Error("invalid workflow request");
  return Object.freeze({
    schemaVersion: 1,
    organizationId: value.organizationId as string,
    actorId: value.actorId as string,
    sessionId: value.sessionId as string,
    taskId: value.taskId as string,
    sourceId: value.sourceId as string,
    purpose: "SYNTHETIC_WORKING_TIME_CONTRACT_DRAFT",
    text: value.text as string,
    confirmedIntent: Object.freeze({
      personId: confirmed.personId as string | null,
      targetWeeklyHours: confirmed.targetWeeklyHours as number | null,
      effectiveDate: confirmed.effectiveDate as string | null,
      researchRequested: confirmed.researchRequested as boolean | null,
      templateRequested: confirmed.templateRequested as boolean | null,
    }),
  });
}

export class WorkingTimeWorkflowAuthority {
  readonly #active: {
    readonly organizationId: string; readonly actorId: string; readonly sessionId: string;
    readonly taskIds: readonly string[]; readonly sourceIds: readonly string[];
    readonly people: readonly { readonly personId: string; readonly displayLabel: string }[];
    readonly fieldIds: readonly SourceField[]; readonly allowGeneralResearch: boolean; readonly allowGeneralTemplate: boolean; readonly researchCatalogVersion: 1;
  };
  readonly #sources: readonly WorkingTimeSource[];
  #epoch = 1;
  #generation = 0;
  #revoked = false;
  constructor(active: { organizationId: string; actorId: string; sessionId: string; taskIds: readonly string[]; sourceIds: readonly string[]; people: readonly { personId: string; displayLabel: string }[]; fieldIds: readonly SourceField[]; allowGeneralResearch: boolean; allowGeneralTemplate: boolean; researchCatalogVersion: 1 }, sources: readonly WorkingTimeSource[]) {
    this.#active = Object.freeze({ ...active, taskIds: Object.freeze([...active.taskIds]), sourceIds: Object.freeze([...active.sourceIds]), people: Object.freeze(active.people.map((person) => Object.freeze({ ...person }))), fieldIds: Object.freeze([...active.fieldIds]) });
    this.#sources = Object.freeze(sources.map((source) => Object.freeze({ id: source.id, organizationId: source.organizationId, personId: source.personId, readFields: source.readFields.bind(source) })));
  }
  revoke(): void { this.#revoked = true; this.#epoch += 1; this.#generation += 1; }
  begin(value: unknown): { request: Request; token: Token; authorizedPeople: readonly { personId: string; displayLabel: string }[] } | null {
    if (this.#revoked) return null;
    const request = validateRequest(value);
    if (request.organizationId !== this.#active.organizationId || request.actorId !== this.#active.actorId || request.sessionId !== this.#active.sessionId ||
        !this.#active.taskIds.includes(request.taskId) || !this.#active.sourceIds.includes(request.sourceId)) return null;
    const source = this.#sources.find((item) => item.id === request.sourceId && item.organizationId === request.organizationId);
    if (!source) return null;
    this.#generation += 1;
    return { request, token: Object.freeze({ epoch: this.#epoch, generation: this.#generation, organizationId: request.organizationId, actorId: request.actorId, sessionId: request.sessionId, taskId: request.taskId, sourceId: request.sourceId }), authorizedPeople: this.#active.people };
  }
  isCurrent(token: Token): boolean { return !this.#revoked && token.epoch === this.#epoch && token.generation === this.#generation && token.organizationId === this.#active.organizationId && token.actorId === this.#active.actorId && token.sessionId === this.#active.sessionId && this.#active.taskIds.includes(token.taskId) && this.#active.sourceIds.includes(token.sourceId); }
  canResearch(token: Token): boolean { return this.isCurrent(token) && this.#active.allowGeneralResearch && this.#active.researchCatalogVersion === 1; }
  canUseTemplate(token: Token): boolean { return this.isCurrent(token) && this.#active.allowGeneralTemplate && this.#active.researchCatalogVersion === 1; }
  read(token: Token, personId: string, fields: readonly SourceField[]): Partial<WorkingTimeSourceValues> | null {
    if (!this.isCurrent(token) || !this.#active.people.some((person) => person.personId === personId) || fields.length < 1 || fields.length > 4 ||
        fields.some((field) => typeof field !== "string" || !SOURCE_FIELDS.includes(field) || !this.#active.fieldIds.includes(field))) return null;
    const normalizedFields = Object.freeze(fields.filter((field, index) => fields.indexOf(field) === index));
    const source = this.#sources.find((item) => item.id === token.sourceId && item.organizationId === token.organizationId && item.personId === personId);
    if (!source) return null;
    let raw: Partial<WorkingTimeSourceValues>;
    try { raw = source.readFields(normalizedFields); } catch { return null; }
    if (!this.isCurrent(token) || !plainExact(raw, normalizedFields)) return null;
    const filtered: Partial<WorkingTimeSourceValues> = {};
    for (const field of normalizedFields) {
      const sourceValue = raw[field];
      if (field === "contract_paragraphs") {
        if (!Array.isArray(sourceValue) || sourceValue.length > 64 || !sourceValue.every((item) => plainExact(item, ["id", "text"]) && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 128 && typeof item.text === "string" && item.text.length > 0 && Buffer.byteLength(item.text, "utf8") <= 8192)) return null;
        Object.assign(filtered, { contract_paragraphs: Object.freeze(sourceValue.map((item) => Object.freeze({ id: item.id, text: item.text }))) });
      } else if (field === "current_weekly_hours") {
        if (!validHours(sourceValue)) return null;
        Object.assign(filtered, { current_weekly_hours: sourceValue });
      } else {
        if (typeof sourceValue !== "string" || sourceValue.length < 1 || Buffer.byteLength(sourceValue, "utf8") > 8192) return null;
        Object.assign(filtered, { [field]: sourceValue });
      }
    }
    return Object.freeze(filtered);
  }
}

export type WorkingTimeWorkflowResult =
  | { readonly ok: true; readonly kind: "clarification"; readonly questions: readonly string[]; readonly proposedIntent: ConfirmedIntent }
  | { readonly ok: true; readonly kind: "draft"; readonly draft: string; readonly citations: readonly string[]; readonly gaps: readonly string[]; readonly reviewNotes: readonly string[]; readonly researchUsed: boolean; readonly templateUsed: boolean; readonly templateProvenance: "LOCAL_FIXED" | "MOCK_OFFLINE" }
  | { readonly ok: false; readonly reasonCode: "INVALID" | "DENIED" | "MODEL_SCHEMA" | "STALE" | "RESEARCH" | "TEMPLATE" | "DRAFT_INVALID" };

const PLAN_KEYS = ["schemaVersion", "task", "personId", "targetWeeklyHours", "effectiveDate", "researchRequested", "templateRequested", "requiredSourceFields"] as const;
type ParsedPlan = { personId: string | null; targetWeeklyHours: number | null; effectiveDate: string | null; researchRequested: boolean | null; templateRequested: boolean | null; fields: SourceField[] };

function plan(value: unknown, allowedPeople: readonly { personId: string }[]): ParsedPlan {
  if (!plainExact(value, PLAN_KEYS) || value.schemaVersion !== 1 || value.task !== "employment_contract_change" ||
      (value.personId !== null && (typeof value.personId !== "string" || !allowedPeople.some((person) => person.personId === value.personId))) ||
      (value.targetWeeklyHours !== null && !validHours(value.targetWeeklyHours)) || (value.effectiveDate !== null && !validCalendarDate(value.effectiveDate)) ||
      (value.researchRequested !== null && typeof value.researchRequested !== "boolean") ||
      (value.templateRequested !== null && typeof value.templateRequested !== "boolean") || !Array.isArray(value.requiredSourceFields) ||
      value.requiredSourceFields.length < 1 || value.requiredSourceFields.length > 4 || !value.requiredSourceFields.every((field) => SOURCE_FIELDS.includes(field as SourceField))) {
    throw new Error("invalid plan");
  }
  return { personId: value.personId as string | null, targetWeeklyHours: value.targetWeeklyHours as number | null, effectiveDate: value.effectiveDate as string | null, researchRequested: value.researchRequested as boolean | null, templateRequested: value.templateRequested as boolean | null, fields: [...value.requiredSourceFields] as SourceField[] };
}

function requestExplicitlyNamesPerson(requestText: string, personId: string | null, allowedPeople: readonly { personId: string; displayLabel: string }[]): boolean {
  if (personId === null) return false;
  const person = allowedPeople.find((item) => item.personId === personId);
  return person !== undefined && person.displayLabel.length > 0 && requestText.includes(person.displayLabel);
}

function safeStringArray(value: unknown, maxItems = 32): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === "string" && item.length > 0 && Buffer.byteLength(item, "utf8") <= 2048 && !/https?:\/\/|<tool|\bsave\b|\bsend\b/i.test(item));
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function paragraphSupportsHours(text: string, hours: number): boolean {
  const forms = new Set([String(hours), String(hours).replace(".", ",")]);
  return [...forms].some((form) => new RegExp(`(^|[^0-9.,+\\-])${escapeRegex(form)}(?=\\s*(Wochen)?stunden\\b)`, "i").test(text));
}

type MergeProposal = {
  displayName: string; currentWeeklyHours: number | null; targetWeeklyHours: number; effectiveDate: string;
  unchangedTermsConfirmed: boolean; citations: string[]; conflicts: string[]; openPoints: string[]; reviewNotes: string[];
};

function validateMergeProposal(value: unknown, source: Partial<WorkingTimeSourceValues>, targetHours: number, effectiveDate: string): MergeProposal {
  const keys = ["schemaVersion", "documentKind", "displayName", "currentWeeklyHours", "targetWeeklyHours", "effectiveDate", "unchangedTermsConfirmed", "citations", "conflicts", "openPoints", "reviewNotes"];
  if (!plainExact(value, keys) || value.schemaVersion !== 1 || value.documentKind !== "working_time_amendment" ||
      typeof source.display_name !== "string" || value.displayName !== source.display_name ||
      value.currentWeeklyHours !== (source.current_weekly_hours ?? null) || value.targetWeeklyHours !== targetHours || value.effectiveDate !== effectiveDate ||
      typeof value.unchangedTermsConfirmed !== "boolean" || value.unchangedTermsConfirmed !== (typeof source.unchanged_terms === "string") ||
      !safeStringArray(value.citations, 64) || !safeStringArray(value.conflicts) || !safeStringArray(value.openPoints) || !safeStringArray(value.reviewNotes) || value.reviewNotes.length < 1) {
    throw new Error("invalid merge proposal");
  }
  const allowedCitations = new Set(source.contract_paragraphs?.map(({ id }) => id) ?? []);
  if ((value.citations as string[]).some((id) => !allowedCitations.has(id))) throw new Error("invalid merge proposal citations");
  const currentHoursEvidenceIds = source.current_weekly_hours === undefined
    ? []
    : (source.contract_paragraphs ?? []).filter(({ text }) => paragraphSupportsHours(text, source.current_weekly_hours!)).map(({ id }) => id);
  if (source.current_weekly_hours !== undefined && (currentHoursEvidenceIds.length === 0 || currentHoursEvidenceIds.some((id) => !(value.citations as string[]).includes(id)))) {
    throw new Error("current hours are not supported by cited structured source evidence");
  }
  const unchangedEvidenceIds = source.unchanged_terms === undefined
    ? []
    : (source.contract_paragraphs ?? []).filter(({ text }) => text === source.unchanged_terms).map(({ id }) => id);
  if (value.unchangedTermsConfirmed && (unchangedEvidenceIds.length === 0 || unchangedEvidenceIds.some((id) => !(value.citations as string[]).includes(id)))) {
    throw new Error("unchanged terms are not supported by cited structured source evidence");
  }
  return {
    displayName: value.displayName as string,
    currentWeeklyHours: value.currentWeeklyHours as number | null,
    targetWeeklyHours: value.targetWeeklyHours as number,
    effectiveDate: value.effectiveDate as string,
    unchangedTermsConfirmed: value.unchangedTermsConfirmed,
    citations: [...value.citations] as string[], conflicts: [...value.conflicts] as string[], openPoints: [...value.openPoints] as string[], reviewNotes: [...value.reviewNotes] as string[],
  };
}

function formatHours(value: number): string { return Number.isInteger(value) ? String(value) : String(value).replace(".", ","); }
function formatDate(value: string): string { const [year, month, day] = value.split("-"); return `${day}.${month}.${year}`; }

function renderAgreement(template: WorkingTimeTemplate, proposal: MergeProposal): string {
  const current = proposal.currentWeeklyHours === null ? "[BISHERIGE WOCHENSTUNDEN PRÜFEN]" : formatHours(proposal.currentWeeklyHours);
  const replacements = new Map([
    ["{{EMPLOYER_NAME}}", "[ARBEITGEBER ERGÄNZEN]"],
    ["{{EMPLOYEE_NAME}}", proposal.displayName],
    ["{{CURRENT_WEEKLY_HOURS}}", current],
    ["{{NEW_WEEKLY_HOURS}}", formatHours(proposal.targetWeeklyHours)],
    ["{{EFFECTIVE_DATE}}", formatDate(proposal.effectiveDate)],
  ]);
  const fill = (text: string) => [...replacements].reduce((result, [placeholder, replacement]) => result.replaceAll(placeholder, replacement), text);
  const unchanged = proposal.unchangedTermsConfirmed ? template.sections.unchangedTerms : "Unveränderte Vertragsbestimmungen: [ZU PRÜFEN]";
  const sources = proposal.citations.length === 0 ? "Vertragsquellen: [ZU PRÜFEN]" : `Vertragsquellen: ${proposal.citations.join(", ")}`;
  return ["Unverbindlicher, ungeprüfter synthetischer Entwurf", template.sections.heading, fill(template.sections.parties), fill(template.sections.change), unchanged, sources, template.sections.signatures].join("\n\n");
}

function unique(values: readonly string[]): string[] { return [...new Set(values)]; }

export class WorkingTimeContractWorkflow {
  constructor(private readonly authority: WorkingTimeWorkflowAuthority, private readonly model: WorkingTimeWorkflowModel, private readonly researchMock: WorkingTimeResearchMock) {}
  async run(value: unknown, options: { signal?: AbortSignal } = {}): Promise<WorkingTimeWorkflowResult> {
    if (options.signal?.aborted) return { ok: false, reasonCode: "STALE" };
    let begun;
    try { begun = this.authority.begin(value); } catch { return { ok: false, reasonCode: "INVALID" }; }
    if (!begun) return { ok: false, reasonCode: "DENIED" };
    if (options.signal?.aborted || !this.authority.isCurrent(begun.token)) return { ok: false, reasonCode: "STALE" };
    let parsedPlan;
    try { parsedPlan = plan(await this.model.plan({ requestText: begun.request.text, authorizedPeople: begun.authorizedPeople }, options.signal ? { signal: options.signal } : undefined), begun.authorizedPeople); }
    catch { return { ok: false, reasonCode: "MODEL_SCHEMA" }; }
    if (options.signal?.aborted || !this.authority.isCurrent(begun.token)) return { ok: false, reasonCode: "STALE" };
    const confirmed = begun.request.confirmedIntent;
    const conflictFields = (["personId", "targetWeeklyHours", "effectiveDate", "researchRequested", "templateRequested"] as const)
      .filter((field) => confirmed[field] !== null && parsedPlan[field] !== null && confirmed[field] !== parsedPlan[field]);
    const questions: string[] = [];
    const evidencedPersonId = requestExplicitlyNamesPerson(begun.request.text, parsedPlan.personId, begun.authorizedPeople) ? parsedPlan.personId : null;
    if (conflictFields.length > 0) questions.push("Die bestätigten Angaben widersprechen dem freien Auftrag. Bitte Person, Wochenstunden, Datum, Recherche- und Vorlagenwunsch erneut prüfen.");
    if (confirmed.personId === null) questions.push(evidencedPersonId === null ? "Für welche synthetische Person soll der Vertragsentwurf erstellt werden?" : `Soll der Entwurf für ${evidencedPersonId} erstellt werden?`);
    if (confirmed.targetWeeklyHours === null) questions.push(parsedPlan.targetWeeklyHours === null ? "Welche neue Wochenarbeitszeit soll gelten?" : `Sollen ${parsedPlan.targetWeeklyHours} Wochenstunden gelten?`);
    if (confirmed.effectiveDate === null) questions.push(parsedPlan.effectiveDate === null ? "Ab welchem Datum soll die neue Wochenarbeitszeit gelten?" : `Soll die Änderung ab ${parsedPlan.effectiveDate} gelten?`);
    if (confirmed.researchRequested === null) questions.push(parsedPlan.researchRequested === true ? "Soll die allgemeine synthetische Recherche einbezogen werden?" : parsedPlan.researchRequested === false ? "Soll der Entwurf ohne allgemeine Recherche erstellt werden?" : "Soll eine allgemeine synthetische Recherche einbezogen werden?");
    if (confirmed.templateRequested === null) questions.push(parsedPlan.templateRequested === true ? "Soll die synthetische MOCK-Vorlage verwendet werden?" : parsedPlan.templateRequested === false ? "Soll die lokale feste Vorlage ohne MOCK verwendet werden?" : "Soll die synthetische MOCK-Vorlage oder die lokale feste Vorlage verwendet werden?");
    if (questions.length > 0) return { ok: true, kind: "clarification", questions: Object.freeze(questions), proposedIntent: Object.freeze({
      personId: confirmed.personId === null ? evidencedPersonId : confirmed.personId,
      targetWeeklyHours: confirmed.targetWeeklyHours ?? parsedPlan.targetWeeklyHours,
      effectiveDate: confirmed.effectiveDate ?? parsedPlan.effectiveDate,
      researchRequested: confirmed.researchRequested ?? parsedPlan.researchRequested,
      templateRequested: confirmed.templateRequested ?? parsedPlan.templateRequested,
    }) };
    if (confirmed.researchRequested && !this.authority.canResearch(begun.token)) return { ok: false, reasonCode: "DENIED" };
    if (confirmed.templateRequested && !this.authority.canUseTemplate(begun.token)) return { ok: false, reasonCode: "DENIED" };
    const source = this.authority.read(begun.token, confirmed.personId!, REQUIRED_AMENDMENT_FIELDS);
    if (!source) return { ok: false, reasonCode: "DENIED" };
    if (options.signal?.aborted || !this.authority.isCurrent(begun.token)) return { ok: false, reasonCode: "STALE" };

    const forbidden = [begun.request.text, begun.request.organizationId, begun.request.actorId, begun.request.sessionId, begun.request.taskId, begun.request.sourceId, confirmed.personId!, String(confirmed.targetWeeklyHours), confirmed.effectiveDate!, source.display_name ?? "", source.unchanged_terms ?? "", ...(source.contract_paragraphs?.flatMap(({ id, text }) => [id, text]) ?? [])];
    let requirements: string | null = null;
    if (confirmed.researchRequested) {
      try {
        const payload = createWorkingTimeMockPayload({ type: "employment_contract_change", jurisdiction: "DE", topic: "weekly_working_hours", goal: "general_requirements" }, 1, forbidden);
        const raw = await this.researchMock.generate(payload, options.signal ? { signal: options.signal } : undefined);
        if (options.signal?.aborted || !this.authority.canResearch(begun.token)) return { ok: false, reasonCode: "STALE" };
        requirements = validateWorkingTimeMockAnswer(raw);
      } catch { return { ok: false, reasonCode: "RESEARCH" }; }
    }

    let template = createLocalWorkingTimeTemplate();
    if (confirmed.templateRequested) {
      try {
        const payload = createWorkingTimeMockPayload({ type: "employment_contract_change", jurisdiction: "DE", topic: "weekly_working_hours", goal: "generic_amendment_template" }, 1, forbidden);
        const raw = await this.researchMock.generate(payload, options.signal ? { signal: options.signal } : undefined);
        if (options.signal?.aborted || !this.authority.canUseTemplate(begun.token)) return { ok: false, reasonCode: "STALE" };
        template = validateWorkingTimeTemplateMockAnswer(raw);
      } catch { return { ok: false, reasonCode: "TEMPLATE" }; }
    }
    if (options.signal?.aborted || !this.authority.isCurrent(begun.token)) return { ok: false, reasonCode: "STALE" };

    let rawMerge: unknown;
    try {
      rawMerge = await this.model.draft({
        requestText: begun.request.text,
        targetWeeklyHours: confirmed.targetWeeklyHours!,
        effectiveDate: confirmed.effectiveDate!,
        source,
        generalRequirements: requirements,
        generalTemplate: template,
        constraints: ["UNVERBINDLICHER_ENTWURF", "GESCHLOSSENER_FAKTENABGLEICH", "OFFENE_PUNKTE_GETRENNT", "KEINE_ERFUNDENEN_WERTE", "KEINE_AKTIONEN"],
      }, options.signal ? { signal: options.signal } : undefined);
    } catch { return { ok: false, reasonCode: "DRAFT_INVALID" }; }
    if (options.signal?.aborted || !this.authority.isCurrent(begun.token)) return { ok: false, reasonCode: "STALE" };
    let proposal: MergeProposal;
    try { proposal = validateMergeProposal(rawMerge, source, confirmed.targetWeeklyHours!, confirmed.effectiveDate!); }
    catch { return { ok: false, reasonCode: "DRAFT_INVALID" }; }

    if (proposal.conflicts.length > 0) {
      return {
        ok: true,
        kind: "clarification",
        questions: Object.freeze(["Im Bestandsvertrag wurde ein Widerspruch erkannt. Bitte die betroffenen Vertragsangaben fachlich klären, bevor eine Änderungsvereinbarung erstellt wird."]),
        proposedIntent: confirmed,
      };
    }

    const fixedOpenPoints = ["Arbeitgeberbezeichnung ergänzen.", "Vergütung und mögliche Folgewirkungen sind nicht belegt und müssen getrennt geprüft werden."];
    if (proposal.currentWeeklyHours === null) fixedOpenPoints.push("Bisherige Wochenarbeitszeit anhand des Vertrags prüfen.");
    if (!proposal.unchangedTermsConfirmed) fixedOpenPoints.push("Fortgeltung der übrigen Vertragsbestimmungen prüfen.");
    return {
      ok: true,
      kind: "draft",
      draft: renderAgreement(template, proposal),
      citations: proposal.citations,
      gaps: unique([...proposal.openPoints, ...fixedOpenPoints]),
      reviewNotes: proposal.reviewNotes,
      researchUsed: requirements !== null,
      templateUsed: confirmed.templateRequested!,
      templateProvenance: template.provenance.provider,
    };
  }
}
