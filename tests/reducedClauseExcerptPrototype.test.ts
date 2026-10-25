import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_REDUCED_CLAUSE_OUTBOUND_TEXT,
  REDUCED_CLAUSE_FEATURE_DEFAULT_ENABLED,
  ReducedClauseExcerptPrototype,
  ReducedClausePrototypeAuthority,
  confirmationFor,
  type ReducedClauseMockPayload,
  type ReducedClauseMockProvider,
  type ReducedClausePreview,
} from "../src/reducedClauseExcerptPrototype.js";

const request = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  organizationId: "Org-B",
  actorId: "Actor-B",
  sessionId: "Session-B",
  taskId: "Task-B",
  sourceId: "synthetic-clause-01",
  purpose: "SYNTHETIC_REDUCED_CLAUSE_PREVIEW",
  revision: 1,
  ...overrides,
});

const safeSource = () => ({
  schemaVersion: 1,
  clauseId: "synthetic-clause-01",
  clauseKind: "weekly_working_hours_change",
  structureVersion: 1,
  fields: ["employee_name", "current_weekly_hours", "new_weekly_hours", "effective_date", "unchanged_terms"],
});

function fixture(options: {
  enabled?: boolean;
  sourceValue?: unknown;
  sourceOrganizationId?: string;
  sourceIds?: readonly string[];
  fieldIds?: readonly string[];
  mutateDuringRead?: boolean;
} = {}) {
  let reads = 0;
  let calls = 0;
  const payloads: ReducedClauseMockPayload[] = [];
  let authority!: ReducedClausePrototypeAuthority;
  const source = {
    id: "synthetic-clause-01",
    organizationId: options.sourceOrganizationId ?? "Org-B",
    readField(field: string) {
      reads += 1;
      assert.equal(field, "reduced_clause_structure");
      if (options.mutateDuringRead) authority.invalidateContext();
      return options.sourceValue ?? safeSource();
    },
  };
  authority = new ReducedClausePrototypeAuthority({
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
    organizationId: "Org-B",
    actorId: "Actor-B",
    sessionId: "Session-B",
    taskIds: ["Task-B"],
    sourceIds: options.sourceIds ?? ["synthetic-clause-01"],
    fieldIds: options.fieldIds ?? ["reduced_clause_structure"],
    authorizationVersion: 7,
  }, [source]);
  const provider: ReducedClauseMockProvider = {
    name: "MOCK_OFFLINE",
    get callCount() { return calls; },
    async generate(payload) {
      calls += 1;
      payloads.push(payload);
      return { schemaVersion: 1, decision: "accepted_structure", notes: ["Synthetische Struktur akzeptiert."] };
    },
  };
  return {
    authority,
    provider,
    prototype: new ReducedClauseExcerptPrototype(authority, provider),
    payloads,
    get reads() { return reads; },
    get calls() { return calls; },
  };
}

function asPreview(result: ReturnType<ReducedClauseExcerptPrototype["prepare"]>): ReducedClausePreview {
  assert.equal(result.ok && result.kind, "preview");
  if (!result.ok || result.kind !== "preview") throw new Error("preview expected");
  return result;
}

test("P9B stays disabled by default with zero getter and zero transport access", async () => {
  assert.equal(REDUCED_CLAUSE_FEATURE_DEFAULT_ENABLED, false);
  const f = fixture();
  const result = f.prototype.prepare(request());
  assert.deepEqual(result, { ok: false, reasonCode: "FEATURE_DISABLED" });
  assert.equal(f.reads, 0);
  assert.equal(f.calls, 0);
});

test("P9B known structure produces a visible placeholder-only preview and sends the same exact MOCK payload", async () => {
  const f = fixture({ enabled: true });
  const preview = asPreview(f.prototype.prepare(request()));
  assert.equal(preview.outgoingText, DEFAULT_REDUCED_CLAUSE_OUTBOUND_TEXT);
  assert.match(preview.outgoingText, /\{\{EMPLOYEE_NAME\}\}/);
  assert.match(preview.outgoingText, /\{\{CURRENT_WEEKLY_HOURS\}\}/);
  assert.doesNotMatch(JSON.stringify(preview.payload), /Lina|2031-09-01|20 Stunden|25 Stunden|Gehalt|Krankheit|Org-B|Actor-B|Session-B|Task-B|synthetic-clause-01/i);
  const sent = await f.prototype.confirm(preview, confirmationFor(preview));
  assert.equal(sent.ok && sent.kind, "sent");
  assert.equal(f.reads, 1);
  assert.equal(f.calls, 1);
  assert.deepEqual(f.payloads[0], preview.payload);
});

