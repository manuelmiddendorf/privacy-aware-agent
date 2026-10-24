import type {
  LocalSkillGenerationInput,
  LocalSkillModel,
  LocalSkillProposalInput,
} from "./localSkillTypes.js";

export class LocalSkillTestDouble implements LocalSkillModel {
  readonly name = "LOCAL_TEST_DOUBLE";
  proposalCallCount = 0;
  generationCallCount = 0;

  async propose(input: LocalSkillProposalInput, options: { signal?: AbortSignal } = {}): Promise<unknown> {
    this.proposalCallCount += 1;
    if (options.signal?.aborted) throw new Error("cancelled");
    const text = input.requestText.toLocaleLowerCase("de-DE");
    if (/\b(fass|fasse|zusammenfass|erklär|erklaer|summari[sz]e|explain)\w*/u.test(text) &&
        /\b(schreib|formuliere|formulier|entwurf|draft|write|rewrite)\w*/u.test(text) && input.documents.length > 0) {
      return { schemaVersion: 1, decision: "select", skillIds: ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"], clarificationCode: null };
    }
    if (/\b(fass|fasse|zusammenfass|erklär|erklaer|summari[sz]e|explain)\w*/u.test(text) && input.documents.length > 0) {
      return { schemaVersion: 1, decision: "select", skillIds: ["DOCUMENT_UNDERSTANDING"], clarificationCode: null };
    }
    if (/\b(schreib|formuliere|formulier|entwurf|draft|write|rewrite)\w*/u.test(text)) {
      return { schemaVersion: 1, decision: "select", skillIds: ["TEXT_COMPOSITION"], clarificationCode: null };
    }
    return { schemaVersion: 1, decision: "clarify", skillIds: [], clarificationCode: "NEED_TASK_OR_SOURCE" };
  }

  async generate(input: LocalSkillGenerationInput, options: { signal?: AbortSignal } = {}): Promise<unknown> {
    this.generationCallCount += 1;
    if (options.signal?.aborted) throw new Error("cancelled");
    const first = input.documents[0]?.paragraphs[0];
    return { schemaVersion: 1, parts: input.skillIds.map((skillId) => skillId === "DOCUMENT_UNDERSTANDING" ? {
      skillId,
      kind: "answer",
      text: "LOCAL_TEST_DOUBLE: Der ausgewählte Text wurde mechanisch verarbeitet.",
      citationParagraphIds: first ? [first.id] : [],
    } : {
      skillId,
      kind: "draft",
      text: `LOCAL_TEST_DOUBLE Entwurf: ${input.requestText}`,
      citationParagraphIds: [],
    }) };
  }
}
