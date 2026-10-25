import { Buffer } from "node:buffer";
import { isExecutableLocalSkillId, supportsLocalSkillCombinationList } from "./localSkillCatalog.js";
import { LocalSkillAuthority } from "./localSkillAuthority.js";
import { isTrustedLocalSkillSource, snapshotAuthorizedLocalSkillSources } from "./localSkillSources.js";
import type {
  ExecutableLocalSkillId,
  LocalSkillCitation,
  LocalSkillGenerationInput,
  LocalSkillModel,
  LocalSkillRequest,
  LocalSkillResult,
  LocalSkillResultPart,
  LocalSkillStopped,
} from "./localSkillTypes.js";

const REQUEST_KEYS = ["schemaVersion", "requestNonce", "text", "sources"] as const;
const PROPOSAL_KEYS = ["schemaVersion", "route"] as const;
const GENERATION_KEYS = ["schemaVersion", "parts"] as const;
const PART_KEYS = ["skillId", "kind", "text", "citationParagraphIds"] as const;
const FIXED_PROMPT_OVERHEAD_BYTES = 4_096;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function validUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function validRequest(value: unknown, authority: LocalSkillAuthority): value is LocalSkillRequest {
  return plainRecord(value) && exactKeys(value, REQUEST_KEYS) && value.schemaVersion === 1 &&
    typeof value.requestNonce === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value.requestNonce) &&
    typeof value.text === "string" && value.text.trim().length > 0 && validUnicode(value.text) && !value.text.includes("\u0000") &&
    Buffer.byteLength(value.text, "utf8") <= authority.policy.limits.maxRequestBytes && Array.isArray(value.sources) &&
    value.sources.every(isTrustedLocalSkillSource);
}

function contextFits(value: unknown, maxBytes: number): boolean {
  return Buffer.byteLength(JSON.stringify(value), "utf8") + FIXED_PROMPT_OVERHEAD_BYTES <= maxBytes;
}

type Proposal = {
  schemaVersion: 1;
  route: "UNDERSTAND_DOCUMENTS" | "COMPOSE_TEXT" | "UNDERSTAND_THEN_COMPOSE" | "CLARIFY" | "UNSUPPORTED";
};

function parseProposal(value: unknown, maxBytes: number): Proposal | undefined {
  return plainRecord(value) && exactKeys(value, PROPOSAL_KEYS) && value.schemaVersion === 1 &&
    Buffer.byteLength(JSON.stringify(value), "utf8") <= maxBytes &&
    ["UNDERSTAND_DOCUMENTS", "COMPOSE_TEXT", "UNDERSTAND_THEN_COMPOSE", "CLARIFY", "UNSUPPORTED"].includes(value.route as string)
    ? value as Proposal
    : undefined;
}

function skillsForRoute(route: Proposal["route"]): readonly ExecutableLocalSkillId[] {
  if (route === "UNDERSTAND_DOCUMENTS") return ["DOCUMENT_UNDERSTANDING"];
  if (route === "COMPOSE_TEXT") return ["TEXT_COMPOSITION"];
  if (route === "UNDERSTAND_THEN_COMPOSE") return ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"];
  return [];
}

function stopped(requestNonce: string, reasonCode: LocalSkillStopped["reasonCode"], message: string): LocalSkillResult {
  return { ok: false, requestNonce, reasonCode, message };
}

export class LocalSkillLane {
  constructor(readonly authority: LocalSkillAuthority, readonly model: LocalSkillModel) {}

