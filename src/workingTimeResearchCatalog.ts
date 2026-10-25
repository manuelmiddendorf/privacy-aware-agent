import { Buffer } from "node:buffer";
import { assertPrivacySafeResearchOutbound } from "./researchOutboundBoundary.js";

const CATALOG_KEYS = ["type", "jurisdiction", "topic", "goal"] as const;
const REQUIREMENTS_QUESTION = "Welche allgemeinen Anforderungen gelten bei einer Änderung der vertraglichen Wochenarbeitszeit in Deutschland?";
const REQUIREMENTS_INSTRUCTION = "Nutze ausschließlich die eingefrorene synthetische Referenz und antworte allgemein.";
const TEMPLATE_INSTRUCTION = "Erstelle ausschließlich die geschlossene synthetische Vorlage für eine Änderungsvereinbarung zur Wochenarbeitszeit. Verwende nur die vorgegebenen Abschnitte und Platzhalter; ergänze keine Nebenbedingungen, Quellen oder Einzelfalldaten.";

export const WORKING_TIME_TEMPLATE_PLACEHOLDERS = Object.freeze([
  "{{EMPLOYER_NAME}}", "{{EMPLOYEE_NAME}}", "{{CURRENT_WEEKLY_HOURS}}", "{{NEW_WEEKLY_HOURS}}", "{{EFFECTIVE_DATE}}",
] as const);

export const WORKING_TIME_TEMPLATE_SECTIONS = Object.freeze({
  heading: "Änderungsvereinbarung zur Wochenarbeitszeit",
  parties: "Zwischen {{EMPLOYER_NAME}} und {{EMPLOYEE_NAME}} wird folgende Änderung vereinbart:",
  change: "Die bisherige Wochenarbeitszeit von {{CURRENT_WEEKLY_HOURS}} Stunden wird mit Wirkung zum {{EFFECTIVE_DATE}} auf {{NEW_WEEKLY_HOURS}} Stunden geändert.",
  unchangedTerms: "Alle übrigen Vertragsbestimmungen bleiben unverändert.",
  signatures: "Ort, Datum und Unterschriften beider Parteien",
} as const);

export type WorkingTimeResearchGoal = "general_requirements" | "generic_amendment_template";
export interface WorkingTimeResearchIntent {
  readonly type: "employment_contract_change";
  readonly jurisdiction: "DE";
  readonly topic: "weekly_working_hours";
  readonly goal: WorkingTimeResearchGoal;
}

export interface WorkingTimeRequirementsMockPayload {
  readonly instruction: typeof REQUIREMENTS_INSTRUCTION;
  readonly question: typeof REQUIREMENTS_QUESTION;
  readonly parameters: { readonly language: "de"; readonly format: "plain_text"; readonly maxResponseBytes: 4096 };
}

export interface WorkingTimeTemplateMockPayload {
  readonly instruction: typeof TEMPLATE_INSTRUCTION;
  readonly templateRequest: {
    readonly documentType: "working_time_amendment_agreement";
    readonly jurisdiction: "DE";
    readonly language: "de";
    readonly goal: "generic_amendment_template";
    readonly sections: readonly ["heading", "parties", "change", "unchangedTerms", "signatures"];
    readonly placeholders: typeof WORKING_TIME_TEMPLATE_PLACEHOLDERS;
  };
  readonly parameters: { readonly format: "closed_json"; readonly maxResponseBytes: 4096 };
}

export type WorkingTimeMockPayload = WorkingTimeRequirementsMockPayload | WorkingTimeTemplateMockPayload;

export interface WorkingTimeTemplate {
  readonly schemaVersion: 1;
  readonly templateId: "SYNTHETIC_WORKING_TIME_AMENDMENT_V1";
  readonly sections: typeof WORKING_TIME_TEMPLATE_SECTIONS;
  readonly placeholders: typeof WORKING_TIME_TEMPLATE_PLACEHOLDERS;
  readonly provenance: { readonly provider: "LOCAL_FIXED" | "MOCK_OFFLINE"; readonly catalogVersion: 1; readonly goal: "generic_amendment_template" };
}

export interface WorkingTimeResearchMock {
  readonly name: "MOCK_OFFLINE";
  readonly callCount: number;
  generate(input: WorkingTimeMockPayload, options?: { signal?: AbortSignal }): Promise<unknown>;
}

function plainExact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.keys(descriptors).length === keys.length && keys.every((key) => key in descriptors) &&
    Object.values(descriptors).every((descriptor) => "value" in descriptor && descriptor.enumerable === true);
}

function exactArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

function exactSections(value: unknown): value is typeof WORKING_TIME_TEMPLATE_SECTIONS {
  return plainExact(value, ["heading", "parties", "change", "unchangedTerms", "signatures"]) &&
    Object.entries(WORKING_TIME_TEMPLATE_SECTIONS).every(([key, text]) => value[key] === text);
}

