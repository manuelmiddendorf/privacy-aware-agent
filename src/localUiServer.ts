import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createExactSyntheticEvidenceAssessor } from "./demoEvidence.js";
import { DEMO_POLICY } from "./demoPolicy.js";
import { LocalSkillAuthority } from "./localSkillAuthority.js";
import { LocalSkillLane } from "./localSkillLane.js";
import { LocalSkillTestDouble } from "./localSkillModel.js";
import { createInlineSyntheticSource } from "./localSkillSources.js";
import type { LocalSkillCitation, TrustedLocalSkillPolicy } from "./localSkillTypes.js";
import { MockProvider } from "./mockProvider.js";
import { PrivacyAwareAgent } from "./orchestrator.js";
import type { AgentRequest, AgentResult, TaskKind } from "./types.js";
import { WorkingTimeContractWorkflow, WorkingTimeWorkflowAuthority, type WorkingTimeWorkflowModel } from "./workingTimeContractWorkflow.js";
import { createWorkingTimeTemplateMockAnswer, type WorkingTimeResearchMock } from "./workingTimeResearchCatalog.js";

export const LOCAL_UI_HOST = "127.0.0.1";
export const LOCAL_UI_PORT = 4317;
export const LOCAL_UI_ORIGIN = `http://${LOCAL_UI_HOST}:${LOCAL_UI_PORT}`;
const MAX_BODY_BYTES = 12_288;
const MAX_LOCAL_SKILL_BODY_BYTES = 40_960;
const REQUEST_TIMEOUT_MS = 5_000;
const LOCAL_SKILL_TIMEOUT_MS = 20_000;
const WORKING_TIME_TIMEOUT_MS = 20_000;
const ALLOWED_SOURCES = new Set(["help-hours", "help-reset", "meeting-preparation"]);

const APPROVED_TEMPLATES = Object.freeze({
  "demo-a": Object.freeze({
    task: "ask",
    text: "List only the approved preparation steps for the synthetic board meeting.",
    sourceIds: Object.freeze(["meeting-preparation"]),
  }),
  p01: Object.freeze({
    task: "ask",
    text: "Which preparation step comes after creating the agenda, and what is the final step? Answer only from the approved page.",
    sourceIds: Object.freeze(["meeting-preparation"]),
  }),
} satisfies Record<string, AgentRequest>);

type TemplateId = keyof typeof APPROVED_TEMPLATES;
type UiCommand = { templateId: TemplateId } | AgentRequest;

export interface UiResponse {
  ok: boolean;
  message: string;
  citations: readonly string[];
  provider?: "MOCK_OFFLINE";
}

export type OfflineUiRunner = (command: UiCommand, signal: AbortSignal) => Promise<UiResponse>;

export interface LocalSkillUiCommand {
  readonly requestNonce: string;
  readonly text: string;
  readonly attachments: readonly { readonly title: string; readonly text: string }[];
}

export interface LocalSkillUiResponse {
  readonly ok: boolean;
  readonly requestNonce: string;
  readonly message: string;
  readonly citations: readonly LocalSkillCitation[];
  readonly sourceTitles: readonly string[];
  readonly provider?: string;
  readonly skillIds?: readonly ("DOCUMENT_UNDERSTANDING" | "TEXT_COMPOSITION")[];
  readonly parts?: readonly {
    readonly skillId: "DOCUMENT_UNDERSTANDING" | "TEXT_COMPOSITION";
    readonly resultKind: "answer" | "draft";
    readonly text: string;
  }[];
}

export type LocalSkillUiRunner = (command: LocalSkillUiCommand, signal: AbortSignal) => Promise<LocalSkillUiResponse>;

type WorkingTimeUiIntent = {
  readonly personId: "person-lina" | null;
  readonly targetWeeklyHours: number | null;
  readonly effectiveDate: string | null;
  readonly researchRequested: boolean | null;
  readonly templateRequested: boolean | null;
};

export interface WorkingTimeUiCommand {
  readonly requestNonce: string;
  readonly revision: number;
  readonly text: string;
  readonly intent: WorkingTimeUiIntent;
  readonly confirmation: null | (WorkingTimeUiIntent & { readonly revision: number; readonly text: string });
}