  async run(requestValue: unknown, options: { signal?: AbortSignal } = {}): Promise<LocalSkillResult> {
    const fallbackNonce = plainRecord(requestValue) && typeof requestValue.requestNonce === "string" ? requestValue.requestNonce : "invalid-request";
    if (!validRequest(requestValue, this.authority)) {
      return stopped(fallbackNonce, "LOCAL_SKILL_REQUEST_INVALID", "Die lokale Anfrage ist ungültig oder zu groß.");
    }
    if (options.signal?.aborted) {
      return stopped(requestValue.requestNonce, "LOCAL_SKILL_CANCELLED", "Der lokale Lauf wurde abgebrochen.");
    }
    const request: LocalSkillRequest = {
      schemaVersion: 1,
      requestNonce: requestValue.requestNonce,
      text: requestValue.text,
      sources: Object.freeze([...requestValue.sources]),
    };
    let token;
    try {
      token = this.authority.begin(request);
    } catch {
      return stopped(request.requestNonce, "LOCAL_SKILL_SOURCE_DENIED", "Mindestens eine ausgewählte Quelle ist nicht freigegeben.");
    }
    let documents;
    try {
      documents = snapshotAuthorizedLocalSkillSources(request.sources, this.authority.policy.limits);
    } catch (error) {
      return stopped(request.requestNonce,
        error instanceof Error && error.message === "source too large" ? "LOCAL_SKILL_INPUT_TOO_LARGE" : "LOCAL_SKILL_SOURCE_INVALID",
        "Mindestens ein ausgewählter Text ist ungültig oder überschreitet die lokale Grenze.");
    }
    if (!this.authority.isCurrent(token)) {
      return stopped(request.requestNonce, "LOCAL_SKILL_STALE_GENERATION", "Die Berechtigung hat sich geändert. Bitte erneut starten.");
    }
    if (options.signal?.aborted) return stopped(request.requestNonce, "LOCAL_SKILL_CANCELLED", "Der lokale Lauf wurde abgebrochen.");
    const proposalInput = Object.freeze({
      requestText: request.text,
      documents,
      executableSkillIds: Object.freeze([...this.authority.policy.executableSkillIds]),
    });
    if (!contextFits(proposalInput, this.authority.policy.limits.maxModelContextBytes)) {
      return stopped(request.requestNonce, "LOCAL_SKILL_CONTEXT_TOO_LARGE", "Die ausgewählten Texte sind für einen lokalen Lauf zu groß. Die Eingabe bleibt erhalten.");
    }
    if (options.signal?.aborted || !this.authority.isCurrent(token)) {
      return stopped(request.requestNonce, options.signal?.aborted ? "LOCAL_SKILL_CANCELLED" : "LOCAL_SKILL_STALE_GENERATION",
        options.signal?.aborted ? "Der lokale Lauf wurde abgebrochen." : "Die Berechtigung hat sich geändert. Bitte erneut starten.");
    }
    let rawProposal: unknown;
    try {
      rawProposal = await this.model.propose(proposalInput, options);
    } catch {
      return stopped(request.requestNonce, "LOCAL_SKILL_MODEL_ERROR", "Der lokale Testlauf konnte nicht abgeschlossen werden.");
    }
    if (options.signal?.aborted) return stopped(request.requestNonce, "LOCAL_SKILL_CANCELLED", "Der lokale Lauf wurde abgebrochen.");
    if (!this.authority.isCurrent(token)) {
      return stopped(request.requestNonce, "LOCAL_SKILL_STALE_GENERATION", "Die Berechtigung hat sich geändert. Bitte erneut starten.");
    }
    const proposal = parseProposal(rawProposal, this.authority.policy.limits.maxProposalBytes);
    if (!proposal) return stopped(request.requestNonce, "LOCAL_SKILL_MODEL_SCHEMA", "Der lokale Vorschlag hatte ein ungültiges Format.");
    if (proposal.route === "CLARIFY") {
      return stopped(request.requestNonce, "LOCAL_SKILL_CLARIFICATION_REQUIRED", "Möchtest du ausgewählte Texte verstehen oder einen Textentwurf formulieren?");
    }
    if (proposal.route === "UNSUPPORTED") {
      return stopped(request.requestNonce, "LOCAL_SKILL_UNSUPPORTED", "Diese Aufgabe wird im lokalen Experiment noch nicht unterstützt.");
    }
    const proposedSkills = skillsForRoute(proposal.route);
    if (!proposedSkills.every(isExecutableLocalSkillId) ||
        !proposedSkills.every((skillId) => this.authority.policy.executableSkillIds.includes(skillId))) {
      return stopped(request.requestNonce, "LOCAL_SKILL_CLARIFICATION_REQUIRED", "Dieser Skill ist erst geplant. Bitte frage nach Dokumentverständnis oder einem Textentwurf.");
    }
    const skillIds = proposedSkills;
    if (!supportsLocalSkillCombinationList(skillIds, documents)) {
      return stopped(request.requestNonce, "LOCAL_SKILL_COMBINATION_DENIED", "Für diese Aufgabe fehlt ein ausdrücklich ausgewählter Text.");
    }
    const generationInput: LocalSkillGenerationInput = Object.freeze({
      skillIds: Object.freeze([...skillIds]),
      requestText: request.text,
      documents,
    });
    if (!contextFits(generationInput, this.authority.policy.limits.maxModelContextBytes)) {
      return stopped(request.requestNonce, "LOCAL_SKILL_CONTEXT_TOO_LARGE", "Die ausgewählten Texte sind für einen lokalen Lauf zu groß. Die Eingabe bleibt erhalten.");
    }
    if (options.signal?.aborted) return stopped(request.requestNonce, "LOCAL_SKILL_CANCELLED", "Der lokale Lauf wurde abgebrochen.");
    if (!this.authority.isCurrent(token)) {
      return stopped(request.requestNonce, "LOCAL_SKILL_STALE_GENERATION", "Die Berechtigung hat sich geändert. Bitte erneut starten.");
    }
    let rawGeneration: unknown;
    try {
      rawGeneration = await this.model.generate(generationInput, options);
    } catch {
      return stopped(request.requestNonce, "LOCAL_SKILL_MODEL_ERROR", "Der lokale Testlauf konnte nicht abgeschlossen werden.");
    }
    if (options.signal?.aborted) return stopped(request.requestNonce, "LOCAL_SKILL_CANCELLED", "Der lokale Lauf wurde abgebrochen.");
    if (!this.authority.isCurrent(token)) {
      return stopped(request.requestNonce, "LOCAL_SKILL_STALE_GENERATION", "Die Berechtigung hat sich geändert. Bitte erneut starten.");
    }
    return this.#validateGeneration(request.requestNonce, skillIds, documents, rawGeneration);
  }

