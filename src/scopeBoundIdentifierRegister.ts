import type {
  ConfirmedIdentifierRange,
  IdentifierMatchResult,
  ResearchIdentifier,
  ResearchIdentifierType,
} from "./localResearchTypes.js";

const LETTERS = /\p{L}+/gu;
const EMAILS = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const ADDRESS_TOKENS = /[\p{L}\p{N}]+/gu;

interface WordSpan {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

function normalizeUnicode(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizeFolded(value: string): string {
  return normalizeUnicode(value).toLocaleLowerCase("und");
}

function normalizeEmail(value: string): string | null {
  const normalized = normalizeUnicode(value);
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return null;
  const local = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1).toLocaleLowerCase("und");
  return `${local}@${domain}`;
}

function normalizeAddress(value: string): string {
  return normalizeFolded(value)
    .replace(/\s*([,.;:])\s*/gu, "$1 ")
    .replace(/\s+/gu, " ")
    .trim();
}

function words(value: string): string[] {
  return normalizeUnicode(value).match(LETTERS)?.map((token) => token.toLocaleLowerCase("und")) ?? [];
}

function wordSpans(value: string): WordSpan[] {
  const normalized = value.normalize("NFKC");
  return [...normalized.matchAll(LETTERS)].map((match) => ({
    value: match[0].toLocaleLowerCase("und"),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (i < left.length || j < right.length ? 1 : 0) <= 1;
}

function containsToken(haystack: readonly string[], token: string): boolean {
  return haystack.includes(token);
}

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, index) => haystack[start + index] === token)) return true;
  }
  return false;
}

function exactSequenceRanges(text: string, haystack: readonly WordSpan[], needle: readonly string[], type: ResearchIdentifierType): ConfirmedIdentifierRange[] {
  const ranges: ConfirmedIdentifierRange[] = [];
  if (needle.length === 0 || needle.length > haystack.length) return ranges;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (!needle.every((token, index) => haystack[start + index]?.value === token)) continue;
    const first = haystack[start];
    const last = haystack[start + needle.length - 1];
    if (first === undefined || last === undefined) continue;
    let separatorsValid = true;
    for (let index = start; index < start + needle.length - 1; index += 1) {
      const left = haystack[index];
      const right = haystack[index + 1];
      if (left === undefined || right === undefined || !/^[\s.'’\-]+$/u.test(text.slice(left.end, right.start))) {
        separatorsValid = false;
        break;
      }
    }
    if (separatorsValid) ranges.push({ start: first.start, end: last.end, type });
  }
  return ranges;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function addressRanges(text: string, address: string): ConfirmedIdentifierRange[] {
  const tokens = normalizeUnicode(address).match(ADDRESS_TOKENS) ?? [];
  if (tokens.length < 2) return [];
  const pattern = tokens.map(escapeRegex).join(String.raw`[\s,.;:/-]+`);
  const regex = new RegExp(pattern, "giu");
  return [...text.normalize("NFKC").matchAll(regex)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    type: "postal_address" as const,
  }));
}

