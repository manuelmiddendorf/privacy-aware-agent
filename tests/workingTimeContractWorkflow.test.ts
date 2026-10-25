import assert from "node:assert/strict";
import test from "node:test";
import { WorkingTimeContractWorkflow, WorkingTimeWorkflowAuthority, type WorkingTimeWorkflowModel } from "../src/workingTimeContractWorkflow.js";
import { createWorkingTimeTemplateMockAnswer, type WorkingTimeMockPayload, type WorkingTimeResearchMock } from "../src/workingTimeResearchCatalog.js";

type Intent = { personId: string | null; targetWeeklyHours: number | null; effectiveDate: string | null; researchRequested: boolean | null; templateRequested: boolean | null };
const completeIntent = (overrides: Partial<Intent> = {}): Intent => ({ personId: "person-lina", targetWeeklyHours: 25, effectiveDate: "2031-09-01", researchRequested: false, templateRequested: false, ...overrides });
const request = (confirmedIntent: Intent = completeIntent(), text = "Ändere für Lina Mustervertrag die Wochenarbeitszeit auf 25 Stunden ab 2031-09-01.") => ({
  schemaVersion: 1, organizationId: "OrgWF-A", actorId: "ActorWF-A", sessionId: "SessionWF-A", taskId: "TaskWF-A", sourceId: "contract-lina",
  purpose: "SYNTHETIC_WORKING_TIME_CONTRACT_DRAFT", text, confirmedIntent,
});

function merge(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1, documentKind: "working_time_amendment", displayName: "Lina Mustervertrag", currentWeeklyHours: 20,
    targetWeeklyHours: 25, effectiveDate: "2031-09-01", unchangedTermsConfirmed: true,
    citations: ["contract-lina:p01", "contract-lina:p02"], conflicts: [], openPoints: [],
    reviewNotes: ["Vor Unterzeichnung fachlich und rechtlich prüfen."], ...overrides,
  };
}

