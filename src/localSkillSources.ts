import { Buffer } from "node:buffer";
import type {
  LocalSkillDocumentSnapshot,
  LocalSkillLimits,
  LocalSkillSourceHandle,
  LocalSkillSourceKind,
  LocalSkillSourceMetadata,
} from "./localSkillTypes.js";

const trustedHandles = new WeakSet<object>();
const SOURCE_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

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

function makeSource(
  metadata: Omit<LocalSkillSourceMetadata, "capabilities" | "readOnly">,
  readText: () => string,
): LocalSkillSourceHandle {
  if (!SOURCE_ID.test(metadata.id) || metadata.organizationId.length < 1 || metadata.organizationId.length > 128 ||
      metadata.title.length < 1 || metadata.title.length > 256 || !validUnicode(metadata.title)) {
    throw new Error("invalid source metadata");
  }
  const frozenMetadata = Object.freeze({ ...metadata, capabilities: Object.freeze(["read"] as const), readOnly: true as const });
  const handle = Object.freeze({ metadata: frozenMetadata, readText });
  trustedHandles.add(handle);
  return handle;
}

export function createInlineSyntheticSource(
  metadata: { id: string; organizationId: string; title: string },
  text: string,
): LocalSkillSourceHandle {
  const snapshot = `${text}`;
  return makeSource({ ...metadata, kind: "INLINE_SYNTHETIC" }, () => snapshot);
}

export function createHostResolvedSource(
  metadata: { id: string; organizationId: string; title: string; kind?: Extract<LocalSkillSourceKind, "HOST_RESOLVED"> },
  readText: () => string,
): LocalSkillSourceHandle {
  return makeSource({ id: metadata.id, organizationId: metadata.organizationId, title: metadata.title, kind: "HOST_RESOLVED" }, readText);
}

export function isTrustedLocalSkillSource(value: unknown): value is LocalSkillSourceHandle {
  return typeof value === "object" && value !== null && trustedHandles.has(value as object);
}

function segment(text: string, sourceId: string, limits: LocalSkillLimits): LocalSkillDocumentSnapshot["paragraphs"] {
  if (!validUnicode(text) || text.includes("\u0000")) throw new Error("source invalid");
  const blocks = text.split(/\r?\n\s*\r?\n/u).map((value) => value.trim()).filter(Boolean);
  if (blocks.length === 0 || blocks.length > limits.maxParagraphCount) throw new Error("source invalid");
  return Object.freeze(blocks.map((value, index) => {
    if (Buffer.byteLength(value, "utf8") > limits.maxParagraphBytes) throw new Error("source too large");
    return Object.freeze({ id: `${sourceId}:p${String(index + 1).padStart(2, "0")}`, text: value, ordinal: index + 1 });
  }));
}

export function snapshotAuthorizedLocalSkillSources(
  handles: readonly LocalSkillSourceHandle[],
  limits: LocalSkillLimits,
): readonly LocalSkillDocumentSnapshot[] {
  let aggregateBytes = 0;
  let paragraphCount = 0;
  const snapshots = handles.map((handle) => {
    const text = handle.readText();
    if (typeof text !== "string") throw new Error("source invalid");
    const bytes = Buffer.byteLength(text, "utf8");
    aggregateBytes += bytes;
    if (bytes < 1 || bytes > limits.maxSourceBytes || aggregateBytes > limits.maxAggregateSourceBytes) {
      throw new Error("source too large");
    }
    const paragraphs = segment(text, handle.metadata.id, limits);
    paragraphCount += paragraphs.length;
    if (paragraphCount > limits.maxParagraphCount) throw new Error("source too large");
    return Object.freeze({
      id: handle.metadata.id,
      title: handle.metadata.title,
      kind: handle.metadata.kind,
      sectionLabel: "Abschnitt 1" as const,
      paragraphs,
    });
  });
  return Object.freeze(snapshots);
}