function fuzzySequenceRanges(haystack: readonly WordSpan[], needle: readonly string[]): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  if (needle.length < 2 || needle.some((token) => token.length <= 3) || needle.length > haystack.length) return ranges;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let changedTokens = 0;
    let valid = true;
    for (let index = 0; index < needle.length; index += 1) {
      const actual = haystack[start + index]?.value;
      const expected = needle[index];
      if (actual === undefined || expected === undefined) {
        valid = false;
        break;
      }
      if (actual === expected) continue;
      changedTokens += 1;
      if (changedTokens > 1 || !editDistanceAtMostOne(actual, expected)) {
        valid = false;
        break;
      }
    }
    const first = haystack[start];
    const last = haystack[start + needle.length - 1];
    if (valid && changedTokens === 1 && first !== undefined && last !== undefined) {
      ranges.push({ start: first.start, end: last.end });
    }
  }
  return ranges;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export class ScopeBoundIdentifierRegister {
  readonly #entries: readonly ResearchIdentifier[];

  constructor(entries: readonly ResearchIdentifier[]) {
    this.#entries = entries.map((entry) => ({ ...entry }));
  }

  entries(): readonly ResearchIdentifier[] {
    return this.#entries.map((entry) => ({ ...entry }));
  }

  match(text: string): IdentifierMatchResult {
    const normalized = text.normalize("NFKC");
    const textWordSpans = wordSpans(text);
    const textWords = textWordSpans.map((token) => token.value);
    const emailMatches = [...normalized.matchAll(EMAILS)];
    const exact: ResearchIdentifier[] = [];
    const fuzzy: { entry: ResearchIdentifier; start: number; end: number }[] = [];
    const short: ResearchIdentifier[] = [];
    const confirmedRanges: ConfirmedIdentifierRange[] = [];

    for (const entry of this.#entries) {
      if (entry.type === "email") {
        const candidate = normalizeEmail(entry.value);
        for (const match of emailMatches) {
          if (candidate !== null && normalizeEmail(match[0]) === candidate) {
            exact.push(entry);
            confirmedRanges.push({ start: match.index, end: match.index + match[0].length, type: "email" });
          }
        }
        continue;
      }
      if (entry.type === "postal_address") {
        const ranges = addressRanges(text, entry.value);
        if (ranges.length > 0 && normalizeAddress(text).includes(normalizeAddress(entry.value))) {
          exact.push(entry);
          confirmedRanges.push(...ranges);
        }
        continue;
      }
      if (entry.type === "contextual_short_alias") {
        const token = words(entry.value)[0];
        if (token !== undefined && containsToken(textWords, token)) short.push(entry);
        continue;
      }
      const entryWords = words(entry.value);
      const ranges = exactSequenceRanges(normalized, textWordSpans, entryWords, entry.type);
      if (ranges.length > 0 && containsSequence(textWords, entryWords)) {
        exact.push(entry);
        confirmedRanges.push(...ranges);
      } else if (entry.type === "person_name") {
        for (const range of fuzzySequenceRanges(textWordSpans, entryWords)) fuzzy.push({ entry, ...range });
      }
    }

    const unresolvedFuzzy = fuzzy.filter((candidate) => !confirmedRanges.some((exactRange) =>
      candidate.start < exactRange.end && candidate.end > exactRange.start));

    if (short.length > 0) {
      return {
        state: "short_alias_uncertain",
        matchedTypes: unique([...exact, ...short].map((entry) => entry.type)),
        subjectCount: unique([...exact, ...short].map((entry) => entry.subjectId)).length,
        confirmedRanges,
      };
    }
    if (unresolvedFuzzy.length > 0) {
      const fuzzyEntries = unresolvedFuzzy.map((candidate) => candidate.entry);
      const subjects = unique([...exact, ...fuzzyEntries].map((entry) => entry.subjectId));
      return {
        state: subjects.length > 1 ? "ambiguous" : "fuzzy",
        matchedTypes: unique([...exact, ...fuzzyEntries].map((entry) => entry.type)),
        subjectCount: subjects.length,
        confirmedRanges,
      };
    }
    if (exact.length > 0) {
      const subjects = unique(exact.map((entry) => entry.subjectId));
      return {
        state: subjects.length === 1 ? "exact" : "ambiguous",
        matchedTypes: unique(exact.map((entry) => entry.type)),
        subjectCount: subjects.length,
        confirmedRanges,
      };
    }
    return { state: "none", matchedTypes: [], subjectCount: 0, confirmedRanges: [] };
  }

  maskConfirmed(text: string, ranges: readonly ConfirmedIdentifierRange[]): string {
    const normalized = text.normalize("NFKC");
    const ordered = [...ranges]
      .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= normalized.length)
      .sort((left, right) => left.start - right.start || right.end - left.end);
    const merged: { start: number; end: number }[] = [];
    for (const range of ordered) {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({ start: range.start, end: range.end });
    }
    let cursor = 0;
    let result = "";
    for (const range of merged) {
      result += normalized.slice(cursor, range.start);
      result += "[REGISTERED]";
      cursor = range.end;
    }
    return result + normalized.slice(cursor);
  }
}

export function isRegisterIdentifierType(value: unknown): value is ResearchIdentifierType {
  return ["person_name", "person_alias", "email", "postal_address", "contextual_short_alias"].includes(value as ResearchIdentifierType);
}
