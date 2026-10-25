import { Buffer } from "node:buffer";
import { isExecutableLocalSkillId } from "./localSkillCatalog.js";
import { isTrustedLocalSkillSource } from "./localSkillSources.js";
import type {
  LocalSkillAuthorizationToken,
  LocalSkillRequest,
  LocalSkillSourceMetadata,
  TrustedLocalSkillPolicy,
} from "./localSkillTypes.js";

const POLICY_KEYS = [
  "schemaVersion", "policyId", "organizationId", "principalId", "sessionId", "authorizationVersion",
  "purpose", "contentScope", "executableSkillIds", "readableSourceIds", "allowInlineSyntheticAttachments",
  "allowSensitiveSyntheticExamples", "actions", "persistence", "limits",
] as const;
const LIMIT_KEYS = [
  "maxRequestBytes", "maxSourceCount", "maxSourceTitleBytes", "maxSourceBytes", "maxAggregateSourceBytes",
  "maxParagraphCount", "maxParagraphBytes", "maxProposalBytes", "maxOutputBytes", "maxModelContextBytes",
  "maxModelOutputTokens",
] as const;

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

function boundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

export function validateTrustedLocalSkillPolicy(value: unknown): TrustedLocalSkillPolicy {
  if (!plainRecord(value) || !exactKeys(value, POLICY_KEYS) || value.schemaVersion !== 1 ||
      !boundedId(value.policyId) || !boundedId(value.organizationId) || !boundedId(value.principalId) ||
      !boundedId(value.sessionId) || !Number.isInteger(value.authorizationVersion) || (value.authorizationVersion as number) < 1 ||
      value.purpose !== "SYNTHETIC_LOCAL_EDITORIAL" || value.contentScope !== "SYNTHETIC_DEMO_ONLY" ||
      typeof value.allowInlineSyntheticAttachments !== "boolean" || typeof value.allowSensitiveSyntheticExamples !== "boolean" ||
      value.actions !== false || value.persistence !== false || !Array.isArray(value.executableSkillIds) ||
      value.executableSkillIds.length < 1 || !value.executableSkillIds.every(isExecutableLocalSkillId) ||
      new Set(value.executableSkillIds).size !== value.executableSkillIds.length || !Array.isArray(value.readableSourceIds) ||
      !value.readableSourceIds.every(boundedId) || new Set(value.readableSourceIds).size !== value.readableSourceIds.length ||
      !plainRecord(value.limits) || !exactKeys(value.limits, LIMIT_KEYS)) {
    throw new Error("invalid local skill policy");
  }
  const limits = value.limits;
  for (const key of LIMIT_KEYS) {
    if (!Number.isInteger(limits[key]) || (limits[key] as number) < 1) throw new Error("invalid local skill limits");
  }
  if ((limits.maxRequestBytes as number) > 32_768 || (limits.maxSourceCount as number) > 4 ||
      (limits.maxSourceTitleBytes as number) > 512 || (limits.maxSourceBytes as number) > 32_768 ||
      (limits.maxAggregateSourceBytes as number) > 65_536 || (limits.maxParagraphCount as number) > 128 ||
      (limits.maxParagraphBytes as number) > 8_192 || (limits.maxProposalBytes as number) > 8_192 ||
      (limits.maxOutputBytes as number) > 16_384 || (limits.maxModelContextBytes as number) > 65_536 ||
      (limits.maxModelOutputTokens as number) > 1_024) {
    throw new Error("local skill limits exceed hard bounds");
  }
  return Object.freeze({
    ...value,
    executableSkillIds: Object.freeze([...value.executableSkillIds]),
    readableSourceIds: Object.freeze([...value.readableSourceIds]),
    limits: Object.freeze({ ...value.limits }),
  }) as unknown as TrustedLocalSkillPolicy;
}

function validateSourceMetadata(policy: TrustedLocalSkillPolicy, metadata: LocalSkillSourceMetadata): void {
  if (metadata.organizationId !== policy.organizationId || metadata.capabilities.length !== 1 ||
      metadata.capabilities[0] !== "read" || metadata.readOnly !== true ||
      Buffer.byteLength(metadata.title, "utf8") > policy.limits.maxSourceTitleBytes) {
    throw new Error("source denied");
  }
  if (metadata.kind === "HOST_RESOLVED") {
    if (!policy.readableSourceIds.includes(metadata.id)) throw new Error("source denied");
  } else if (metadata.kind === "INLINE_SYNTHETIC") {
    if (!policy.allowInlineSyntheticAttachments) throw new Error("source denied");
  } else throw new Error("source denied");
}

export class LocalSkillAuthority {
  readonly #policy: TrustedLocalSkillPolicy;
  #authorityEpoch = 1;
  #requestGeneration = 0;
  #revoked = false;

  constructor(policy: unknown) {
    this.#policy = validateTrustedLocalSkillPolicy(policy);
  }

  get policy(): TrustedLocalSkillPolicy {
    return this.#policy;
  }

  begin(request: LocalSkillRequest): LocalSkillAuthorizationToken {
    if (this.#revoked) throw new Error("authorization revoked");
    if (!this.#policy.allowSensitiveSyntheticExamples) throw new Error("local sensitive capability denied");
    if (request.sources.length > this.#policy.limits.maxSourceCount ||
        new Set(request.sources.map((source) => source.metadata.id)).size !== request.sources.length) {
      throw new Error("source denied");
    }
    for (const source of request.sources) {
      if (!isTrustedLocalSkillSource(source)) throw new Error("source denied");
      validateSourceMetadata(this.#policy, source.metadata);
    }
    this.#requestGeneration += 1;
    return Object.freeze({
      organizationId: this.#policy.organizationId,
      principalId: this.#policy.principalId,
      sessionId: this.#policy.sessionId,
      authorizationVersion: this.#policy.authorizationVersion,
      authorityEpoch: this.#authorityEpoch,
      requestGeneration: this.#requestGeneration,
      purpose: "SYNTHETIC_LOCAL_EDITORIAL",
      requestNonce: request.requestNonce,
      sourceIds: Object.freeze(request.sources.map((source) => source.metadata.id)),
    });
  }

  isCurrent(token: LocalSkillAuthorizationToken): boolean {
    return token.organizationId === this.#policy.organizationId && token.principalId === this.#policy.principalId &&
      token.sessionId === this.#policy.sessionId && token.authorizationVersion === this.#policy.authorizationVersion &&
      token.authorityEpoch === this.#authorityEpoch && token.requestGeneration === this.#requestGeneration;
  }

  revoke(): void {
    this.#revoked = true;
    this.#authorityEpoch += 1;
    this.#requestGeneration += 1;
  }

  invalidateForNewRequest(): void {
    this.#requestGeneration += 1;
  }
}
