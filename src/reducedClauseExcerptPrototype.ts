import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { assertPrivacySafeResearchOutbound } from "./researchOutboundBoundary.js";

const SOURCE_FIELD = "reduced_clause_structure" as const;
const SOURCE_KEYS = ["schemaVersion", "clauseId", "clauseKind", "structureVersion", "fields"] as const;
const REQUEST_KEYS = ["schemaVersion", "organizationId", "actorId", "sessionId", "taskId", "sourceId", "purpose", "revision"] as const;
const CONFIRMATION_KEYS = [
  "schemaVersion", "payloadSha256", "revision", "organizationId", "actorId", "sessionId", "taskId", "sourceId",
  "authorizationVersion", "authorityEpoch", "requestGeneration",
] as const;
const EXPECTED_FIELDS = [
  "employee_name", "current_weekly_hours", "new_weekly_hours", "effective_date", "unchanged_terms",
] as const;
const MAX_OUTBOUND_BYTES = 1_024;

export const REDUCED_CLAUSE_FEATURE_DEFAULT_ENABLED = false;

const BODY = [
  "Klauselart: Änderung der Wochenarbeitszeit",
  "Person: {{EMPLOYEE_NAME}}",
  "Bisherige Wochenstunden: {{CURRENT_WEEKLY_HOURS}}",
  "Neue Wochenstunden: {{NEW_WEEKLY_HOURS}}",
  "Wirksam ab: {{EFFECTIVE_DATE}}",
  "Übrige Vertragsbestimmungen: {{UNCHANGED_TERMS_STATUS}}",
  "Hinweis: Allgemeine Strukturprüfung",
].join("\n");

const APPROVED_HEADINGS = [
  "Reduzierter synthetischer Klauselauszug",
  "Synthetische Arbeitszeitklausel",
] as const;

export const DEFAULT_REDUCED_CLAUSE_OUTBOUND_TEXT = `${APPROVED_HEADINGS[0]}\n${BODY}`;

export interface ReducedClauseStructure {
  readonly schemaVersion: 1;
  readonly clauseId: string;
  readonly clauseKind: "weekly_working_hours_change";
  readonly structureVersion: 1;
  readonly fields: readonly ["employee_name", "current_weekly_hours", "new_weekly_hours", "effective_date", "unchanged_terms"];
}

export interface ReducedClauseSource {
  readonly id: string;
  readonly organizationId: string;
  readField(field: typeof SOURCE_FIELD): unknown;
}

export interface ReducedClauseRequest {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly sourceId: string;
  readonly purpose: "SYNTHETIC_REDUCED_CLAUSE_PREVIEW";
  readonly revision: number;
}

interface ReducedClauseToken {
  readonly organizationId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly sourceId: string;
  readonly authorizationVersion: number;
  readonly authorityEpoch: number;
  readonly requestGeneration: number;
}

export interface ReducedClauseMockPayload {
  readonly schemaVersion: 1;
  readonly purpose: "GENERIC_CLAUSE_STRUCTURE_REVIEW";
  readonly language: "de";
  readonly text: string;
  readonly provenance: {
    readonly provider: "MOCK_OFFLINE";
    readonly sourceKind: "HOST_MINIMIZED_SYNTHETIC_CLAUSE";
  };
}