export type WorkingTimeUiResponse =
  | { readonly ok: true; readonly requestNonce: string; readonly revision: number; readonly kind: "clarification"; readonly questions: readonly string[]; readonly proposedIntent: WorkingTimeUiIntent & { readonly personLabel: string | null }; readonly provider: string }
  | { readonly ok: true; readonly requestNonce: string; readonly revision: number; readonly kind: "draft"; readonly draft: string; readonly citations: readonly string[]; readonly gaps: readonly string[]; readonly reviewNotes: readonly string[]; readonly researchUsed: boolean; readonly researchLabel: string | null; readonly templateUsed: boolean; readonly templateLabel: string; readonly provider: string }
  | { readonly ok: false; readonly requestNonce: string; readonly revision: number; readonly kind: "error"; readonly message: string };

export type WorkingTimeUiRunner = (command: WorkingTimeUiCommand, signal: AbortSignal) => Promise<WorkingTimeUiResponse>;

const LOCAL_SKILL_POLICY: TrustedLocalSkillPolicy = Object.freeze({
  schemaVersion: 1,
  policyId: "p7-local-synthetic-ui-v1",
  organizationId: "p7-local-synthetic-org",
  principalId: "p7-local-synthetic-user",
  sessionId: "p7-local-ui-session",
  authorizationVersion: 1,
  purpose: "SYNTHETIC_LOCAL_EDITORIAL",
  contentScope: "SYNTHETIC_DEMO_ONLY",
  executableSkillIds: Object.freeze(["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"] as const),
  readableSourceIds: Object.freeze([]),
  allowInlineSyntheticAttachments: true,
  allowSensitiveSyntheticExamples: true,
  actions: false,
  persistence: false,
  limits: Object.freeze({
    maxRequestBytes: 8_192,
    maxSourceCount: 4,
    maxSourceTitleBytes: 128,
    maxSourceBytes: 12_288,
    maxAggregateSourceBytes: 24_576,
    maxParagraphCount: 64,
    maxParagraphBytes: 4_096,
    maxProposalBytes: 2_048,
    maxOutputBytes: 8_192,
    maxModelContextBytes: 12_288,
    maxModelOutputTokens: 768,
  }),
});

const localSkillAuthority = new LocalSkillAuthority(LOCAL_SKILL_POLICY);
const localSkillModel = new LocalSkillTestDouble();
const localSkillLane = new LocalSkillLane(localSkillAuthority, localSkillModel);

const STATIC_FILES = Object.freeze({
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8" },
} as const);

