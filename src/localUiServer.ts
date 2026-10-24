import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createExactSyntheticEvidenceAssessor } from "./demoEvidence.js";
import { DEMO_POLICY } from "./demoPolicy.js";
import { MockProvider } from "./mockProvider.js";
import { PrivacyAwareAgent } from "./orchestrator.js";
import type { AgentRequest, AgentResult, TaskKind } from "./types.js";

export const LOCAL_UI_HOST = "127.0.0.1";
export const LOCAL_UI_PORT = 4317;
export const LOCAL_UI_ORIGIN = `http://${LOCAL_UI_HOST}:${LOCAL_UI_PORT}`;
const MAX_BODY_BYTES = 12_288;
const REQUEST_TIMEOUT_MS = 5_000;
const ALLOWED_SOURCES = new Set(["help-hours", "help-reset", "meeting-preparation"]);

const APPROVED_TEMPLATES = Object.freeze({
  "demo-a": Object.freeze({
    task: "ask",
    text: "List only the approved preparation steps for the synthetic board meeting.",
    sourceIds: Object.freeze(["meeting-preparation"]),
  }),
  p01: Object.freeze({
    task: "ask",
    text: "Which preparation step comes after creating the agenda, and what is the final step? Answer only from the approved page.",
    sourceIds: Object.freeze(["meeting-preparation"]),
  }),
} satisfies Record<string, AgentRequest>);

type TemplateId = keyof typeof APPROVED_TEMPLATES;
type UiCommand = { templateId: TemplateId } | AgentRequest;

export interface UiResponse {
  ok: boolean;
  message: string;
  citations: readonly string[];
  provider?: "MOCK_OFFLINE";
}

export type OfflineUiRunner = (command: UiCommand, signal: AbortSignal) => Promise<UiResponse>;

const STATIC_FILES = Object.freeze({
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8" },
} as const);

function neutralMessage(result: AgentResult): string {
  if (result.ok) return result.output.text;
  if (result.reasonCode === "BLOCK_EVIDENCE_REQUIRED") return "This question needs an approved synthetic source.";
  if (result.reasonCode === "BLOCK_EVIDENCE_INSUFFICIENT") {
    return "The selected synthetic source is not confirmed for this request.";
  }
  if (["BLOCK_HEALTH_DATA", "BLOCK_CHILD_DATA", "BLOCK_SENSITIVE_PERSONNEL", "BLOCK_CREDENTIAL",
    "BLOCK_FINANCIAL_IDENTIFIER", "BLOCK_DIRECT_PERSON_NAME", "BLOCK_UNCERTAIN_CONTEXT",
    "BLOCK_FINAL_CONTEXT_NOT_SAFE"].includes(result.reasonCode)) {
    return "This request was blocked by the local privacy gate. Please use only general synthetic information.";
  }
  return "This request could not be processed safely.";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function parseCommand(value: unknown): UiCommand | undefined {
  if (!isPlainObject(value)) return undefined;
  if (exactKeys(value, ["templateId"])) {
    return value.templateId === "demo-a" || value.templateId === "p01"
      ? { templateId: value.templateId }
      : undefined;
  }
  if (!exactKeys(value, ["sourceIds", "task", "text"])) return undefined;
  if (!(["ask", "draft", "summarize"] as unknown[]).includes(value.task) ||
      typeof value.text !== "string" || value.text.length === 0 ||
      Buffer.byteLength(value.text, "utf8") > DEMO_POLICY.maxInputBytes ||
      !Array.isArray(value.sourceIds) || value.sourceIds.length > ALLOWED_SOURCES.size ||
      value.sourceIds.some((id) => typeof id !== "string" || !ALLOWED_SOURCES.has(id)) ||
      new Set(value.sourceIds).size !== value.sourceIds.length) {
    return undefined;
  }
  return { task: value.task as TaskKind, text: value.text, sourceIds: [...value.sourceIds] as string[] };
}

export const runOfflineUiCommand: OfflineUiRunner = async (command, signal) => {
  const request = "templateId" in command ? APPROVED_TEMPLATES[command.templateId] : command;
  const evidence = "templateId" in command ? createExactSyntheticEvidenceAssessor(request) : undefined;
  const result = await new PrivacyAwareAgent(new MockProvider(), undefined, evidence)
    .run(DEMO_POLICY, request, { signal });
  return result.ok
    ? { ok: true, message: neutralMessage(result), citations: result.output.citations, provider: "MOCK_OFFLINE" }
    : { ok: false, message: neutralMessage(result), citations: [] };
};

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  applySecurityHeaders(response);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const declared = request.headers["content-length"];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    throw new Error("too_large");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("too_large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid_json");
  }
}

export function createLocalUiRequestHandler(runner: OfflineUiRunner = runOfflineUiCommand) {
  let busy = false;
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applySecurityHeaders(response);
    const remoteAddress = request.socket.remoteAddress;
    const expectedHost = `${LOCAL_UI_HOST}:${request.socket.localPort ?? LOCAL_UI_PORT}`;
    if (request.headers.host !== expectedHost ||
        (remoteAddress !== LOCAL_UI_HOST && remoteAddress !== `::ffff:${LOCAL_UI_HOST}`)) {
      sendJson(response, 403, { error: "Local access only." });
      return;
    }

    const url = request.url?.split("?", 1)[0] ?? "";
    if (url === "/api/run") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }
      if (request.headers.origin !== `http://${expectedHost}` ||
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "")) {
        sendJson(response, 403, { error: "Same-origin JSON requests only." });
        return;
      }
      if (busy) {
        sendJson(response, 429, { error: "The local demo is busy. Please try again." });
        return;
      }
      let command: UiCommand | undefined;
      try {
        command = parseCommand(await readJson(request));
      } catch (error) {
        sendJson(response, error instanceof Error && error.message === "too_large" ? 413 : 400,
          { error: "The request could not be read." });
        return;
      }
      if (!command) {
        sendJson(response, 400, { error: "The request format is not supported." });
        return;
      }

      // Another request may have acquired the single runner while this body was
      // still arriving. Re-check and acquire without an await between them.
      if (busy) {
        sendJson(response, 429, { error: "The local demo is busy. Please try again." });
        return;
      }
      busy = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        sendJson(response, 200, await runner(command, controller.signal));
      } catch {
        sendJson(response, 500, { error: "The local offline request could not be completed." });
      } finally {
        clearTimeout(timer);
        busy = false;
      }
      return;
    }

    const asset = STATIC_FILES[url as keyof typeof STATIC_FILES];
    if (!asset) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    const body = await readFile(new URL(`../../ui/${asset.file}`, import.meta.url));
    response.statusCode = 200;
    response.setHeader("Content-Type", asset.contentType);
    response.setHeader("Content-Length", body.length);
    response.end(request.method === "HEAD" ? undefined : body);
  };
}

export function createLocalUiServer(runner: OfflineUiRunner = runOfflineUiCommand): Server {
  const handler = createLocalUiRequestHandler(runner);
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent) sendJson(response, 500, { error: "The local server could not complete the request." });
      else response.end();
    });
  });
  server.headersTimeout = 5_000;
  server.requestTimeout = 6_000;
  server.keepAliveTimeout = 2_000;
  server.maxRequestsPerSocket = 100;
  return server;
}

export function startLocalUiServer(): Server {
  const server = createLocalUiServer();
  server.listen(LOCAL_UI_PORT, LOCAL_UI_HOST, () => {
    console.log(`PAA local offline UI: ${LOCAL_UI_ORIGIN}`);
    console.log("Press Ctrl+C to stop. Live provider access is not enabled.");
  });
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return server;
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entryPath) startLocalUiServer();