test("P9B blocks unknown source additions, original values, health, pay, rare combinations and extra text", () => {
  const additions = [
    { employeeName: "Lina Mustervertrag" },
    { effectiveDate: "2031-09-01" },
    { pay: "3.500 EUR" },
    { health: "Krankheit" },
    { rareCombination: ["Arbeitszeit", "Pflegegrad", "Eintrittsdatum"] },
    { extraText: "Zusätzliche individuelle Vertragsklausel" },
    { clauseKind: "unknown_clause" },
  ];
  for (const addition of additions) {
    const f = fixture({ enabled: true, sourceValue: { ...safeSource(), ...addition } });
    assert.deepEqual(f.prototype.prepare(request()), { ok: false, reasonCode: "SOURCE_UNSAFE" });
    assert.equal(f.reads, 1);
    assert.equal(f.calls, 0);
  }
});

test("P9B unknown source, missing field right, foreign organization and getter race stay closed", () => {
  const unknown = fixture({ enabled: true, sourceIds: ["different-source"] });
  assert.deepEqual(unknown.prototype.prepare(request()), { ok: false, reasonCode: "SOURCE_DENIED" });
  assert.equal(unknown.reads, 0); assert.equal(unknown.calls, 0);

  const rights = fixture({ enabled: true, fieldIds: [] });
  assert.deepEqual(rights.prototype.prepare(request()), { ok: false, reasonCode: "SOURCE_DENIED" });
  assert.equal(rights.reads, 0); assert.equal(rights.calls, 0);

  const foreign = fixture({ enabled: true, sourceOrganizationId: "Org-C" });
  assert.deepEqual(foreign.prototype.prepare(request()), { ok: false, reasonCode: "SOURCE_DENIED" });
  assert.equal(foreign.reads, 0); assert.equal(foreign.calls, 0);

  const raced = fixture({ enabled: true, mutateDuringRead: true });
  assert.deepEqual(raced.prototype.prepare(request()), { ok: false, reasonCode: "STALE" });
  assert.equal(raced.reads, 1); assert.equal(raced.calls, 0);
});

test("P9B permits only a closed safe edit and invalidates the previous revision", async () => {
  const f = fixture({ enabled: true });
  const original = asPreview(f.prototype.prepare(request()));
  const safeText = original.outgoingText.replace("Reduzierter synthetischer Klauselauszug", "Synthetische Arbeitszeitklausel");
  const editedResult = f.prototype.edit(original, safeText, 2);
  assert.equal(editedResult.ok && editedResult.kind, "preview");
  if (!editedResult.ok || editedResult.kind !== "preview") return;
  assert.notEqual(editedResult.payloadSha256, original.payloadSha256);
  assert.deepEqual(await f.prototype.confirm(original, confirmationFor(original)), { ok: false, reasonCode: "STALE" });
  assert.equal(f.calls, 0);
  const sent = await f.prototype.confirm(editedResult, confirmationFor(editedResult));
  assert.equal(sent.ok && sent.kind, "sent");
  assert.deepEqual(f.payloads[0], editedResult.payload);
});

test("P9B blocks unsafe edits and a confirmation cannot override that block", async () => {
  for (const unsafe of [
    `${DEFAULT_REDUCED_CLAUSE_OUTBOUND_TEXT}\nLina Mustervertrag`,
    DEFAULT_REDUCED_CLAUSE_OUTBOUND_TEXT.replace("{{EFFECTIVE_DATE}}", "2031-09-01"),
    DEFAULT_REDUCED_CLAUSE_OUTBOUND_TEXT.replace("Allgemeine Strukturprüfung", "Gehalt und Gesundheit prüfen"),
    `${DEFAULT_REDUCED_CLAUSE_OUTBOUND_TEXT}\nWeitere Nebenbedingung`,
  ]) {
    const f = fixture({ enabled: true });
    const preview = asPreview(f.prototype.prepare(request()));
    assert.deepEqual(f.prototype.edit(preview, unsafe, 2), { ok: false, reasonCode: "EDIT_UNSAFE" });
    assert.deepEqual(await f.prototype.confirm(preview, confirmationFor(preview)), { ok: false, reasonCode: "STALE" });
    assert.equal(f.calls, 0);
  }
});

test("P9B rejects fabricated previews, payload extensions and malformed requests with zero transport", async () => {
  const f = fixture({ enabled: true });
  assert.deepEqual(f.prototype.prepare({ ...request(), approval: true }), { ok: false, reasonCode: "REQUEST_INVALID" });
  assert.equal(f.reads, 0); assert.equal(f.calls, 0);

  const preview = asPreview(f.prototype.prepare(request()));
  const fabricated = {
    ...preview,
    payload: { ...preview.payload, privateMetadata: "Lina Mustervertrag" },
    payloadSha256: "0".repeat(64),
  } as unknown as ReducedClausePreview;
  assert.deepEqual(await f.prototype.confirm(fabricated, confirmationFor(fabricated)), { ok: false, reasonCode: "STALE" });
  assert.equal(f.calls, 0);
});

