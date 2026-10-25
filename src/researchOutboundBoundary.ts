import { Buffer } from "node:buffer";
import { classifyText } from "./privacyGate.js";

function collectStrings(value: unknown, output: string[]): void {
  if (typeof value === "string") { output.push(value); return; }
  if (Array.isArray(value)) { for (const item of value) collectStrings(item, output); return; }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output.push(key);
      collectStrings(item, output);
    }
  }
}

export function assertPrivacySafeResearchOutbound(value: unknown, options: {
  readonly maxBytes: number;
  readonly forbiddenLiterals?: readonly string[];
}): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > options.maxBytes) throw new Error("research outbound too large");
  const normalized = serialized.normalize("NFKC").toLocaleLowerCase("de-DE");
  for (const literal of options.forbiddenLiterals ?? []) {
    if (literal.length > 0 && normalized.includes(literal.normalize("NFKC").toLocaleLowerCase("de-DE"))) throw new Error("research outbound contains private context");
  }
  const strings: string[] = [];
  collectStrings(value, strings);
  for (const text of strings) if (classifyText(text, options.maxBytes).classification !== "safe") throw new Error("research outbound privacy scan failed");
}
