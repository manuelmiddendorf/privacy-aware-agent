import { Buffer } from "node:buffer";
import type { ClassificationResult } from "./types.js";

const PERSON_NAME = String.raw`[A-ZÄÖÜ][a-zäöüß'-]{1,30}\s+[A-ZÄÖÜ][a-zäöüß'-]{1,30}`;
const DIRECT_PERSON_NAME_PATTERNS = [
  new RegExp(String.raw`\b(?:[Nn]ame|[Nn]amed|[Hh]eißt|[Pp]erson|[Ff]or|[Ff]ür|[Vv]on|[Ff]rom)\s*[:=]?\s+${PERSON_NAME}\b`),
  new RegExp(String.raw`(?:^|[.!?]\s+)${PERSON_NAME}\b(?=\s+(?:ist|hat|möchte|needs|has|is|aus|from|erreicht|unter)\b|\s*[,.:!?]|\s*$)`),
];

const BLOCK_RULES: readonly { pattern: RegExp; result: ClassificationResult }[] = [
  { pattern: /\b(diagnos(?:e|is)|medication|medicine|medical|patient|symptom|fever|allerg(?:y|ie)|health(?:\s+record)?|therap(?:y|ie)|disability|krank(?:heit|meldung)?|fieber|husten|übelkeit|arzt|ärzt(?:in|lich)|gesundheit(?:sdaten)?)\b/i, result: { classification: "sensitive", reasonCode: "BLOCK_HEALTH_DATA" } },
  { pattern: /\b(child|children|kid|minor|kind|kinder|kindes|kindern|jugendlich(?:e|er|es|en))\b/i, result: { classification: "sensitive", reasonCode: "BLOCK_CHILD_DATA" } },
  { pattern: /\b(performance review|disciplinary|termination reason|salary|gehalt|personalakte|abmahnung)\b/i, result: { classification: "sensitive", reasonCode: "BLOCK_SENSITIVE_PERSONNEL" } },
  { pattern: /\b(password|passwort|api[_ -]?key|secret|private key|access token|bearer\s+[a-z0-9._-]+)\b/i, result: { classification: "sensitive", reasonCode: "BLOCK_CREDENTIAL" } },
  { pattern: /\b(iban|bic|credit card|kreditkarte|bank account)\b/i, result: { classification: "sensitive", reasonCode: "BLOCK_FINANCIAL_IDENTIFIER" } },
];

const IDENTIFIER_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\+?[0-9][0-9 ()/-]{7,}[0-9]/g,
  /\b(?:member|customer|user)[- _]?id\s*[:=]\s*[a-z0-9-]+\b/gi,
];

const UNCERTAIN_PATTERNS = [
  /\b(someone|a person|a family|ein fall|diese person)\b.{0,40}\b(private|confidential|vertraulich|problem)\b/i,
  /\b(unknown attachment|unbekannte(?:r|n|s)? anhang|classified document)\b/i,
];

export function classifyText(text: string, maxBytes: number): ClassificationResult {
  if (Buffer.byteLength(text, "utf8") > maxBytes) return { classification: "uncertain", reasonCode: "BLOCK_INPUT_TOO_LARGE" };
  for (const rule of BLOCK_RULES) if (rule.pattern.test(text)) return rule.result;
  if (DIRECT_PERSON_NAME_PATTERNS.some((pattern) => pattern.test(text))) {
    return { classification: "uncertain", reasonCode: "BLOCK_DIRECT_PERSON_NAME" };
  }
  if (UNCERTAIN_PATTERNS.some((pattern) => pattern.test(text))) {
    return { classification: "uncertain", reasonCode: "BLOCK_UNCERTAIN_CONTEXT" };
  }
  if (IDENTIFIER_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  })) {
    return { classification: "redactable", reasonCode: "REDACTABLE_DIRECT_IDENTIFIER" };
  }
  return { classification: "safe", reasonCode: "SAFE_GENERIC" };
}

export function redactDirectIdentifiers(text: string): { text: string; count: number } {
  let result = text;
  let count = 0;
  for (const pattern of IDENTIFIER_PATTERNS) {
    result = result.replace(pattern, () => {
      count += 1;
      return `[REDACTED_${count}]`;
    });
  }
  return { text: result, count };
}
