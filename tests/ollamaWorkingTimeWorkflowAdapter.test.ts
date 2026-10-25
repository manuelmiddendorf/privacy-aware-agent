import assert from "node:assert/strict";
import test from "node:test";
import { OllamaWorkingTimeWorkflowAdapter } from "../src/ollamaWorkingTimeWorkflowAdapter.js";
import { P6_OLLAMA_MANIFEST_SHA256, P6_OLLAMA_MODEL, type OllamaResearchTransport } from "../src/ollamaResearchAdapter.js";

const config = { enabled: true, verifiedManifestSha256: P6_OLLAMA_MANIFEST_SHA256, timeoutMs: 1000, maxRequestBytes: 24_576 as const, maxResponseBytes: 16_384 as const };
const envelope = (content: unknown) => ({ status: 200, body: JSON.stringify({ model: P6_OLLAMA_MODEL, done: true, done_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }) });

test("P9 adapter uses one pinned closed plan call and contains no tools or remote URL", async () => {
  let captured = "";
  const transport: OllamaResearchTransport = async (request) => { captured = request.body; return envelope({ schemaVersion: 1, task: "employment_contract_change", personId: "person-lina", targetWeeklyHours: 25, effectiveDate: "2031-09-01", researchRequested: false, templateRequested: false, requiredSourceFields: ["display_name"] }); };
  const adapter = new OllamaWorkingTimeWorkflowAdapter(transport, config);
  await adapter.plan({ requestText: "Lina: 25 Stunden ab 2031-09-01", authorizedPeople: [{ personId: "person-lina", displayLabel: "Lina Mustervertrag" }] });
  const body = JSON.parse(captured);
  assert.equal(body.model, P6_OLLAMA_MODEL); assert.equal(body.stream, false); assert.equal(body.think, false); assert.equal(body.options.num_predict, 256); assert.equal(body.options.num_ctx, 16_384);
  assert.deepEqual(body.format.properties.researchRequested.anyOf, [{ type: "boolean" }, { type: "null" }]);
  assert.deepEqual(body.format.properties.templateRequested.anyOf, [{ type: "boolean" }, { type: "null" }]);
  assert.equal(body.format.properties.requiredSourceFields.maxItems, 4); assert.equal("uniqueItems" in body.format.properties.requiredSourceFields, false);
  assert.equal("tools" in body, false); assert.doesNotMatch(captured, /https?:\/\//i); assert.equal(adapter.transportCallCount, 1);
});

test("P9 adapter asks only for a closed merge proposal; agreement prose remains host-owned", async () => {
  let captured = "";
  const response = { schemaVersion: 1, documentKind: "working_time_amendment", displayName: "Lina Mustervertrag", currentWeeklyHours: 20, targetWeeklyHours: 25, effectiveDate: "2031-09-01", unchangedTermsConfirmed: true, citations: ["contract-lina:p01", "contract-lina:p02"], conflicts: [], openPoints: [], reviewNotes: ["Prüfen."] };
  const transport: OllamaResearchTransport = async (request) => { captured = request.body; return envelope(response); };
  const adapter = new OllamaWorkingTimeWorkflowAdapter(transport, config);
  assert.deepEqual(await adapter.draft({
    requestText: "synthetisch", targetWeeklyHours: 25, effectiveDate: "2031-09-01",
    source: { display_name: "Lina Mustervertrag", current_weekly_hours: 20, contract_paragraphs: [{ id: "contract-lina:p01", text: "20 Stunden" }, { id: "contract-lina:p02", text: "Übrige Bestimmungen unverändert" }], unchanged_terms: "Übrige Bestimmungen unverändert" },
    generalRequirements: null,
    generalTemplate: { schemaVersion: 1, templateId: "SYNTHETIC_WORKING_TIME_AMENDMENT_V1", sections: { heading: "Änderungsvereinbarung zur Wochenarbeitszeit", parties: "Zwischen {{EMPLOYER_NAME}} und {{EMPLOYEE_NAME}} wird folgende Änderung vereinbart:", change: "Die bisherige Wochenarbeitszeit von {{CURRENT_WEEKLY_HOURS}} Stunden wird mit Wirkung zum {{EFFECTIVE_DATE}} auf {{NEW_WEEKLY_HOURS}} Stunden geändert.", unchangedTerms: "Alle übrigen Vertragsbestimmungen bleiben unverändert.", signatures: "Ort, Datum und Unterschriften beider Parteien" }, placeholders: ["{{EMPLOYER_NAME}}", "{{EMPLOYEE_NAME}}", "{{CURRENT_WEEKLY_HOURS}}", "{{NEW_WEEKLY_HOURS}}", "{{EFFECTIVE_DATE}}"], provenance: { provider: "LOCAL_FIXED", catalogVersion: 1, goal: "generic_amendment_template" } },
    constraints: ["GESCHLOSSENER_FAKTENABGLEICH"],
  }), response);
  const body = JSON.parse(captured);
  assert.equal(body.options.num_predict, 768);
  assert.deepEqual(Object.keys(body.format.properties).sort(), ["citations", "conflicts", "currentWeeklyHours", "displayName", "documentKind", "effectiveDate", "openPoints", "reviewNotes", "schemaVersion", "targetWeeklyHours", "unchangedTermsConfirmed"].sort());
  assert.equal("draft" in body.format.properties, false);
  assert.equal("tools" in body, false);
});

test("P9 adapter snapshots input and rejects disabled, manifest mismatch, abort and malformed envelopes without retry", async () => {
  let calls = 0;
  const transport: OllamaResearchTransport = async () => { calls += 1; return { status: 200, body: "{}" }; };
  await assert.rejects(new OllamaWorkingTimeWorkflowAdapter(transport, { ...config, enabled: false }).plan({ requestText: "x", authorizedPeople: [] }));
  await assert.rejects(new OllamaWorkingTimeWorkflowAdapter(transport, { ...config, verifiedManifestSha256: "wrong" }).plan({ requestText: "x", authorizedPeople: [] }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(new OllamaWorkingTimeWorkflowAdapter(transport, config).plan({ requestText: "x", authorizedPeople: [] }, { signal: controller.signal }));
  assert.equal(calls, 0);
  await assert.rejects(new OllamaWorkingTimeWorkflowAdapter(transport, config).plan({ requestText: "x", authorizedPeople: [] }));
  assert.equal(calls, 1);
});