function neutralMessage(result: AgentResult): string {
  if (result.ok) return result.output.text;
  if (result.reasonCode === "BLOCK_EVIDENCE_REQUIRED") return "This question needs an approved synthetic source.";
  if (result.reasonCode === "BLOCK_EVIDENCE_INSUFFICIENT") {
    return "The selected synthetic source is not confirmed for this request.";
  }
  if (["BLOCK_HEALTH_DATA", "BLOCK_CHILD_DATA", "BLOCK_SENSITIVE_PERSONNEL", "BLOCK_CREDENTIAL",
    "BLOCK_FINANCIAL_IDENTIFIER", "BLOCK_DIRECT_PERSON_NAME", "BLOCK_UNCERTAIN_CONTEXT",
    "BLOCK_FINAL_CONTEXT_NOT_SAFE"].includes(result.reasonCode)) {
    return "This request was blocked by the local privacy gate. Please use only general synthetic information.";
  }
  return "This request could not be processed safely.";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function parseCommand(value: unknown): UiCommand | undefined {
  if (!isPlainObject(value)) return undefined;
  if (exactKeys(value, ["templateId"])) {
    return value.templateId === "demo-a" || value.templateId === "p01"
      ? { templateId: value.templateId }
      : undefined;
  }
  if (!exactKeys(value, ["sourceIds", "task", "text"])) return undefined;
  if (!(["ask", "draft", "summarize"] as unknown[]).includes(value.task) ||
      typeof value.text !== "string" || value.text.length === 0 ||
      Buffer.byteLength(value.text, "utf8") > DEMO_POLICY.maxInputBytes ||
      !Array.isArray(value.sourceIds) || value.sourceIds.length > ALLOWED_SOURCES.size ||
      value.sourceIds.some((id) => typeof id !== "string" || !ALLOWED_SOURCES.has(id)) ||
      new Set(value.sourceIds).size !== value.sourceIds.length) {
    return undefined;
  }
  return { task: value.task as TaskKind, text: value.text, sourceIds: [...value.sourceIds] as string[] };
}

function parseLocalSkillCommand(value: unknown): LocalSkillUiCommand | undefined {
  if (!isPlainObject(value) || !exactKeys(value, ["attachments", "requestNonce", "text"]) ||
      typeof value.requestNonce !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(value.requestNonce) ||
      typeof value.text !== "string" || value.text.trim().length === 0 || Buffer.byteLength(value.text, "utf8") > 8_192 ||
      !Array.isArray(value.attachments) || value.attachments.length > 4) return undefined;
  const attachments: { title: string; text: string }[] = [];
  let aggregateBytes = 0;
  for (const attachment of value.attachments) {
    if (!isPlainObject(attachment) || !exactKeys(attachment, ["text", "title"]) ||
        typeof attachment.title !== "string" || attachment.title.trim().length === 0 ||
        Buffer.byteLength(attachment.title, "utf8") > 128 || typeof attachment.text !== "string" ||
        attachment.text.trim().length === 0 || Buffer.byteLength(attachment.text, "utf8") > 12_288) return undefined;
    aggregateBytes += Buffer.byteLength(attachment.text, "utf8");
    if (aggregateBytes > 24_576) return undefined;
    attachments.push({ title: attachment.title, text: attachment.text });
  }
  return { requestNonce: value.requestNonce, text: value.text, attachments };
}

function parseWorkingTimeIntent(value: unknown): WorkingTimeUiIntent | undefined {
  if (!isPlainObject(value) || !exactKeys(value, ["effectiveDate", "personId", "researchRequested", "targetWeeklyHours", "templateRequested"]) ||
      (value.personId !== null && value.personId !== "person-lina") ||
      (value.targetWeeklyHours !== null && (typeof value.targetWeeklyHours !== "number" || !Number.isFinite(value.targetWeeklyHours) || value.targetWeeklyHours <= 0 || value.targetWeeklyHours > 168)) ||
      (value.effectiveDate !== null && (typeof value.effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.effectiveDate))) ||
      (value.researchRequested !== null && typeof value.researchRequested !== "boolean") ||
      (value.templateRequested !== null && typeof value.templateRequested !== "boolean")) return undefined;
  return { personId: value.personId as WorkingTimeUiIntent["personId"], targetWeeklyHours: value.targetWeeklyHours as number | null, effectiveDate: value.effectiveDate as string | null, researchRequested: value.researchRequested as boolean | null, templateRequested: value.templateRequested as boolean | null };
}

function parseWorkingTimeCommand(value: unknown): WorkingTimeUiCommand | undefined {
  if (!isPlainObject(value) || !exactKeys(value, ["confirmation", "intent", "requestNonce", "revision", "text"]) ||
      typeof value.requestNonce !== "string" || !/^p8_[A-Za-z0-9_]{8,124}$/.test(value.requestNonce) ||
      !Number.isInteger(value.revision) || (value.revision as number) < 1 || (value.revision as number) > 1_000_000_000 ||
      typeof value.text !== "string" || value.text.trim().length === 0 || Buffer.byteLength(value.text, "utf8") > 8_192) return undefined;
  const intent = parseWorkingTimeIntent(value.intent);
  if (!intent) return undefined;
  if (value.confirmation === null) {
    if (Object.values(intent).some((item) => item !== null)) return undefined;
    return { requestNonce: value.requestNonce, revision: value.revision as number, text: value.text, intent, confirmation: null };
  }
  if (!isPlainObject(value.confirmation) || !exactKeys(value.confirmation, ["effectiveDate", "personId", "researchRequested", "revision", "targetWeeklyHours", "templateRequested", "text"])) return undefined;
  const confirmationIntent = parseWorkingTimeIntent({ personId: value.confirmation.personId, targetWeeklyHours: value.confirmation.targetWeeklyHours, effectiveDate: value.confirmation.effectiveDate, researchRequested: value.confirmation.researchRequested, templateRequested: value.confirmation.templateRequested });
  if (!confirmationIntent || Object.values(confirmationIntent).some((item) => item === null) || value.confirmation.revision !== value.revision || value.confirmation.text !== value.text ||
      JSON.stringify(confirmationIntent) !== JSON.stringify(intent)) return undefined;
  return { requestNonce: value.requestNonce, revision: value.revision as number, text: value.text, intent, confirmation: { ...confirmationIntent, revision: value.revision as number, text: value.text } };
}

