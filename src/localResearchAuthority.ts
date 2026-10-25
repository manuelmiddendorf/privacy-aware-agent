import { Buffer } from "node:buffer";
import type {
  AuthorizedResearchGeneration,
  LocalResearchRequest,
  ResearchIdentifier,
  ResearchSource,
} from "./localResearchTypes.js";

interface ActiveResearchSession {
  readonly organizationId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly readableSourceIds: ReadonlySet<string>;
}

const IDENTIFIER_TYPES = new Set(["person_name", "person_alias", "email", "postal_address", "contextual_short_alias"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== expected.length || !expected.every((key) => key in descriptors)) return false;
  return Object.values(descriptors).every((descriptor) => "value" in descriptor && descriptor.enumerable === true);
}

export function validateLocalResearchRequest(value: unknown): LocalResearchRequest {
  const keys = ["schemaVersion", "organizationId", "actorId", "sessionId", "sourceIds", "purpose", "language", "text"] as const;
  if (!isPlainRecord(value) || !hasExactDataKeys(value, keys)) throw new Error("invalid research request");
  if (value.schemaVersion !== 1 || value.purpose !== "GENERAL_WORKING_TIME_RESEARCH") throw new Error("invalid research request");
  if (value.language !== "de" && value.language !== "en") throw new Error("invalid research request");
  for (const key of ["organizationId", "actorId", "sessionId"] as const) {
    if (typeof value[key] !== "string" || value[key].length < 1 || value[key].length > 128) throw new Error("invalid research request");
  }
  if (typeof value.text !== "string" || value.text.length < 1 || Buffer.byteLength(value.text, "utf8") > 16_384) {
    throw new Error("invalid research request");
  }
  if (!Array.isArray(value.sourceIds) || value.sourceIds.length < 1 || value.sourceIds.length > 8 ||
      !value.sourceIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 128) ||
      new Set(value.sourceIds).size !== value.sourceIds.length) {
    throw new Error("invalid research request");
  }
  return {
    schemaVersion: 1,
    organizationId: value.organizationId as string,
    actorId: value.actorId as string,
    sessionId: value.sessionId as string,
    sourceIds: [...(value.sourceIds as string[])],
    purpose: "GENERAL_WORKING_TIME_RESEARCH",
    language: value.language as "de" | "en",
    text: value.text as string,
  };
}

export class InMemoryResearchAuthority {
  #active: ActiveResearchSession;
  #authorizationVersion = 1;
  #requestGeneration = 0;
  readonly #sources: ReadonlyMap<string, ResearchSource>;
  sourceReadCount = 0;

  constructor(active: {
    organizationId: string;
    actorId: string;
    sessionId: string;
    readableSourceIds: readonly string[];
  }, sources: readonly ResearchSource[]) {
    if (sources.length > 32) throw new Error("too many research sources");
    const sourceIds = new Set<string>();
    for (const source of sources) {
      if (sourceIds.has(source.id) || source.id.length < 1 || source.id.length > 128 ||
          source.organizationId.length < 1 || source.organizationId.length > 128 || source.identifiers.length > 256) {
        throw new Error("invalid research source");
      }
      sourceIds.add(source.id);
      for (const identifier of source.identifiers) {
        if (identifier.subjectId.length < 1 || identifier.subjectId.length > 128 ||
            !IDENTIFIER_TYPES.has(identifier.type) || identifier.value.length < 1 ||
            Buffer.byteLength(identifier.value, "utf8") > 1_024) {
          throw new Error("invalid research identifier");
        }
      }
    }
    this.#active = {
      organizationId: active.organizationId,
      actorId: active.actorId,
      sessionId: active.sessionId,
      readableSourceIds: new Set(active.readableSourceIds),
    };
    this.#sources = new Map(sources.map((source) => [source.id, Object.freeze({
      id: source.id,
      organizationId: source.organizationId,
      identifiers: Object.freeze(source.identifiers.map((identifier) => Object.freeze({ ...identifier }))),
    })]));
  }

  switchSession(next: {
    organizationId: string;
    actorId: string;
    sessionId: string;
    readableSourceIds: readonly string[];
  }): void {
    this.#authorizationVersion += 1;
    this.#active = {
      organizationId: next.organizationId,
      actorId: next.actorId,
      sessionId: next.sessionId,
      readableSourceIds: new Set(next.readableSourceIds),
    };
  }

  revokeSource(sourceId: string): void {
    this.#authorizationVersion += 1;
    this.#active = {
      ...this.#active,
      readableSourceIds: new Set([...this.#active.readableSourceIds].filter((id) => id !== sourceId)),
    };
  }

  begin(untrustedRequest: unknown): { request: LocalResearchRequest; generation: AuthorizedResearchGeneration } | null {
    const request = validateLocalResearchRequest(untrustedRequest);
    if (request.organizationId !== this.#active.organizationId || request.actorId !== this.#active.actorId ||
        request.sessionId !== this.#active.sessionId) return null;
    for (const sourceId of request.sourceIds) {
      const source = this.#sources.get(sourceId);
      if (!this.#active.readableSourceIds.has(sourceId) || source?.organizationId !== request.organizationId) return null;
    }
    this.#requestGeneration += 1;
    return {
      request,
      generation: {
        organizationId: request.organizationId,
        actorId: request.actorId,
        sessionId: request.sessionId,
        authorizationVersion: this.#authorizationVersion,
        requestGeneration: this.#requestGeneration,
        purpose: request.purpose,
        sourceIds: [...request.sourceIds],
      },
    };
  }

  loadIdentifiers(generation: AuthorizedResearchGeneration): readonly ResearchIdentifier[] | null {
    if (!this.isCurrent(generation)) return null;
    const identifiers: ResearchIdentifier[] = [];
    for (const sourceId of generation.sourceIds) {
      const source = this.#sources.get(sourceId);
      if (!source || source.organizationId !== generation.organizationId || !this.#active.readableSourceIds.has(sourceId)) return null;
      this.sourceReadCount += 1;
      identifiers.push(...source.identifiers.map((identifier) => ({ ...identifier })));
    }
    return identifiers;
  }

  isCurrent(generation: AuthorizedResearchGeneration): boolean {
    return generation.organizationId === this.#active.organizationId &&
      generation.actorId === this.#active.actorId &&
      generation.sessionId === this.#active.sessionId &&
      generation.authorizationVersion === this.#authorizationVersion &&
      generation.requestGeneration === this.#requestGeneration &&
      generation.sourceIds.every((sourceId) => this.#active.readableSourceIds.has(sourceId));
  }
}