export function validateWorkingTimeResearchIntent(value: unknown, catalogVersion: unknown): WorkingTimeResearchIntent {
  if (catalogVersion !== 1 || !plainExact(value, CATALOG_KEYS) || value.type !== "employment_contract_change" ||
      value.jurisdiction !== "DE" || value.topic !== "weekly_working_hours" ||
      (value.goal !== "general_requirements" && value.goal !== "generic_amendment_template")) {
    throw new Error("unsupported working-time research catalog entry");
  }
  return Object.freeze({ type: "employment_contract_change", jurisdiction: "DE", topic: "weekly_working_hours", goal: value.goal });
}

export function renderWorkingTimeResearchQuestion(intent: WorkingTimeResearchIntent, catalogVersion: 1): typeof REQUIREMENTS_QUESTION {
  if (validateWorkingTimeResearchIntent(intent, catalogVersion).goal !== "general_requirements") throw new Error("catalog entry does not render a free-text question");
  return REQUIREMENTS_QUESTION;
}

export function createWorkingTimeMockPayload(intent: WorkingTimeResearchIntent, catalogVersion: 1, forbiddenLiterals: readonly string[] = []): WorkingTimeMockPayload {
  const validated = validateWorkingTimeResearchIntent(intent, catalogVersion);
  const payload: WorkingTimeMockPayload = validated.goal === "general_requirements"
    ? Object.freeze({ instruction: REQUIREMENTS_INSTRUCTION, question: REQUIREMENTS_QUESTION, parameters: Object.freeze({ language: "de", format: "plain_text", maxResponseBytes: 4096 }) })
    : Object.freeze({
      instruction: TEMPLATE_INSTRUCTION,
      templateRequest: Object.freeze({
        documentType: "working_time_amendment_agreement", jurisdiction: "DE", language: "de", goal: "generic_amendment_template",
        sections: Object.freeze(["heading", "parties", "change", "unchangedTerms", "signatures"] as const),
        placeholders: WORKING_TIME_TEMPLATE_PLACEHOLDERS,
      }),
      parameters: Object.freeze({ format: "closed_json", maxResponseBytes: 4096 }),
    });
  assertPrivacySafeResearchOutbound(payload, { maxBytes: 2048, forbiddenLiterals });
  return payload;
}

function createTemplate(provider: "LOCAL_FIXED" | "MOCK_OFFLINE"): WorkingTimeTemplate {
  return Object.freeze({
    schemaVersion: 1, templateId: "SYNTHETIC_WORKING_TIME_AMENDMENT_V1", sections: WORKING_TIME_TEMPLATE_SECTIONS,
    placeholders: WORKING_TIME_TEMPLATE_PLACEHOLDERS,
    provenance: Object.freeze({ provider, catalogVersion: 1, goal: "generic_amendment_template" }),
  });
}

export function createLocalWorkingTimeTemplate(): WorkingTimeTemplate { return createTemplate("LOCAL_FIXED"); }
export function createWorkingTimeTemplateMockAnswer(): WorkingTimeTemplate { return createTemplate("MOCK_OFFLINE"); }

export function validateWorkingTimeTemplateMockAnswer(value: unknown): WorkingTimeTemplate {
  if (!plainExact(value, ["schemaVersion", "templateId", "sections", "placeholders", "provenance"]) || value.schemaVersion !== 1 ||
      value.templateId !== "SYNTHETIC_WORKING_TIME_AMENDMENT_V1" || !exactSections(value.sections) ||
      !exactArray(value.placeholders, WORKING_TIME_TEMPLATE_PLACEHOLDERS) || !plainExact(value.provenance, ["provider", "catalogVersion", "goal"]) ||
      value.provenance.provider !== "MOCK_OFFLINE" || value.provenance.catalogVersion !== 1 || value.provenance.goal !== "generic_amendment_template") {
    throw new Error("invalid working-time template mock answer");
  }
  return createTemplate("MOCK_OFFLINE");
}

export function validateWorkingTimeMockAnswer(value: unknown): string {
  if (!plainExact(value, ["text"]) || typeof value.text !== "string" || value.text.length < 1 || Buffer.byteLength(value.text, "utf8") > 4096) {
    throw new Error("invalid working-time mock answer");
  }
  return value.text;
}

export { REQUIREMENTS_INSTRUCTION as WORKING_TIME_MOCK_INSTRUCTION, REQUIREMENTS_QUESTION as WORKING_TIME_RESEARCH_QUESTION, TEMPLATE_INSTRUCTION as WORKING_TIME_TEMPLATE_MOCK_INSTRUCTION };
