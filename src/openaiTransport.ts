import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  OPENAI_DEMO_MAX_OUTPUT_TOKENS,
  OPENAI_DEMO_MODEL,
  type OpenAIBudgetLedger,
  type OpenAIUsage,
} from "./openaiBudget.js";
import { ProviderAdapterError, type ProviderTransport, type TransportRequest } from "./transportProvider.js";

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const OPENAI_RAW_RESPONSE_MAX_BYTES = 65_536;
const OPENAI_HTTP_REQUEST_MAX_BYTES = 49_152;
const CONFIG_KEYS = new Set(["enabled", "apiKey", "budget", "fetchImpl"]);

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface TrustedOpenAITransportConfig {
  enabled: boolean;
  apiKey?: string;
  budget: OpenAIBudgetLedger;
  fetchImpl?: FetchLike;
}

const RESPONSE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1, maxLength: 8_192 },
    citations: {
      type: "array",
      maxItems: 16,
      items: { type: "string", minLength: 1, maxLength: 256 },
    },
  },
  required: ["text", "citations"],
});

const SYSTEM_INSTRUCTION = [
  "You are the final response generator for an offline-tested privacy-gated prototype.",
  "The JSON in the user message has already passed the host policy and privacy gates.",
  "Use only the supplied selected documents for factual answers. Never invent a source.",
  "For an ask task, cite only IDs from the supplied documents. For a source-free draft, citations must be empty.",
  "Do not call tools, fetch data, send messages, or perform any action.",
  "Return only the required structured response.",
].join(" ");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strictConfig(value: TrustedOpenAITransportConfig) {
  if (!isRecord(value) || Object.keys(value).some((key) => !CONFIG_KEYS.has(key)) ||
      typeof value.enabled !== "boolean" || !value.budget || typeof value.budget.reserve !== "function" ||
      (value.fetchImpl !== undefined && typeof value.fetchImpl !== "function")) {
    throw new Error("Invalid trusted OpenAI transport configuration");
  }
  if (value.enabled && (typeof value.apiKey !== "string" || value.apiKey.trim().length < 1 || /[\r\n]/.test(value.apiKey))) {
    throw new Error("Invalid trusted OpenAI transport configuration");
  }
  return {
    enabled: value.enabled,
    apiKey: value.apiKey ?? "",
    budget: value.budget,
    fetchImpl: value.fetchImpl ?? fetch,
  };
}

function requestKey(request: TransportRequest): string {
  return createHash("sha256").update(JSON.stringify(request), "utf8").digest("hex");
}

function requestBody(request: TransportRequest) {
  return {
    model: OPENAI_DEMO_MODEL,
    service_tier: "default",
    store: false,
    background: false,
    stream: false,
    reasoning: { effort: "none" },
    max_output_tokens: OPENAI_DEMO_MAX_OUTPUT_TOKENS,
    truncation: "disabled",
    tools: [],
    tool_choice: "none",
    input: [
      { role: "developer", content: [{ type: "input_text", text: SYSTEM_INSTRUCTION }] },
      { role: "user", content: [{ type: "input_text", text: JSON.stringify(request) }] },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "privacy_aware_agent_output",
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  };
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > OPENAI_RAW_RESPONSE_MAX_BYTES) {
    throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_TOO_LARGE");
  }
  if (!response.body) throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > OPENAI_RAW_RESPONSE_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_TOO_LARGE");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
  }
}

function readUsage(body: Record<string, unknown>): OpenAIUsage {
  const usage = body.usage;
  if (!isRecord(usage) || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens)) {
    throw new ProviderAdapterError("BLOCK_PROVIDER_USAGE_UNKNOWN");
  }
  const details = usage.output_tokens_details;
  const reasoningTokens = details === undefined
    ? 0
    : isRecord(details) && Number.isSafeInteger(details.reasoning_tokens)
      ? details.reasoning_tokens as number
      : Number.NaN;
  if (!Number.isSafeInteger(reasoningTokens)) throw new ProviderAdapterError("BLOCK_PROVIDER_USAGE_UNKNOWN");
  return {
    inputTokens: usage.input_tokens as number,
    outputTokens: usage.output_tokens as number,
    reasoningTokens,
  };
}

function extractStructuredOutput(body: Record<string, unknown>): unknown {
  if (body.status !== "completed" || body.model !== OPENAI_DEMO_MODEL || body.service_tier !== "default" ||
      body.store !== false || !Array.isArray(body.output)) {
    throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
  }
  const texts: string[] = [];
  for (const item of body.output) {
    if (!isRecord(item) || (item.type !== "message" && item.type !== "reasoning")) {
      throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
    }
    if (item.type === "reasoning") continue;
    if (!Array.isArray(item.content)) throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
    for (const content of item.content) {
      if (!isRecord(content) || content.type !== "output_text" || typeof content.text !== "string") {
        throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
      }
      texts.push(content.text);
    }
  }
  if (texts.length !== 1) throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
  try {
    return JSON.parse(texts[0]!);
  } catch {
    throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
  }
}

function safeProviderCode(body: unknown): string {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.code !== "string") return "";
  return /^[a-z0-9_.-]{1,80}$/i.test(body.error.code) ? body.error.code : "";
}

export function createOpenAIResponsesTransport(untrustedConfig: TrustedOpenAITransportConfig): ProviderTransport {
  const config = strictConfig(untrustedConfig);
  return async (request, options) => {
    if (!config.enabled) throw new ProviderAdapterError("BLOCK_PROVIDER_DISABLED");
    if (options.signal.aborted) throw new ProviderAdapterError("BLOCK_PROVIDER_CANCELLED");

    const body = requestBody(request);
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized, "utf8") > OPENAI_HTTP_REQUEST_MAX_BYTES) {
      throw new ProviderAdapterError("BLOCK_PROVIDER_REQUEST_TOO_LARGE");
    }
    const key = requestKey(request);
    await config.budget.reserve(key);
    let abortObserved: boolean = options.signal.aborted;
    const markUncertain = async () => {
      await config.budget.markUncertain(key);
    };
    let abortMark: Promise<void> | undefined;
    const onAbort = () => {
      abortObserved = true;
      abortMark = markUncertain().catch(() => undefined);
    };
    options.signal.addEventListener("abort", onAbort, { once: true });
    try {
      if (options.signal.aborted) {
        await markUncertain();
        throw new ProviderAdapterError("BLOCK_PROVIDER_CANCELLED");
      }
      const response = await config.fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        redirect: "error",
        signal: options.signal,
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: serialized,
      });
      const rawBody = await boundedJson(response);
      if (!response.ok) {
        await markUncertain();
        const code = safeProviderCode(rawBody);
        return {
          status: response.status,
          body: code ? { error: { code } } : {},
        };
      }
      if (!isRecord(rawBody)) throw new ProviderAdapterError("BLOCK_PROVIDER_RESPONSE_INVALID");
      const usage = readUsage(rawBody);
      const output = extractStructuredOutput(rawBody);
      await config.budget.confirm(key, usage);
      if (abortObserved) {
        if (abortMark) await abortMark;
        await markUncertain();
        throw new ProviderAdapterError("BLOCK_PROVIDER_CANCELLED");
      }
      return { status: 200, body: output };
    } catch (error) {
      await markUncertain();
      if (error instanceof ProviderAdapterError) throw error;
      throw new ProviderAdapterError("BLOCK_PROVIDER_TRANSPORT");
    } finally {
      options.signal.removeEventListener("abort", onAbort);
      if (abortMark) await abortMark;
    }
  };
}
