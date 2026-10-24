import type {
  ExecutableLocalSkillId,
  LocalSkillCatalogEntry,
  LocalSkillDocumentSnapshot,
  LocalSkillId,
} from "./localSkillTypes.js";

export const LOCAL_SKILL_CATALOG: readonly LocalSkillCatalogEntry[] = Object.freeze([
  Object.freeze({
    id: "DOCUMENT_UNDERSTANDING",
    label: "Dokumente verstehen",
    status: "executable",
    inputContract: "Freie Frage oder Arbeitsauftrag mit mindestens einem ausdrücklich gewählten Textanhang.",
    outputContract: "Lokale Antwort mit hostvalidierten Absatzverweisen; keine Garantie für Faktentreue.",
    sourceRightsContract: "Nur vorab leseberechtigte oder ausdrücklich erlaubte synthetische Inline-Texte.",
    processingBoundary: "LOCAL_ONLY",
  }),
  Object.freeze({
    id: "INFORMATION_COMPARISON",
    label: "Informationen vergleichen",
    status: "planned",
    inputContract: "Noch nicht verfügbar.",
    outputContract: "Noch nicht verfügbar.",
    sourceRightsContract: "Keine Quelle wird verarbeitet.",
    processingBoundary: "LOCAL_ONLY",
  }),
  Object.freeze({
    id: "TEXT_COMPOSITION",
    label: "Texte formulieren",
    status: "executable",
    inputContract: "Freier Schreibauftrag, optional mit ausdrücklich gewählten Textanhängen.",
    outputContract: "Bearbeitbarer Entwurf; keine Ausführung, kein Versand und keine Zusage.",
    sourceRightsContract: "Nur vorab leseberechtigte oder ausdrücklich erlaubte synthetische Inline-Texte.",
    processingBoundary: "LOCAL_ONLY",
  }),
  Object.freeze({
    id: "PROCESS_PREPARATION",
    label: "Vorgänge vorbereiten",
    status: "planned",
    inputContract: "Noch nicht verfügbar.",
    outputContract: "Noch nicht verfügbar; keine Aktion.",
    sourceRightsContract: "Keine Quelle wird verarbeitet.",
    processingBoundary: "LOCAL_ONLY",
  }),
  Object.freeze({
    id: "GENERAL_RESEARCH",
    label: "Allgemein recherchieren",
    status: "planned",
    inputContract: "Noch nicht verfügbar.",
    outputContract: "Noch nicht verfügbar; keine externe Recherche.",
    sourceRightsContract: "Keine Quelle und kein Netzwerkzugriff.",
    processingBoundary: "LOCAL_ONLY",
  }),
]);

const entries = new Map(LOCAL_SKILL_CATALOG.map((entry) => [entry.id, entry]));
const executable = new Set<LocalSkillId>(LOCAL_SKILL_CATALOG.filter((entry) => entry.status === "executable").map((entry) => entry.id));

export function getLocalSkillEntry(id: LocalSkillId): LocalSkillCatalogEntry {
  const entry = entries.get(id);
  if (!entry) throw new Error("unknown local skill");
  return entry;
}

export function isLocalSkillId(value: unknown): value is LocalSkillId {
  return typeof value === "string" && entries.has(value as LocalSkillId);
}

export function isExecutableLocalSkillId(value: unknown): value is ExecutableLocalSkillId {
  return isLocalSkillId(value) && executable.has(value);
}

export function supportsLocalSkillCombination(skillId: ExecutableLocalSkillId, documents: readonly LocalSkillDocumentSnapshot[]): boolean {
  return supportsLocalSkillCombinationList([skillId], documents);
}

export function supportsLocalSkillCombinationList(
  skillIds: readonly ExecutableLocalSkillId[],
  documents: readonly LocalSkillDocumentSnapshot[],
): boolean {
  if (skillIds.length === 1 && skillIds[0] === "DOCUMENT_UNDERSTANDING") return documents.length > 0;
  if (skillIds.length === 1 && skillIds[0] === "TEXT_COMPOSITION") return true;
  return skillIds.length === 2 && skillIds[0] === "DOCUMENT_UNDERSTANDING" &&
    skillIds[1] === "TEXT_COMPOSITION" && documents.length > 0;
}
