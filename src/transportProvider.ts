import { Buffer } from "node:buffer";
import type {
  ModelProvider,
  ProviderCallOptions,
  ProviderInput,
  ProviderOutput,
  ReasonCode,
  TaskKind,
} from "./types.js";

const CONFIG_KEYS = new Set(["enabled", "timeoutMs", "maxRequestBytes", "maxResponseBytes"]);
const DEFAULT_TIMEOUT_MS = 1_000;
const DEFAULT_MAX_REQUEST_BYTES = 32_768;
const DEFAULT_MAX_RESPONSE_BYTES = 16_384;

const ADAPTER_REASONS = new Set<ReasonCode>([
  "BLOCK_PROVIDER_DISABLED",
  "BLOCK_PROVIDER_CANCELLED",
  "BLOCK_PROVIDER_TIMEOUT",
  "BLOCK_PROVIDER_TRANSPORT",
  "BLOCK_PROVIDER_RATE_LIMIT",
  "BLOCK_PROVIDER_QUOTA",
  "BLOCK_PROVIDER_REJECTED",
  "BLOCK_PROVIDER_REQUEST_TOO_LARGE",
  "BLOCK_PROVIDER_RESPONSE_INVALID",
  "BLOCK_PROVIDER_RESPONSE_TOO_LARGE",
  "BLOCK_PROVIDER_CITATION_INVALID",
  "BLOCK_PROVIDER_BUDGET",
  "BLOCK_PROVIDER_USAGE_UNKNOWN",
]);

export interface TrustedTransportProviderConfig {
  enabled: boolean;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
}

export interface TransportRequest {
  schemaVersion: 1;
  task: TaskKind;
  text: string;
  documents: readonly {
    id: string;
    tenantId: string;
    title: string;
    body: string;
  }[];
}

export interface TransportResponse {
  status: number;
  body: unknown;
}

export type ProviderTransport = (
  request: TransportRequest,
  options: { signal: AbortSignal },
) => Promise<TransportResponse>;

export class ProviderAdapterError extends Error {
  constructor(readonly reasonCode: ReasonCode) {
    super("Provider adapter request failed");
    this.name = "ProviderAdapterError";
  }
}

export function isProviderAdapterReasonCode(value: unknown): value is ReasonCode {
  return typeof value === "string" && ADAPTER_REASONS.has(value as ReasonCode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new Error("Invalid trusted transport provider configuration");
  }
  return value as number;
}

function normalizeConfig(value: TrustedTransportProviderConfig): Required<TrustedTransportProviderConfig> {
  if (!isRecord(value) || Object.keys(value).some((key) => !CONFIG_KEYS.has(key)) || typeof value.enabled !== "boolean") {
    throw new Error("Invalid trusted transport provider configuration");
  }
  return Object.freeze({
    enabled: value.enabled,
    timeoutMs: positiveInteger(value.timeoutMs, DEFAULT_TIMEOUT_MS, 30_000),
    maxRequestBytes: positiveInteger(value.maxRequestBytes, DEFAULT_MAX_REQUEST_BYTES, 262_144),
    maxResponseBytes: positiveInteger(value.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES, 262_144),
  });
}

function jsonBytes(value: unknown, invalidReason: ReasonCode): number {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") throw new Error("not serializable");
    return Buffer.byteLength(serialized, "utf8");
  } catch {
    throw new ProviderAdapterError(invalidReason);
  }
}

function dataProperties(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  try {
    if (!isRecord(value)) throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const enumerableKeys = Reflect.ownKeys(descriptors).filter((key) => descriptors[key as keyof typeof descriptors]?.enumerable);
    if (enumerableKeys.length !== expectedKeys.length ||
        enumerableKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))) {
      throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
    }
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch (error) {
    if (error instanceof ProviderAdapterError) throw error;
    throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
  }
}

function snapshotCitations(value: unknown, maximumBytes: number): string[] {
  if (!Array.isArray(value)) throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) ||
        (lengthDescriptor.value as number) < 0) {
      throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
    }
    const length = lengthDescriptor.value as number;
    if (length > maximumBytes) throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_TOO_LARGE");
    const enumerableKeys = Reflect.ownKeys(descriptors).filter((key) => descriptors[key as keyof typeof descriptors]?.enumerable);
    if (enumerableKeys.length !== length) throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
    const citations: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string") {
        throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
      }
      citations.push(descriptor.value);
    }
    if (enumerableKeys.some((key) => typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)) {
      throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
    }
    return citations;
  } catch (error) {
    if (error instanceof ProviderAdapterError) throw error;
    throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
  }
}

function snapshotProviderOutput(body: unknown, maximumBytes: number): ProviderOutput {
  const properties = dataProperties(body, ["text", "citations"]);
  if (typeof properties.text !== "string" || properties.text.length < 1) {
    throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
  }
  const snapshot: ProviderOutput = {
    text: properties.text,
    citations: snapshotCitations(properties.citations, maximumBytes),
  };
  if (jsonBytes(snapshot, "BLOCK_PROVIDER_RESPONSE_INVALID") > maximumBytes) {
    throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_TOO_LARGE");
  }
  return snapshot;
}