  #validateGeneration(
    requestNonce: string,
    skillIds: readonly ExecutableLocalSkillId[],
    documents: LocalSkillGenerationInput["documents"],
    value: unknown,
  ): LocalSkillResult {
    if (!plainRecord(value) || !exactKeys(value, GENERATION_KEYS) || value.schemaVersion !== 1 || !Array.isArray(value.parts) ||
        value.parts.length !== skillIds.length) {
      return stopped(requestNonce, "LOCAL_SKILL_OUTPUT_INVALID", "Das lokale Ergebnis hatte ein ungültiges Format.");
    }
    const paragraphIndex = new Map<string, LocalSkillCitation>();
    for (const document of documents) {
      for (const paragraph of document.paragraphs) {
        paragraphIndex.set(paragraph.id, {
          paragraphId: paragraph.id,
          sourceId: document.id,
          sourceTitle: document.title,
          sectionLabel: document.sectionLabel,
          paragraphLabel: `Absatz ${paragraph.ordinal}`,
        });
      }
    }
    const parts: LocalSkillResultPart[] = [];
    let outputBytes = 0;
    for (let index = 0; index < value.parts.length; index += 1) {
      const rawPart = value.parts[index];
      const skillId = skillIds[index];
      if (!skillId || !plainRecord(rawPart) || !exactKeys(rawPart, PART_KEYS) || rawPart.skillId !== skillId ||
          typeof rawPart.text !== "string" || rawPart.text.trim().length === 0 || !validUnicode(rawPart.text) ||
          rawPart.text.includes("\u0000") || !Array.isArray(rawPart.citationParagraphIds) ||
          !rawPart.citationParagraphIds.every((id) => typeof id === "string") ||
          new Set(rawPart.citationParagraphIds).size !== rawPart.citationParagraphIds.length) {
        return stopped(requestNonce, "LOCAL_SKILL_OUTPUT_INVALID", "Das lokale Ergebnis passt nicht zum angewandten Skill.");
      }
      outputBytes += Buffer.byteLength(rawPart.text, "utf8");
      if (outputBytes > this.authority.policy.limits.maxOutputBytes) {
        return stopped(requestNonce, "LOCAL_SKILL_OUTPUT_INVALID", "Das lokale Ergebnis überschreitet die Ausgabegrenze.");
      }
      const expectedKind = skillId === "DOCUMENT_UNDERSTANDING" ? "answer" : "draft";
      if (rawPart.kind !== expectedKind ||
          (skillId === "DOCUMENT_UNDERSTANDING" && rawPart.citationParagraphIds.length === 0) ||
          (skillId === "TEXT_COMPOSITION" && rawPart.citationParagraphIds.length !== 0)) {
        return stopped(requestNonce, "LOCAL_SKILL_OUTPUT_INVALID", "Das lokale Ergebnis passt nicht zum angewandten Skill.");
      }
      const citations: LocalSkillCitation[] = [];
      for (const id of rawPart.citationParagraphIds) {
        const citation = paragraphIndex.get(id);
        if (!citation) return stopped(requestNonce, "LOCAL_SKILL_OUTPUT_INVALID", "Das lokale Ergebnis verweist auf eine unbekannte Quelle.");
        citations.push(Object.freeze(citation));
      }
      parts.push(Object.freeze({ skillId, resultKind: expectedKind, text: rawPart.text, citations: Object.freeze(citations) }));
    }
    return {
      ok: true,
      requestNonce,
      skillIds: Object.freeze([...skillIds]),
      provider: this.model.name,
      parts: Object.freeze(parts),
      sourceTitles: Object.freeze(documents.map((document) => document.title)),
    };
  }
}