test("P9B binds confirmation to payload, revision, session, organization and current rights", async () => {
  for (const mutation of [
    { payloadSha256: "0".repeat(64) },
    { revision: 2 },
    { sessionId: "Session-C" },
    { organizationId: "Org-C" },
    { authorizationVersion: 8 },
  ]) {
    const f = fixture({ enabled: true });
    const preview = asPreview(f.prototype.prepare(request()));
    const confirmation = { ...confirmationFor(preview), ...mutation };
    assert.deepEqual(await f.prototype.confirm(preview, confirmation), { ok: false, reasonCode: "CONFIRMATION_INVALID" });
    assert.equal(f.calls, 0);
  }
});

test("P9B revoke, context race and abort before confirmation produce zero transport calls", async () => {
  const revoked = fixture({ enabled: true });
  const revokedPreview = asPreview(revoked.prototype.prepare(request()));
  revoked.authority.revoke();
  assert.deepEqual(await revoked.prototype.confirm(revokedPreview, confirmationFor(revokedPreview)), { ok: false, reasonCode: "STALE" });
  assert.equal(revoked.calls, 0);

  const changed = fixture({ enabled: true });
  const changedPreview = asPreview(changed.prototype.prepare(request()));
  changed.authority.invalidateContext();
  assert.deepEqual(await changed.prototype.confirm(changedPreview, confirmationFor(changedPreview)), { ok: false, reasonCode: "STALE" });
  assert.equal(changed.calls, 0);

  const aborted = fixture({ enabled: true });
  const abortedPreview = asPreview(aborted.prototype.prepare(request()));
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await aborted.prototype.confirm(abortedPreview, confirmationFor(abortedPreview), { signal: controller.signal }), { ok: false, reasonCode: "STALE" });
  assert.equal(aborted.calls, 0);
});

test("P9B stay-local retains the preview without any transport", () => {
  const f = fixture({ enabled: true });
  const preview = asPreview(f.prototype.prepare(request()));
  const result = f.prototype.stayLocal(preview);
  assert.equal(result.ok && result.kind, "local");
  assert.equal(f.calls, 0);
});

test("P9B stay-local consumes the preview and prevents later transport", async () => {
  const f = fixture({ enabled: true });
  const preview = asPreview(f.prototype.prepare(request()));
  assert.equal(f.prototype.stayLocal(preview).ok, true);
  assert.deepEqual(await f.prototype.confirm(preview, confirmationFor(preview)), { ok: false, reasonCode: "STALE" });
  assert.equal(f.calls, 0);
});

test("P9B confirmation is one-use even when two confirmations race", async () => {
  const f = fixture({ enabled: true });
  const preview = asPreview(f.prototype.prepare(request()));
  let release!: () => void;
  let started!: () => void;
  let transportCalls = 0;
  const began = new Promise<void>((resolve) => { started = resolve; });
  f.provider.generate = async () => {
    transportCalls += 1;
    started();
    await new Promise<void>((resolve) => { release = resolve; });
    return { schemaVersion: 1, decision: "accepted_structure", notes: ["Synthetische Struktur akzeptiert."] };
  };
  const first = f.prototype.confirm(preview, confirmationFor(preview));
  await began;
  assert.deepEqual(await f.prototype.confirm(preview, confirmationFor(preview)), { ok: false, reasonCode: "STALE" });
  release();
  assert.equal((await first).ok, true);
  assert.equal(transportCalls, 1);
});

test("P9B discards a held MOCK answer after revocation or browser abort", async () => {
  for (const stop of ["revoke", "abort"] as const) {
    const f = fixture({ enabled: true });
    const preview = asPreview(f.prototype.prepare(request()));
    let release!: () => void;
    let started!: () => void;
    let transportCalls = 0;
    const began = new Promise<void>((resolve) => { started = resolve; });
    f.provider.generate = async () => {
      transportCalls += 1;
      started();
      await new Promise<void>((resolve) => { release = resolve; });
      return { schemaVersion: 1, decision: "accepted_structure", notes: ["Synthetische Struktur akzeptiert."] };
    };
    const controller = new AbortController();
    const pending = f.prototype.confirm(preview, confirmationFor(preview), { signal: controller.signal });
    await began;
    if (stop === "revoke") f.authority.revoke(); else controller.abort();
    release();
    assert.deepEqual(await pending, { ok: false, reasonCode: "STALE" });
    assert.equal(transportCalls, 1);
  }
});
