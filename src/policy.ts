import type { AgentRequest, TaskKind, TrustedPolicyContext } from "./types.js";

const TASKS: readonly TaskKind[] = ["ask", "draft", "summarize"];
const POLICY_KEYS = new Set([
  "schemaVersion", "policyId", "tenantId", "principalId", "roleIds",
  "capabilities", "sources", "maxInputBytes",
]);
const SOURCE_KEYS = new Set(["id", "capabilities", "allowedTasks", "maxDocumentBytes"]);
const CAPABILITY_KEYS = new Set(["ask", "draft", "summarize", "actions"]);
const REQUEST_KEYS = new Set(["task", "text", "sourceIds"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function validateTrustedPolicy(value: unknown): TrustedPolicyContext {
  if (!isRecord(value) || !exactKeys(value, POLICY_KEYS)) throw new Error("invalid policy shape");
  if (value.schemaVersion !== 1) throw new Error("unsupported policy schema");
  for (const key of ["policyId", "tenantId", "principalId"] as const) {
    if (typeof value[key] !== "string" || value[key].length < 1 || value[key].length > 128) {
      throw new Error(`invalid ${key}`);
    }
  }
  if (!Array.isArray(value.roleIds) || !value.roleIds.every((role) => typeof role === "string")) {
    throw new Error("invalid roleIds");
  }
  if (!Number.isInteger(value.maxInputBytes) || (value.maxInputBytes as number) < 1 || (value.maxInputBytes as number) > 65_536) {
    throw new Error("invalid maxInputBytes");
  }
  const capabilities = value.capabilities;
  if (!isRecord(capabilities) || !exactKeys(capabilities, CAPABILITY_KEYS) || capabilities.actions !== false ||
      !TASKS.every((task) => typeof capabilities[task] === "boolean")) {
    throw new Error("invalid capabilities");
  }
  if (!Array.isArray(value.sources) || value.sources.length > 32) throw new Error("invalid sources");
  const seen = new Set<string>();
  for (const source of value.sources) {
    if (!isRecord(source) || !exactKeys(source, SOURCE_KEYS)) throw new Error("invalid source policy");
    if (typeof source.id !== "string" || source.id.length < 1 || seen.has(source.id)) throw new Error("invalid source id");
    seen.add(source.id);
    if (!Array.isArray(source.capabilities) || source.capabilities.length !== 1 || source.capabilities[0] !== "read") {
      throw new Error("source must be read-only");
    }
    if (!Array.isArray(source.allowedTasks) || !source.allowedTasks.every((task) => TASKS.includes(task as TaskKind))) {
      throw new Error("invalid source tasks");
    }
    if (!Number.isInteger(source.maxDocumentBytes) || (source.maxDocumentBytes as number) < 1 || (source.maxDocumentBytes as number) > 262_144) {
      throw new Error("invalid source size");
    }
  }
  return value as unknown as TrustedPolicyContext;
}

export function authorizeRequest(policy: TrustedPolicyContext, request: AgentRequest): void {
  if (!TASKS.includes(request.task)) throw new Error("unknown task");
  if (policy.capabilities[request.task] !== true) throw new Error("capability denied");
  if (request.sourceIds.length > 16 || new Set(request.sourceIds).size !== request.sourceIds.length) {
    throw new Error("invalid source selection");
  }
  const sources = new Map(policy.sources.map((source) => [source.id, source]));
  for (const sourceId of request.sourceIds) {
    const source = sources.get(sourceId);
    if (!source || !source.allowedTasks.includes(request.task)) throw new Error("source denied");
  }
}

export function validateTaskEvidence(request: AgentRequest): void {
  if (request.task === "ask" && request.sourceIds.length === 0) {
    throw new Error("evidence required");
  }
}

export function validateAgentRequest(value: unknown): AgentRequest {
  if (!isRecord(value) || !exactKeys(value, REQUEST_KEYS)) throw new Error("invalid request shape");
  if (typeof value.task !== "string" || !TASKS.includes(value.task as TaskKind)) throw new Error("invalid task");
  if (typeof value.text !== "string") throw new Error("invalid text");
  if (!Array.isArray(value.sourceIds) || !value.sourceIds.every((id) => typeof id === "string")) {
    throw new Error("invalid sourceIds");
  }
  return value as unknown as AgentRequest;
}