export interface ReducedClauseMockProvider {
  readonly name: "MOCK_OFFLINE";
  readonly callCount: number;
  generate(payload: ReducedClauseMockPayload, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export interface ReducedClausePreview {
  readonly ok: true;
  readonly kind: "preview";
  readonly revision: number;
  readonly outgoingText: string;
  readonly payload: ReducedClauseMockPayload;
  readonly payloadSha256: string;
  readonly token: ReducedClauseToken;
}

export interface ReducedClauseConfirmation {
  readonly schemaVersion: 1;
  readonly payloadSha256: string;
  readonly revision: number;
  readonly organizationId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly sourceId: string;
  readonly authorizationVersion: number;
  readonly authorityEpoch: number;
  readonly requestGeneration: number;
}

type BlockCode =
  | "FEATURE_DISABLED"
  | "REQUEST_INVALID"
  | "SOURCE_DENIED"
  | "SOURCE_UNSAFE"
  | "EDIT_UNSAFE"
  | "CONFIRMATION_INVALID"
  | "STALE"
  | "FINAL_SCAN"
  | "PROVIDER_ERROR"
  | "PROVIDER_RESPONSE_INVALID";

export type ReducedClauseResult =
  | ReducedClausePreview
  | { readonly ok: true; readonly kind: "local"; readonly outgoingText: string; readonly payloadSha256: string; readonly revision: number }
  | { readonly ok: true; readonly kind: "sent"; readonly outgoingText: string; readonly payloadSha256: string; readonly revision: number; readonly provider: "MOCK_OFFLINE"; readonly answer: "Synthetische Struktur akzeptiert." }
  | { readonly ok: false; readonly reasonCode: BlockCode };

function plainExact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.keys(descriptors).length === keys.length && keys.every((key) => key in descriptors) &&
    Object.values(descriptors).every((descriptor) => "value" in descriptor && descriptor.enumerable === true);
}

function boundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function validateRequest(value: unknown): ReducedClauseRequest {
  if (!plainExact(value, REQUEST_KEYS) || value.schemaVersion !== 1 ||
      value.purpose !== "SYNTHETIC_REDUCED_CLAUSE_PREVIEW" ||
      !Number.isInteger(value.revision) || (value.revision as number) < 1) {
    throw new Error("invalid reduced clause request");
  }
  for (const key of ["organizationId", "actorId", "sessionId", "taskId", "sourceId"] as const) {
    if (!boundedId(value[key])) throw new Error("invalid reduced clause request");
  }
  return Object.freeze({ ...value }) as unknown as ReducedClauseRequest;
}

function validateSource(value: unknown): ReducedClauseStructure {
  if (!plainExact(value, SOURCE_KEYS) || value.schemaVersion !== 1 || value.clauseKind !== "weekly_working_hours_change" ||
      value.structureVersion !== 1 || !boundedId(value.clauseId) || !Array.isArray(value.fields) ||
      value.fields.length !== EXPECTED_FIELDS.length || !EXPECTED_FIELDS.every((field, index) => (value.fields as unknown[])[index] === field)) {
    throw new Error("unsafe reduced clause structure");
  }
  return Object.freeze({ ...value, fields: Object.freeze([...value.fields]) }) as unknown as ReducedClauseStructure;
}

function approvedOutboundText(value: unknown): value is string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_OUTBOUND_BYTES) return false;
  return APPROVED_HEADINGS.some((heading) => value === `${heading}\n${BODY}`);
}

function payloadFor(text: string): ReducedClauseMockPayload {
  return Object.freeze({
    schemaVersion: 1,
    purpose: "GENERIC_CLAUSE_STRUCTURE_REVIEW",
    language: "de",
    text,
    provenance: Object.freeze({ provider: "MOCK_OFFLINE", sourceKind: "HOST_MINIMIZED_SYNTHETIC_CLAUSE" }),
  });
}

function payloadHash(payload: ReducedClauseMockPayload): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

function previewFor(token: ReducedClauseToken, revision: number, outgoingText: string): ReducedClausePreview {
  const payload = payloadFor(outgoingText);
  return Object.freeze({ ok: true, kind: "preview", revision, outgoingText, payload, payloadSha256: payloadHash(payload), token });
}

export function confirmationFor(preview: ReducedClausePreview): ReducedClauseConfirmation {
  return Object.freeze({
    schemaVersion: 1,
    payloadSha256: preview.payloadSha256,
    revision: preview.revision,
    organizationId: preview.token.organizationId,
    actorId: preview.token.actorId,
    sessionId: preview.token.sessionId,
    taskId: preview.token.taskId,
    sourceId: preview.token.sourceId,
    authorizationVersion: preview.token.authorizationVersion,
    authorityEpoch: preview.token.authorityEpoch,
    requestGeneration: preview.token.requestGeneration,
  });
}