export const runOfflineUiCommand: OfflineUiRunner = async (command, signal) => {
  const request = "templateId" in command ? APPROVED_TEMPLATES[command.templateId] : command;
  const evidence = "templateId" in command ? createExactSyntheticEvidenceAssessor(request) : undefined;
  const result = await new PrivacyAwareAgent(new MockProvider(), undefined, evidence)
    .run(DEMO_POLICY, request, { signal });
  return result.ok
    ? { ok: true, message: neutralMessage(result), citations: result.output.citations, provider: "MOCK_OFFLINE" }
    : { ok: false, message: neutralMessage(result), citations: [] };
};

export const runLocalSkillUiCommand: LocalSkillUiRunner = async (command, signal) => {
  const sources = command.attachments.map((attachment, index) => createInlineSyntheticSource({
    id: `inline-${index + 1}`,
    organizationId: LOCAL_SKILL_POLICY.organizationId,
    title: attachment.title,
  }, attachment.text));
  const result = await localSkillLane.run({
    schemaVersion: 1,
    requestNonce: command.requestNonce,
    text: command.text,
    sources,
  }, { signal });
  return result.ok ? {
    ok: true,
    requestNonce: result.requestNonce,
    message: result.parts.map((part) => part.text).join("\n\n"),
    citations: result.parts.flatMap((part) => part.citations),
    sourceTitles: result.sourceTitles,
    provider: result.provider,
    skillIds: result.skillIds,
    parts: result.parts.map((part) => ({ skillId: part.skillId, resultKind: part.resultKind, text: part.text })),
  } : {
    ok: false,
    requestNonce: result.requestNonce,
    message: result.message,
    citations: [],
    sourceTitles: [],
  };
};

export function createWorkingTimeUiRunner(model: WorkingTimeWorkflowModel): WorkingTimeUiRunner {
  return async (command, signal) => {
    const source = {
      id: "contract-lina", organizationId: "OrgWF-A", personId: "person-lina",
      readFields(fields: readonly ("display_name" | "current_weekly_hours" | "contract_paragraphs" | "unchanged_terms")[]) {
        const values = {
          display_name: "Lina Mustervertrag",
          current_weekly_hours: 20,
          contract_paragraphs: [{ id: "contract-lina:p01", text: "Bisherige vertragliche Arbeitszeit 20 Stunden je Woche" }, { id: "contract-lina:p02", text: "Andere Vertragsbestimmungen bleiben unverändert" }],
          unchanged_terms: "Andere Vertragsbestimmungen bleiben unverändert",
        } as const;
        return Object.fromEntries(fields.map((field) => [field, values[field]]));
      },
    };
    const authority = new WorkingTimeWorkflowAuthority({
      organizationId: "OrgWF-A", actorId: "ActorWF-A", sessionId: "SessionWF-UI", taskIds: ["TaskWF-UI"], sourceIds: [source.id],
      people: [{ personId: "person-lina", displayLabel: "Lina Mustervertrag" }], fieldIds: ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"],
      allowGeneralResearch: true, allowGeneralTemplate: true, researchCatalogVersion: 1,
    }, [source]);
    let mockCalls = 0;
    const researchMock: WorkingTimeResearchMock = {
      name: "MOCK_OFFLINE",
      get callCount() { return mockCalls; },
      async generate(input) { mockCalls += 1; return "templateRequest" in input ? createWorkingTimeTemplateMockAnswer() : { text: "Eingefrorene synthetische allgemeine Referenz. Keine aktuelle Rechtsrecherche oder Einzelfallberatung." }; },
    };
    const workflow = new WorkingTimeContractWorkflow(authority, model, researchMock);
    const confirmedIntent = command.confirmation === null
      ? { personId: null, targetWeeklyHours: null, effectiveDate: null, researchRequested: null, templateRequested: null }
      : command.intent;
    const result = await workflow.run({
      schemaVersion: 1, organizationId: "OrgWF-A", actorId: "ActorWF-A", sessionId: "SessionWF-UI", taskId: "TaskWF-UI", sourceId: source.id,
      purpose: "SYNTHETIC_WORKING_TIME_CONTRACT_DRAFT", text: command.text, confirmedIntent,
    }, { signal });
    if (!result.ok) return { ok: false, requestNonce: command.requestNonce, revision: command.revision, kind: "error", message: "Der lokale Entwurf konnte nicht sicher erstellt werden. Deine Eingaben bleiben erhalten." };
    if (result.kind === "clarification") return {
      ok: true, requestNonce: command.requestNonce, revision: command.revision, kind: "clarification", questions: result.questions,
      proposedIntent: {
        personId: result.proposedIntent.personId === "person-lina" ? "person-lina" : null,
        targetWeeklyHours: result.proposedIntent.targetWeeklyHours,
        effectiveDate: result.proposedIntent.effectiveDate,
        researchRequested: result.proposedIntent.researchRequested,
        templateRequested: result.proposedIntent.templateRequested,
        personLabel: result.proposedIntent.personId === "person-lina" ? "Lina Mustervertrag" : null,
      },
      provider: model.name,
    };
    return {
      ok: true, requestNonce: command.requestNonce, revision: command.revision, kind: "draft", draft: result.draft, citations: result.citations,
      gaps: result.gaps, reviewNotes: result.reviewNotes, researchUsed: result.researchUsed,
      researchLabel: result.researchUsed ? "Synthetische MOCK-Referenz – keine aktuelle Rechtsrecherche" : null, provider: model.name,
      templateUsed: result.templateUsed,
      templateLabel: result.templateUsed ? "Synthetische MOCK-Vorlage – keine aktuelle Rechtsvorlage" : "Lokale feste Vorlage",
    };
  };
}