function quotaCode(body: unknown): string {
  try {
    if (!isRecord(body)) return "";
    const descriptors = Object.getOwnPropertyDescriptors(body);
    const code = descriptors.code;
    if (code && "value" in code && typeof code.value === "string") return code.value;
    const error = descriptors.error;
    if (!error || !("value" in error) || !isRecord(error.value)) return "";
    const nestedCode = Object.getOwnPropertyDescriptor(error.value, "code");
    return nestedCode && "value" in nestedCode && typeof nestedCode.value === "string" ? nestedCode.value : "";
  } catch {
    return "";
  }
}

function snapshotTransportResponse(value: unknown): TransportResponse {
  const properties = dataProperties(value, ["status", "body"]);
  if (!Number.isInteger(properties.status)) {
    throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
  }
  return { status: properties.status as number, body: properties.body };
}

export class TransportModelProvider implements ModelProvider {
  readonly name = "INJECTED_TRANSPORT";
  private readonly config: Required<TrustedTransportProviderConfig>;
  private methodCalls = 0;
  private transportCalls = 0;

  constructor(
    private readonly transport: ProviderTransport,
    config: TrustedTransportProviderConfig = { enabled: false },
  ) {
    this.config = normalizeConfig(config);
  }

  get callCount(): number {
    return this.methodCalls;
  }

  get transportCallCount(): number {
    return this.transportCalls;
  }

  async generate(input: ProviderInput, options: ProviderCallOptions = {}): Promise<ProviderOutput> {
    this.methodCalls += 1;
    if (!this.config.enabled) throw new ProviderAdapterError("BLOCK_PROVIDER_DISABLED");
    if (options.signal?.aborted) throw new ProviderAdapterError("BLOCK_PROVIDER_CANCELLED");

    const request: TransportRequest = {
      schemaVersion: 1,
      task: input.task,
      text: input.text,
      documents: input.documents.map((document) => ({
        id: document.id,
        tenantId: document.tenantId,
        title: document.title,
        body: document.body,
      })),
    };
    if (jsonBytes(request, "BLOCK_PROVIDER_REQUEST_TOO_LARGE") > this.config.maxRequestBytes) {
      throw new ProviderAdapterError("BLOCK_PROVIDER_REQUEST_TOO_LARGE");
    }

    const controller = new AbortController();
    const interruption: { reason: "timeout" | "cancelled" | null } = { reason: null };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    const interrupted = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        interruption.reason = "timeout";
        controller.abort();
        reject(new ProviderAdapterError("BLOCK_PROVIDER_TIMEOUT"));
      }, this.config.timeoutMs);
      cancel = () => {
        interruption.reason = "cancelled";
        controller.abort();
        reject(new ProviderAdapterError("BLOCK_PROVIDER_CANCELLED"));
      };
      options.signal?.addEventListener("abort", cancel, { once: true });
    });

    try {
      if (options.signal?.aborted) {
        interruption.reason = "cancelled";
        throw new ProviderAdapterError("BLOCK_PROVIDER_CANCELLED");
      }
      this.transportCalls += 1;
      const transportResult = Promise.resolve(this.transport(request, { signal: controller.signal }));
      const transportResponse = await Promise.race([transportResult, interrupted]);
      if (interruption.reason === "timeout") throw new ProviderAdapterError("BLOCK_PROVIDER_TIMEOUT");
      if (interruption.reason === "cancelled" || options.signal?.aborted) {
        throw new ProviderAdapterError("BLOCK_PROVIDER_CANCELLED");
      }
      const response = snapshotTransportResponse(transportResponse);
      if (response.status === 429) {
        throw new ProviderAdapterError(
          quotaCode(response.body) === "quota_exceeded" ? "BLOCK_PROVIDER_QUOTA" : "BLOCK_PROVIDER_RATE_LIMIT"
        );
      }
      if ((response.status as number) >= 500) throw new ProviderAdapterError("BLOCK_PROVIDER_TRANSPORT");
      if ((response.status as number) < 200 || (response.status as number) >= 300) {
        throw new ProviderAdapterError("BLOCK_PROVIDER_REJECTED");
      }
      const output = snapshotProviderOutput(response.body, this.config.maxResponseBytes);
      if (new Set(output.citations).size !== output.citations.length ||
          output.citations.some((citation) => !input.documents.some((document) => document.id === citation))) {
        throw new ProviderAdapterError("BLOCK_PROVIDER_CITATION_INVALID");
      }
      if (interruption.reason === "timeout") throw new ProviderAdapterError("BLOCK_PROVIDER_TIMEOUT");
      if (interruption.reason === "cancelled" || options.signal?.aborted) {
        throw new ProviderAdapterError("BLOCK_PROVIDER_CANCELLED");
      }
      return output;
    } catch (error) {
      if (interruption.reason === "timeout") throw new ProviderAdapterError("BLOCK_PROVIDER_TIMEOUT");
      if (interruption.reason === "cancelled" || options.signal?.aborted) {
        throw new ProviderAdapterError("BLOCK_PROVIDER_CANCELLED");
      }
      if (error instanceof ProviderAdapterError) throw error;
      throw new ProviderAdapterError("BLOCK_PROVIDER_TRANSPORT");
    } finally {
      if (timeout) clearTimeout(timeout);
      if (cancel) options.signal?.removeEventListener("abort", cancel);
    }
  }
}