function fixture(options: { allowResearch?: boolean; allowTemplate?: boolean; plan?: Record<string, unknown>; merge?: Record<string, unknown>; sourceParagraphs?: readonly { id: string; text: string }[]; currentWeeklyHours?: number; allowedFields?: readonly ("display_name" | "current_weekly_hours" | "contract_paragraphs" | "unchanged_terms")[] } = {}) {
  let reads = 0;
  let lastFields: readonly string[] = [];
  const payloads: WorkingTimeMockPayload[] = [];
  const paragraphs = options.sourceParagraphs ?? [
    { id: "contract-lina:p01", text: "Bisherige vertragliche Arbeitszeit 20 Stunden je Woche" },
    { id: "contract-lina:p02", text: "Andere Vertragsbestimmungen bleiben unverändert" },
  ];
  const source = {
    id: "contract-lina", organizationId: "OrgWF-A", personId: "person-lina",
    readFields(fields: readonly string[]) {
      reads += 1;
      lastFields = [...fields];
      const all: Record<string, unknown> = { display_name: "Lina Mustervertrag", current_weekly_hours: options.currentWeeklyHours ?? 20, contract_paragraphs: paragraphs, unchanged_terms: "Andere Vertragsbestimmungen bleiben unverändert" };
      return Object.fromEntries(fields.map((field) => [field, all[field]]));
    },
  };
  const authority = new WorkingTimeWorkflowAuthority({
    organizationId: "OrgWF-A", actorId: "ActorWF-A", sessionId: "SessionWF-A", taskIds: ["TaskWF-A"], sourceIds: ["contract-lina"],
    people: [{ personId: "person-lina", displayLabel: "Lina Mustervertrag" }], fieldIds: options.allowedFields ?? ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"],
    allowGeneralResearch: options.allowResearch ?? true, allowGeneralTemplate: options.allowTemplate ?? true, researchCatalogVersion: 1,
  }, [source]);
  let planCalls = 0;
  let draftCalls = 0;
  const model: WorkingTimeWorkflowModel = {
    name: "LOCAL_TEST_DOUBLE",
    get planCallCount() { return planCalls; }, get draftCallCount() { return draftCalls; },
    async plan() {
      planCalls += 1;
      return options.plan ?? { schemaVersion: 1, task: "employment_contract_change", personId: "person-lina", targetWeeklyHours: 25, effectiveDate: "2031-09-01", researchRequested: false, templateRequested: false, requiredSourceFields: ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"] };
    },
    async draft() { draftCalls += 1; return options.merge ?? merge(); },
  };
  let mockCalls = 0;
  const mock: WorkingTimeResearchMock = {
    name: "MOCK_OFFLINE", get callCount() { return mockCalls; },
    async generate(input) {
      mockCalls += 1; payloads.push(input);
      return "templateRequest" in input ? createWorkingTimeTemplateMockAnswer() : { text: "Synthetische allgemeine Referenz; keine aktuelle Rechtsauskunft." };
    },
  };
  return { authority, model, mock, payloads, get reads() { return reads; }, get lastFields() { return lastFields; }, lane: new WorkingTimeContractWorkflow(authority, model, mock) };
}

test("P9 local fixed template is filled by the host and unknown employer and consequences stay open", async () => {
  const f = fixture();
  const result = await f.lane.run(request());
  assert.equal(result.ok && result.kind, "draft");
  if (!result.ok || result.kind !== "draft") return;
  assert.match(result.draft, /^Unverbindlicher, ungeprüfter synthetischer Entwurf\n\nÄnderungsvereinbarung zur Wochenarbeitszeit/);
  assert.match(result.draft, /\[ARBEITGEBER ERGÄNZEN\].*Lina Mustervertrag/s);
  assert.match(result.draft, /20 Stunden.*01\.09\.2031.*25 Stunden/s);
  assert.match(result.draft, /Alle übrigen Vertragsbestimmungen bleiben unverändert/);
  assert.deepEqual(result.citations, ["contract-lina:p01", "contract-lina:p02"]);
  assert.match(result.gaps.join(" "), /Arbeitgeberbezeichnung/);
  assert.match(result.gaps.join(" "), /Vergütung.*Folgewirkungen/);
  assert.equal(result.templateUsed, false); assert.equal(result.templateProvenance, "LOCAL_FIXED");
  assert.equal(f.model.planCallCount, 1); assert.equal(f.model.draftCallCount, 1); assert.equal(f.mock.callCount, 0); assert.equal(f.reads, 1);
});

test("P9 MOCK template is a separate explicit choice and outbound data is exactly generic", async () => {
  const f = fixture({ plan: { schemaVersion: 1, task: "employment_contract_change", personId: "person-lina", targetWeeklyHours: 25, effectiveDate: "2031-09-01", researchRequested: false, templateRequested: true, requiredSourceFields: ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"] } });
  const result = await f.lane.run(request(completeIntent({ templateRequested: true })));
  assert.equal(result.ok && result.kind, "draft");
  if (result.ok && result.kind === "draft") { assert.equal(result.templateUsed, true); assert.equal(result.templateProvenance, "MOCK_OFFLINE"); }
  assert.equal(f.mock.callCount, 1);
  const outbound = JSON.stringify(f.payloads[0]);
  assert.match(outbound, /generic_amendment_template/);
  assert.doesNotMatch(outbound, /Lina|20|25|2031|OrgWF|ActorWF|contract-lina|SessionWF/i);
});

test("P9 missing facts and both choices cause clarification before source or MOCK access", async () => {
  const f = fixture({ plan: { schemaVersion: 1, task: "employment_contract_change", personId: null, targetWeeklyHours: null, effectiveDate: null, researchRequested: false, templateRequested: false, requiredSourceFields: ["display_name"] } });
  const result = await f.lane.run(request(completeIntent({ personId: null, targetWeeklyHours: null, effectiveDate: null, researchRequested: null, templateRequested: null }), "Bereite eine Änderung vor."));
  assert.equal(result.ok && result.kind, "clarification");
  if (result.ok && result.kind === "clarification") {
    assert.equal(result.questions.length, 5);
    assert.deepEqual(result.proposedIntent, { personId: null, targetWeeklyHours: null, effectiveDate: null, researchRequested: false, templateRequested: false });
  }
  assert.equal(f.reads, 0); assert.equal(f.mock.callCount, 0); assert.equal(f.model.draftCallCount, 0);
});

test("P9 rights, request schema and confirmed/model contradictions fail before private reads", async () => {
  const foreign = fixture();
  assert.deepEqual(await foreign.lane.run({ ...request(), organizationId: "OrgWF-B" }), { ok: false, reasonCode: "DENIED" });
  assert.deepEqual(await foreign.lane.run({ ...request(), privateField: "secret" }), { ok: false, reasonCode: "INVALID" });
  const deniedTemplate = fixture({ allowTemplate: false, plan: { schemaVersion: 1, task: "employment_contract_change", personId: "person-lina", targetWeeklyHours: 25, effectiveDate: "2031-09-01", researchRequested: false, templateRequested: true, requiredSourceFields: ["display_name"] } });
  assert.deepEqual(await deniedTemplate.lane.run(request(completeIntent({ templateRequested: true }))), { ok: false, reasonCode: "DENIED" });
  const contradictory = fixture({ plan: { schemaVersion: 1, task: "employment_contract_change", personId: "person-lina", targetWeeklyHours: 30, effectiveDate: "2031-09-01", researchRequested: false, templateRequested: false, requiredSourceFields: ["display_name"] } });
  const result = await contradictory.lane.run(request());
  assert.equal(result.ok && result.kind, "clarification");
  assert.equal(contradictory.reads, 0);
});

test("P9 confirmed UI facts complete an unchanged neutral prompt when the plan still has nulls", async () => {
  const f = fixture({ plan: { schemaVersion: 1, task: "employment_contract_change", personId: null, targetWeeklyHours: null, effectiveDate: null, researchRequested: null, templateRequested: null, requiredSourceFields: ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"] } });
  const result = await f.lane.run(request(completeIntent(), "Bereite bitte eine unverbindliche Änderung der Wochenarbeitszeit vor."));
  assert.equal(result.ok && result.kind, "draft");
  assert.equal(f.reads, 1); assert.equal(f.model.draftCallCount, 1);
});

test("P9 host-declared amendment fields cannot be displaced by duplicate model suggestions", async () => {
  const f = fixture({ plan: { schemaVersion: 1, task: "employment_contract_change", personId: "person-lina", targetWeeklyHours: 25, effectiveDate: "2031-09-01", researchRequested: false, templateRequested: false, requiredSourceFields: ["contract_paragraphs", "current_weekly_hours", "current_weekly_hours", "current_weekly_hours"] } });
  const result = await f.lane.run(request());
  assert.equal(result.ok && result.kind, "draft");
  assert.equal(f.reads, 1);
  assert.deepEqual(f.lastFields, ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"]);
  assert.equal(f.model.draftCallCount, 1);
});

test("P9 missing rights for any host-required amendment field deny before getter, MOCK and merge", async () => {
  for (const allowedFields of [
    ["current_weekly_hours", "contract_paragraphs", "unchanged_terms"],
    ["display_name", "current_weekly_hours", "contract_paragraphs"],
  ] as const) {
    const f = fixture({ allowedFields, plan: { schemaVersion: 1, task: "employment_contract_change", personId: "person-lina", targetWeeklyHours: 25, effectiveDate: "2031-09-01", researchRequested: false, templateRequested: true, requiredSourceFields: ["contract_paragraphs", "current_weekly_hours", "current_weekly_hours", "current_weekly_hours"] } });
    assert.deepEqual(await f.lane.run(request(completeIntent({ templateRequested: true }))), { ok: false, reasonCode: "DENIED" });
    assert.equal(f.reads, 0); assert.equal(f.mock.callCount, 0); assert.equal(f.model.draftCallCount, 0);
  }
});

test("P9 explicit research and template choices remain authoritative over free-text defaults", async () => {
  const f = fixture({ plan: { schemaVersion: 1, task: "employment_contract_change", personId: null, targetWeeklyHours: null, effectiveDate: null, researchRequested: null, templateRequested: null, requiredSourceFields: ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"] } });
  const result = await f.lane.run(request(completeIntent({ researchRequested: true, templateRequested: true }), "Bereite bitte eine unverbindliche Änderung der Wochenarbeitszeit vor."));
  assert.equal(result.ok && result.kind, "draft");
  if (result.ok && result.kind === "draft") { assert.equal(result.researchUsed, true); assert.equal(result.templateUsed, true); }
  assert.equal(f.mock.callCount, 2);
});

test("P9 an explicit free-text rejection still conflicts with a contrary confirmed choice", async () => {
  const f = fixture({ plan: { schemaVersion: 1, task: "employment_contract_change", personId: null, targetWeeklyHours: null, effectiveDate: null, researchRequested: false, templateRequested: false, requiredSourceFields: ["display_name"] } });
  const result = await f.lane.run(request(completeIntent({ templateRequested: true }), "Bereite die Änderung ausdrücklich mit der lokalen festen Vorlage und ohne allgemeine Recherche vor."));
  assert.equal(result.ok && result.kind, "clarification");
  assert.equal(f.reads, 0); assert.equal(f.mock.callCount, 0); assert.equal(f.model.draftCallCount, 0);
});

test("P9 rejects model-added facts, foreign citations and incomplete unchanged-term evidence", async () => {
  for (const bad of [
    merge({ salary: "999 EUR" }),
    merge({ targetWeeklyHours: 26 }),
    merge({ citations: ["contract-lina:p01", "foreign:p02"] }),
    merge({ citations: ["contract-lina:p01"] }),
    merge({ citations: ["contract-lina:p02"] }),
  ]) {
    const f = fixture({ merge: bad });
    assert.deepEqual(await f.lane.run(request()), { ok: false, reasonCode: "DRAFT_INVALID" });
  }
});

test("P9 current-hours evidence requires a complete unsigned numeric token", async () => {
  for (const misleading of ["Betrag 120,20 Stunden", "Betrag 120.20 Stunden", "Abweichung -20 Stunden"]) {
    const f = fixture({ sourceParagraphs: [{ id: "contract-lina:p01", text: misleading }, { id: "contract-lina:p02", text: "Andere Vertragsbestimmungen bleiben unverändert" }] });
    assert.deepEqual(await f.lane.run(request()), { ok: false, reasonCode: "DRAFT_INVALID" });
  }
  for (const supported of ["Bisherige Arbeitszeit 20 Stunden", "Bisherige Arbeitszeit 20 Wochenstunden"]) {
    const f = fixture({ sourceParagraphs: [{ id: "contract-lina:p01", text: supported }, { id: "contract-lina:p02", text: "Andere Vertragsbestimmungen bleiben unverändert" }] });
    assert.equal((await f.lane.run(request())).ok, true);
  }
  const decimal = fixture({
    currentWeeklyHours: 32.5,
    merge: merge({ currentWeeklyHours: 32.5 }),
    sourceParagraphs: [{ id: "contract-lina:p01", text: "Bisherige Arbeitszeit 32,5 Wochenstunden" }, { id: "contract-lina:p02", text: "Andere Vertragsbestimmungen bleiben unverändert" }],
  });
  assert.equal((await decimal.lane.run(request())).ok, true);
});

test("P9 source conflict stops before host rendering instead of asserting unchanged terms", async () => {
  const f = fixture({ merge: merge({ conflicts: ["Die Bestandsklauseln widersprechen sich."], openPoints: ["Betroffene Klausel fachlich klären."], citations: ["contract-lina:p01", "contract-lina:p02"] }) });
  const result = await f.lane.run(request());
  assert.equal(result.ok && result.kind, "clarification");
  if (result.ok && result.kind === "clarification") assert.match(result.questions[0]!, /Widerspruch.*klären/);
  assert.equal("draft" in result, false);
});

test("P9 revocation and browser abort discard held template results before merge", async () => {
  for (const stop of ["revoke", "abort"] as const) {
    const f = fixture({ plan: { schemaVersion: 1, task: "employment_contract_change", personId: "person-lina", targetWeeklyHours: 25, effectiveDate: "2031-09-01", researchRequested: false, templateRequested: true, requiredSourceFields: ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"] } });
    let release!: (value: unknown) => void; let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    f.mock.generate = async () => { started(); return await new Promise((resolve) => { release = resolve; }); };
    const controller = new AbortController();
    const pending = f.lane.run(request(completeIntent({ templateRequested: true })), { signal: controller.signal });
    await began;
    if (stop === "revoke") f.authority.revoke(); else controller.abort();
    release(createWorkingTimeTemplateMockAnswer());
    assert.deepEqual(await pending, { ok: false, reasonCode: "STALE" });
    assert.equal(f.model.draftCallCount, 0);
  }
});

test("P9 revoked source access remains closed", async () => {
  const f = fixture();
  f.authority.revoke();
  assert.deepEqual(await f.lane.run(request()), { ok: false, reasonCode: "DENIED" });
  assert.equal(f.model.planCallCount, 0); assert.equal(f.reads, 0);
});
