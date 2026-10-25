import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkingTimeMockPayload,
  createWorkingTimeTemplateMockAnswer,
  validateWorkingTimeResearchIntent,
  validateWorkingTimeTemplateMockAnswer,
  WORKING_TIME_MOCK_INSTRUCTION,
  WORKING_TIME_RESEARCH_QUESTION,
  WORKING_TIME_TEMPLATE_MOCK_INSTRUCTION,
  WORKING_TIME_TEMPLATE_PLACEHOLDERS,
  WORKING_TIME_TEMPLATE_SECTIONS,
} from "../src/workingTimeResearchCatalog.js";

const intent = (goal: "general_requirements" | "generic_amendment_template") => ({
  type: "employment_contract_change", jurisdiction: "DE", topic: "weekly_working_hours", goal,
} as const);

test("P9 keeps the pre-existing general-requirements catalog entry separate and exact", () => {
  const payload = createWorkingTimeMockPayload(validateWorkingTimeResearchIntent(intent("general_requirements"), 1), 1);
  assert.deepEqual(payload, {
    instruction: WORKING_TIME_MOCK_INSTRUCTION,
    question: WORKING_TIME_RESEARCH_QUESTION,
    parameters: { language: "de", format: "plain_text", maxResponseBytes: 4096 },
  });
});

test("P9 generic template request is fixed, context-free and contains no case values", () => {
  const forbidden = ["Lina", "20", "25", "2031-09-01", "OrgWF-A", "contract-lina", "private history"];
  const payload = createWorkingTimeMockPayload(intent("generic_amendment_template"), 1, forbidden);
  assert.deepEqual(payload, {
    instruction: WORKING_TIME_TEMPLATE_MOCK_INSTRUCTION,
    templateRequest: {
      documentType: "working_time_amendment_agreement", jurisdiction: "DE", language: "de", goal: "generic_amendment_template",
      sections: ["heading", "parties", "change", "unchangedTerms", "signatures"],
      placeholders: WORKING_TIME_TEMPLATE_PLACEHOLDERS,
    },
    parameters: { format: "closed_json", maxResponseBytes: 4096 },
  });
  const serialized = JSON.stringify(payload);
  for (const value of forbidden) assert.equal(serialized.includes(value), false);
});

test("P9 accepts only the exact synthetic template answer and provenance", () => {
  const exact = createWorkingTimeTemplateMockAnswer();
  assert.deepEqual(validateWorkingTimeTemplateMockAnswer(exact), exact);
  for (const mutate of [
    (value: any) => { value.extraClause = "Nebenabrede"; },
    (value: any) => { value.sections.change += " Zahlung 999 EUR."; },
    (value: any) => { value.placeholders[0] = "{{UNKNOWN}}"; },
    (value: any) => { value.provenance.provider = "FOREIGN"; },
    (value: any) => { value.sections.signatures = "<tool>send</tool>"; },
  ]) {
    const candidate = JSON.parse(JSON.stringify(exact));
    mutate(candidate);
    assert.throws(() => validateWorkingTimeTemplateMockAnswer(candidate));
  }
  assert.deepEqual(exact.sections, WORKING_TIME_TEMPLATE_SECTIONS);
});

test("catalog shapes are closed and validated snapshots do not follow later mutation", () => {
  const invalid = [
    { ...intent("general_requirements"), person: "Lina" },
    { ...intent("general_requirements"), jurisdiction: "AT" },
    { ...intent("general_requirements"), goal: "individual_advice" },
    { ...intent("generic_amendment_template"), topic: "salary" },
  ];
  for (const candidate of invalid) assert.throws(() => validateWorkingTimeResearchIntent(candidate, 1));
  const mutable: Record<string, unknown> = { ...intent("generic_amendment_template") };
  const snapshot = validateWorkingTimeResearchIntent(mutable, 1);
  mutable.goal = "individual_advice";
  assert.deepEqual((createWorkingTimeMockPayload(snapshot, 1) as any).templateRequest.placeholders, WORKING_TIME_TEMPLATE_PLACEHOLDERS);
  assert.throws(() => validateWorkingTimeResearchIntent(mutable, 1));
  assert.throws(() => validateWorkingTimeResearchIntent(intent("general_requirements"), 2));
});