export class ReducedClausePrototypeAuthority {
  readonly #configuration: {
    readonly enabled: boolean;
    readonly organizationId: string;
    readonly actorId: string;
    readonly sessionId: string;
    readonly taskIds: readonly string[];
    readonly sourceIds: readonly string[];
    readonly fieldIds: readonly string[];
    readonly authorizationVersion: number;
  };
  readonly #sources: readonly ReducedClauseSource[];
  #authorityEpoch = 1;
  #requestGeneration = 0;
  #revoked = false;

  constructor(configuration: {
    enabled?: boolean;
    organizationId: string;
    actorId: string;
    sessionId: string;
    taskIds: readonly string[];
    sourceIds: readonly string[];
    fieldIds: readonly string[];
    authorizationVersion: number;
  }, sources: readonly ReducedClauseSource[]) {
    this.#configuration = Object.freeze({
      ...configuration,
      enabled: configuration.enabled ?? REDUCED_CLAUSE_FEATURE_DEFAULT_ENABLED,
      taskIds: Object.freeze([...configuration.taskIds]),
      sourceIds: Object.freeze([...configuration.sourceIds]),
      fieldIds: Object.freeze([...configuration.fieldIds]),
    });
    this.#sources = Object.freeze(sources.map((source) => Object.freeze({
      id: source.id,
      organizationId: source.organizationId,
      readField: source.readField.bind(source),
    })));
  }

  get enabled(): boolean { return this.#configuration.enabled; }

  begin(value: unknown): { request: ReducedClauseRequest; token: ReducedClauseToken } | null {
    if (!this.enabled || this.#revoked) return null;
    const request = validateRequest(value);
    if (request.organizationId !== this.#configuration.organizationId || request.actorId !== this.#configuration.actorId ||
        request.sessionId !== this.#configuration.sessionId || !this.#configuration.taskIds.includes(request.taskId) ||
        !this.#configuration.sourceIds.includes(request.sourceId) || !this.#configuration.fieldIds.includes(SOURCE_FIELD) ||
        !this.#sources.some((source) => source.id === request.sourceId && source.organizationId === request.organizationId)) return null;
    this.#requestGeneration += 1;
    return { request, token: this.#tokenFor(request) };
  }

  #tokenFor(request: ReducedClauseRequest): ReducedClauseToken {
    return Object.freeze({
      organizationId: request.organizationId,
      actorId: request.actorId,
      sessionId: request.sessionId,
      taskId: request.taskId,
      sourceId: request.sourceId,
      authorizationVersion: this.#configuration.authorizationVersion,
      authorityEpoch: this.#authorityEpoch,
      requestGeneration: this.#requestGeneration,
    });
  }

  isCurrent(token: ReducedClauseToken): boolean {
    return this.enabled && !this.#revoked && token.organizationId === this.#configuration.organizationId &&
      token.actorId === this.#configuration.actorId && token.sessionId === this.#configuration.sessionId &&
      token.authorizationVersion === this.#configuration.authorizationVersion && token.authorityEpoch === this.#authorityEpoch &&
      token.requestGeneration === this.#requestGeneration && this.#configuration.taskIds.includes(token.taskId) &&
      this.#configuration.sourceIds.includes(token.sourceId) && this.#configuration.fieldIds.includes(SOURCE_FIELD);
  }

  read(token: ReducedClauseToken): ReducedClauseStructure | null {
    if (!this.isCurrent(token)) return null;
    const source = this.#sources.find((item) => item.id === token.sourceId && item.organizationId === token.organizationId);
    if (!source) return null;
    let raw: unknown;
    try { raw = source.readField(SOURCE_FIELD); } catch { return null; }
    if (!this.isCurrent(token)) return null;
    try { return validateSource(raw); } catch { return null; }
  }

  revise(token: ReducedClauseToken): ReducedClauseToken | null {
    if (!this.isCurrent(token)) return null;
    this.#requestGeneration += 1;
    return Object.freeze({ ...token, requestGeneration: this.#requestGeneration });
  }

  revoke(): void {
    this.#revoked = true;
    this.#authorityEpoch += 1;
    this.#requestGeneration += 1;
  }

  invalidateContext(): void {
    this.#authorityEpoch += 1;
    this.#requestGeneration += 1;
  }
}

function confirmationMatches(preview: ReducedClausePreview, value: unknown): value is ReducedClauseConfirmation {
  if (!plainExact(value, CONFIRMATION_KEYS) || value.schemaVersion !== 1) return false;
  const expected = confirmationFor(preview);
  return CONFIRMATION_KEYS.every((key) => value[key] === expected[key]);
}

function validMockAnswer(value: unknown): boolean {
  return plainExact(value, ["schemaVersion", "decision", "notes"]) && value.schemaVersion === 1 &&
    value.decision === "accepted_structure" && Array.isArray(value.notes) && value.notes.length === 1 &&
    value.notes[0] === "Synthetische Struktur akzeptiert.";
}

export class ReducedClauseExcerptPrototype {
  readonly #issued = new WeakSet<object>();
  readonly #consumed = new WeakSet<object>();

  constructor(
    private readonly authority: ReducedClausePrototypeAuthority,
    private readonly provider: ReducedClauseMockProvider,
  ) {}

  #issue(preview: ReducedClausePreview): ReducedClausePreview {
    this.#issued.add(preview);
    return preview;
  }

  #isUsable(preview: ReducedClausePreview): boolean {
    return this.#issued.has(preview) && !this.#consumed.has(preview) && this.authority.isCurrent(preview.token);
  }

  prepare(value: unknown): ReducedClauseResult {
    if (!this.authority.enabled) return { ok: false, reasonCode: "FEATURE_DISABLED" };
    let begun;
    try { begun = this.authority.begin(value); } catch { return { ok: false, reasonCode: "REQUEST_INVALID" }; }
    if (!begun) return { ok: false, reasonCode: "SOURCE_DENIED" };
    const structure = this.authority.read(begun.token);
    if (structure === null) return { ok: false, reasonCode: this.authority.isCurrent(begun.token) ? "SOURCE_UNSAFE" : "STALE" };
    if (!this.authority.isCurrent(begun.token)) return { ok: false, reasonCode: "STALE" };
    return this.#issue(previewFor(begun.token, begun.request.revision, DEFAULT_REDUCED_CLAUSE_OUTBOUND_TEXT));
  }

  edit(preview: ReducedClausePreview, outgoingText: unknown, nextRevision: number): ReducedClauseResult {
    if (!this.#isUsable(preview)) return { ok: false, reasonCode: "STALE" };
    this.#consumed.add(preview);
    const token = this.authority.revise(preview.token);
    if (token === null) return { ok: false, reasonCode: "STALE" };
    if (!approvedOutboundText(outgoingText) || !Number.isInteger(nextRevision) || nextRevision !== preview.revision + 1) {
      return { ok: false, reasonCode: "EDIT_UNSAFE" };
    }
    return this.#issue(previewFor(token, nextRevision, outgoingText));
  }

  stayLocal(preview: ReducedClausePreview): ReducedClauseResult {
    if (!this.#isUsable(preview)) return { ok: false, reasonCode: "STALE" };
    this.#consumed.add(preview);
    if (this.authority.revise(preview.token) === null) return { ok: false, reasonCode: "STALE" };
    return Object.freeze({ ok: true, kind: "local", outgoingText: preview.outgoingText, payloadSha256: preview.payloadSha256, revision: preview.revision });
  }

  async confirm(preview: ReducedClausePreview, confirmation: unknown, options: { signal?: AbortSignal } = {}): Promise<ReducedClauseResult> {
    if (options.signal?.aborted || !this.#isUsable(preview)) return { ok: false, reasonCode: "STALE" };
    if (!confirmationMatches(preview, confirmation)) return { ok: false, reasonCode: "CONFIRMATION_INVALID" };
    const expectedPayload = payloadFor(preview.outgoingText);
    if (!approvedOutboundText(preview.outgoingText) || JSON.stringify(preview.payload) !== JSON.stringify(expectedPayload) ||
        payloadHash(preview.payload) !== preview.payloadSha256) return { ok: false, reasonCode: "FINAL_SCAN" };
    try {
      assertPrivacySafeResearchOutbound(preview.payload, { maxBytes: MAX_OUTBOUND_BYTES });
    } catch { return { ok: false, reasonCode: "FINAL_SCAN" }; }
    if (options.signal?.aborted || !this.#isUsable(preview)) return { ok: false, reasonCode: "STALE" };
    this.#consumed.add(preview);
    let raw: unknown;
    try { raw = await this.provider.generate(preview.payload, options.signal ? { signal: options.signal } : undefined); }
    catch { return { ok: false, reasonCode: "PROVIDER_ERROR" }; }
    if (options.signal?.aborted || !this.authority.isCurrent(preview.token)) return { ok: false, reasonCode: "STALE" };
    if (!validMockAnswer(raw)) return { ok: false, reasonCode: "PROVIDER_RESPONSE_INVALID" };
    return Object.freeze({
      ok: true,
      kind: "sent",
      outgoingText: preview.outgoingText,
      payloadSha256: preview.payloadSha256,
      revision: preview.revision,
      provider: "MOCK_OFFLINE",
      answer: "Synthetische Struktur akzeptiert.",
    });
  }
}