const unavailableWorkingTimeRunner: WorkingTimeUiRunner = async (command) => ({
  ok: false, requestNonce: command.requestNonce, revision: command.revision, kind: "error",
  message: "Der lokale Modellpilot ist noch nicht für UI-Aufrufe freigegeben. Deine Eingaben bleiben erhalten.",
});

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  applySecurityHeaders(response);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

async function readJson(request: IncomingMessage, maxBodyBytes = MAX_BODY_BYTES): Promise<unknown> {
  const declared = request.headers["content-length"];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > maxBodyBytes)) {
    throw new Error("too_large");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("too_large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid_json");
  }
}

export function createLocalUiRequestHandler(
  runner: OfflineUiRunner = runOfflineUiCommand,
  skillRunner: LocalSkillUiRunner = runLocalSkillUiCommand,
  workingTimeRunner: WorkingTimeUiRunner = unavailableWorkingTimeRunner,
) {
  let busy = false;
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applySecurityHeaders(response);
    const remoteAddress = request.socket.remoteAddress;
    const expectedHost = `${LOCAL_UI_HOST}:${request.socket.localPort ?? LOCAL_UI_PORT}`;
    if (request.headers.host !== expectedHost ||
        (remoteAddress !== LOCAL_UI_HOST && remoteAddress !== `::ffff:${LOCAL_UI_HOST}`)) {
      sendJson(response, 403, { error: "Local access only." });
      return;
    }

    const url = request.url?.split("?", 1)[0] ?? "";
    if (url === "/api/working-time/run") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }
      if (request.headers.origin !== `http://${expectedHost}` || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "")) {
        sendJson(response, 403, { error: "Same-origin JSON requests only." });
        return;
      }
      if (busy) {
        sendJson(response, 429, { error: "The local demo is busy. Please try again." });
        return;
      }
      let command: WorkingTimeUiCommand | undefined;
      try { command = parseWorkingTimeCommand(await readJson(request, MAX_LOCAL_SKILL_BODY_BYTES)); }
      catch (error) {
        sendJson(response, error instanceof Error && error.message === "too_large" ? 413 : 400, { error: "The working-time request could not be read." });
        return;
      }
      if (!command) {
        sendJson(response, 400, { error: "The working-time request format is not supported." });
        return;
      }
      if (busy) {
        sendJson(response, 429, { error: "The local demo is busy. Please try again." });
        return;
      }
      busy = true;
      const controller = new AbortController();
      const abort = () => controller.abort();
      const abortOnDisconnect = () => {
        if (!response.writableEnded) controller.abort();
      };
      request.once("aborted", abort);
      response.once("close", abortOnDisconnect);
      const timer = setTimeout(() => controller.abort(), WORKING_TIME_TIMEOUT_MS);
      try {
        const result = await workingTimeRunner(command, controller.signal);
        if (!controller.signal.aborted && !response.destroyed) sendJson(response, 200, result);
      } catch {
        if (!controller.signal.aborted && !response.destroyed) {
          sendJson(response, 500, { error: "The working-time request could not be completed." });
        }
      } finally {
        clearTimeout(timer);
        request.removeListener("aborted", abort);
        response.removeListener("close", abortOnDisconnect);
        busy = false;
      }
      return;
    }

    if (url === "/api/local-skills/run") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }
      if (request.headers.origin !== `http://${expectedHost}` ||
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "")) {
        sendJson(response, 403, { error: "Same-origin JSON requests only." });
        return;
      }
      if (busy) {
        sendJson(response, 429, { error: "The local demo is busy. Please try again." });
        return;
      }
      let command: LocalSkillUiCommand | undefined;
      try {
        command = parseLocalSkillCommand(await readJson(request, MAX_LOCAL_SKILL_BODY_BYTES));
      } catch (error) {
        sendJson(response, error instanceof Error && error.message === "too_large" ? 413 : 400,
          { error: "The local skill request could not be read." });
        return;
      }
      if (!command) {
        sendJson(response, 400, { error: "The local skill request format is not supported." });
        return;
      }
      if (busy) {
        sendJson(response, 429, { error: "The local demo is busy. Please try again." });
        return;
      }
      busy = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOCAL_SKILL_TIMEOUT_MS);
      try {
        sendJson(response, 200, await skillRunner(command, controller.signal));
      } catch {
        sendJson(response, 500, { error: "The local skill request could not be completed." });
      } finally {
        clearTimeout(timer);
        busy = false;
      }
      return;
    }

    if (url === "/api/run") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }
      if (request.headers.origin !== `http://${expectedHost}` ||
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "")) {
        sendJson(response, 403, { error: "Same-origin JSON requests only." });
        return;
      }
      if (busy) {
        sendJson(response, 429, { error: "The local demo is busy. Please try again." });
        return;
      }
      let command: UiCommand | undefined;
      try {
        command = parseCommand(await readJson(request));
      } catch (error) {
        sendJson(response, error instanceof Error && error.message === "too_large" ? 413 : 400,
          { error: "The request could not be read." });
        return;
      }
      if (!command) {
        sendJson(response, 400, { error: "The request format is not supported." });
        return;
      }

      // Another request may have acquired the single runner while this body was
      // still arriving. Re-check and acquire without an await between them.
      if (busy) {
        sendJson(response, 429, { error: "The local demo is busy. Please try again." });
        return;
      }
      busy = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        sendJson(response, 200, await runner(command, controller.signal));
      } catch {
        sendJson(response, 500, { error: "The local offline request could not be completed." });
      } finally {
        clearTimeout(timer);
        busy = false;
      }
      return;
    }

    const asset = STATIC_FILES[url as keyof typeof STATIC_FILES];
    if (!asset) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    const body = await readFile(new URL(`../../ui/${asset.file}`, import.meta.url));
    response.statusCode = 200;
    response.setHeader("Content-Type", asset.contentType);
    response.setHeader("Content-Length", body.length);
    response.end(request.method === "HEAD" ? undefined : body);
  };
}

export function createLocalUiServer(
  runner: OfflineUiRunner = runOfflineUiCommand,
  skillRunner: LocalSkillUiRunner = runLocalSkillUiCommand,
  workingTimeRunner: WorkingTimeUiRunner = unavailableWorkingTimeRunner,
): Server {
  const handler = createLocalUiRequestHandler(runner, skillRunner, workingTimeRunner);
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent) sendJson(response, 500, { error: "The local server could not complete the request." });
      else response.end();
    });
  });
  server.headersTimeout = 5_000;
  server.requestTimeout = 6_000;
  server.keepAliveTimeout = 2_000;
  server.maxRequestsPerSocket = 100;
  return server;
}

export function startLocalUiServer(): Server {
  const server = createLocalUiServer();
  server.listen(LOCAL_UI_PORT, LOCAL_UI_HOST, () => {
    console.log(`PAA local offline UI: ${LOCAL_UI_ORIGIN}`);
    console.log("Press Ctrl+C to stop. Live provider access is not enabled.");
  });
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return server;
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryPath) startLocalUiServer();
