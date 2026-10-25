import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { LocalSkillAuthority } from "./localSkillAuthority.js";
import { LocalSkillLane } from "./localSkillLane.js";
import { createHostResolvedSource } from "./localSkillSources.js";
import type { LocalSkillModel, LocalSkillResult, TrustedLocalSkillPolicy } from "./localSkillTypes.js";
import {
  OllamaLocalSkillAdapter,
  P7_GENERATION_OUTPUT_TOKENS,
  P7_MAX_HTTP_REQUEST_BYTES,
  P7_PROMPT_CONFIG_CANONICAL,
} from "./ollamaLocalSkillAdapter.js";
import {
  createLoopbackOllamaTransport,
  P6_OLLAMA_MANIFEST_SHA256,
  P6_OLLAMA_MODEL,
  type OllamaResearchTransport,
} from "./ollamaResearchAdapter.js";
import { P7LocalCallBudget } from "./p7LocalCallBudget.js";

const EXPECTED_ROUTE_V2_CORE_SHA256 = "a356c8a2cdbe52b2ac69645370030cd025c27b680e5aee948560e4d69f1bb9fd";
const EXPECTED_ROUTE_V2_PROMPT_SHA256 = "078c9691deaf0662b3df39187647a473d48a0c451a8f68f9df3ce4944d727474";
const EXPECTED_DEVELOPMENT_CASES_SHA256 = "584d63ad25658334c0fa3035b7e5ea4d810db0e33659ad86a266d471d6ba3a14";
const EXPECTED_PROTOCOL_AMENDMENT_SHA256 = "48a0f4cbece22c424057d9613ea4b6ce90a13e0c57e928d2d51d43eed4c9c689";
const EXPECTED_P6_CORE_SHA256 = "754391021dfa974659c4903367f9b8b2fd8c9c2690238e87c100cc0019b9af9d";
const EXPECTED_P6_ADAPTER_SHA256 = "d6ef85281731b73b79393b615943563956a5b7ddd1906cb6da8494796d164401";
const ROUTE_V2_CORE_FILES = [
  "config/p7-prompt-configs.json",
  "docs/P7-LOCAL-SKILLS-CONTRACT.md",
  "docs/P7-ROUTE-V2-AMENDMENT.md",
  "src/localSkillLane.ts",
  "src/localSkillModel.ts",
  "src/ollamaLocalSkillAdapter.ts",
  "tests/localSkillLane.test.ts",
  "tests/ollamaLocalSkillAdapter.test.ts",
] as const;
const P6_CORE_FILES = [
  "src/index.ts", "src/localResearchAuthority.ts", "src/localResearchLane.ts", "src/localResearchTypes.ts",
  "src/scopeBoundIdentifierRegister.ts", "tests/localResearchLane.test.ts", "tests/scopeBoundIdentifierRegister.test.ts",
] as const;
const P6_ADAPTER_FILES = ["src/ollamaResearchAdapter.ts", "tests/ollamaResearchAdapter.test.ts"] as const;

type DevelopmentCase = {
  id: string;
  split: "development";
  kind: string;
  expectedSkills: readonly string[];
  request: string;
  documents: readonly {
    id: string;
    organizationId: string;
    paragraphs: readonly { id: string; text: string }[];
  }[];
  criteria: readonly string[];
  maxModelCallsPerConfig: number;
  authorization?: { purpose: "SYNTHETIC_LOCAL_EDITORIAL"; readableSourceIds: readonly string[] };
};

type ProposalCapture =
  | { readonly captured: true; readonly byteLength: number; readonly value: { readonly schemaVersion: 1; readonly route: string } }
  | { readonly captured: false; readonly reason: "not_closed_route_object" | "unknown_route" | "too_large"; readonly topLevelKeys: readonly ("schemaVersion" | "route" | "unknown")[] };

type CorrectionReport = {
  readonly schemaVersion: 1;
  readonly amendmentSha256: string;
  readonly routeV2CoreSha256: string;
  readonly routeV2PromptSha256: string;
  readonly p6CoreSha256: string;
  readonly p6AdapterSha256: string;
  readonly model: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly reservedPostsBefore: number;
  readonly reservedPostsAfter: number;
  readonly runPosts: number;
  readonly stopped: null | { readonly caseId: string; readonly reason: string };
  readonly cases: readonly {
    readonly caseId: string;
    readonly kind: string;
    readonly expectedSkills: readonly string[];
    readonly criteria: readonly string[];
    readonly sourceContentReads: number;
    readonly localPosts: number;
    readonly proposal: ProposalCapture | null;
    readonly result: LocalSkillResult;
  }[];
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function orderedFileHash(root: string, files: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const path of files) {
    hash.update(path);
    hash.update(Buffer.from([0]));
    hash.update(await readFile(resolve(root, path)));
  }
  return hash.digest("hex");
}

function validCases(value: unknown): value is { cases: DevelopmentCase[] } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const cases = (value as { cases?: unknown }).cases;
  if (!Array.isArray(cases) || cases.length !== 6) return false;
  const expectedIds = ["P7-01", "P7-02", "P7-05", "P7-06", "P7-09", "P7-11"];
  return cases.every((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
    const candidate = item as DevelopmentCase;
    return candidate.id === expectedIds[index] && candidate.split === "development" && typeof candidate.kind === "string" &&
      typeof candidate.request === "string" && Array.isArray(candidate.expectedSkills) && Array.isArray(candidate.documents) &&
      Array.isArray(candidate.criteria) && Number.isInteger(candidate.maxModelCallsPerConfig) &&
      candidate.maxModelCallsPerConfig >= 0 && candidate.maxModelCallsPerConfig <= 2;
  });
}

async function verifyFrozenInputs(root: string): Promise<void> {
  const [routeCore, p6Core, p6Adapter, developmentCases] = await Promise.all([
    orderedFileHash(root, ROUTE_V2_CORE_FILES),
    orderedFileHash(root, P6_CORE_FILES),
    orderedFileHash(root, P6_ADAPTER_FILES),
    readFile(resolve(root, "docs/P7-DEVELOPMENT-CASES.json")),
  ]);
  if (routeCore !== EXPECTED_ROUTE_V2_CORE_SHA256 || p6Core !== EXPECTED_P6_CORE_SHA256 ||
      p6Adapter !== EXPECTED_P6_ADAPTER_SHA256 ||
      sha256(developmentCases) !== EXPECTED_DEVELOPMENT_CASES_SHA256 ||
      sha256(P7_PROMPT_CONFIG_CANONICAL.P7_ROUTE_V2) !== EXPECTED_ROUTE_V2_PROMPT_SHA256) {
    throw new Error("route-v2 frozen input mismatch; stop before local inference");
  }
}

function policyFor(testCase: DevelopmentCase): TrustedLocalSkillPolicy {
  return {
    schemaVersion: 1,
    policyId: `p7-route-v2-${testCase.id}`,
    organizationId: "p7-lab-org-a",
    principalId: "p7-route-v2-runner",
    sessionId: `p7-route-v2-${testCase.id}`,
    authorizationVersion: 1,
    purpose: "SYNTHETIC_LOCAL_EDITORIAL",
    contentScope: "SYNTHETIC_DEMO_ONLY",
    executableSkillIds: ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"],
    readableSourceIds: testCase.authorization?.readableSourceIds ?? testCase.documents.map(({ id }) => id),
    allowInlineSyntheticAttachments: false,
    allowSensitiveSyntheticExamples: true,
    actions: false,
    persistence: false,
    limits: {
      maxRequestBytes: 8_192,
      maxSourceCount: 4,
      maxSourceTitleBytes: 128,
      maxSourceBytes: 12_288,
      maxAggregateSourceBytes: 24_576,
      maxParagraphCount: 64,
      maxParagraphBytes: 4_096,
      maxProposalBytes: 2_048,
      maxOutputBytes: 8_192,
      maxModelContextBytes: 12_288,
      maxModelOutputTokens: 768,
    },
  };
}

export function captureP7BenchmarkProposal(value: unknown): ProposalCapture {
  const rawKeys = typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>)
    : [];
  const topLevelKeys: ("schemaVersion" | "route" | "unknown")[] = [];
  if (rawKeys.includes("schemaVersion")) topLevelKeys.push("schemaVersion");
  if (rawKeys.includes("route")) topLevelKeys.push("route");
  if (rawKeys.some((key) => key !== "schemaVersion" && key !== "route")) topLevelKeys.push("unknown");
  let bytes = Number.POSITIVE_INFINITY;
  try { bytes = Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { /* closed failure below */ }
  if (bytes > 512) return { captured: false, reason: "too_large", topLevelKeys };
  if (typeof value !== "object" || value === null || Array.isArray(value) || rawKeys.length !== 2 ||
      !rawKeys.includes("schemaVersion") || !rawKeys.includes("route") ||
      (value as Record<string, unknown>).schemaVersion !== 1 || typeof (value as Record<string, unknown>).route !== "string" ||
      Buffer.byteLength((value as { route: string }).route, "utf8") > 64) {
    return { captured: false, reason: "not_closed_route_object", topLevelKeys };
  }
  const route = (value as { route: string }).route;
  if (!["UNDERSTAND_DOCUMENTS", "COMPOSE_TEXT", "UNDERSTAND_THEN_COMPOSE", "CLARIFY", "UNSUPPORTED"].includes(route)) {
    return { captured: false, reason: "unknown_route", topLevelKeys };
  }
  return {
    captured: true,
    byteLength: bytes,
    value: Object.freeze({ schemaVersion: 1, route }),
  };
}

function stageFromBody(body: string): "proposal" | "generation" {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new Error("unexpected route-v2 request body; stop before POST"); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("unexpected route-v2 request body; stop before POST");
  const options = (parsed as { options?: unknown }).options;
  if (typeof options !== "object" || options === null || Array.isArray(options)) throw new Error("unexpected route-v2 request body; stop before POST");
  const count = (options as { num_predict?: unknown }).num_predict;
  if (count === 128) return "proposal";
  if (count === P7_GENERATION_OUTPUT_TOKENS) return "generation";
  throw new Error("unexpected route-v2 request stage; stop before POST");
}

async function writeProtectedJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function runP7CorrectionDevelopment(options: {
  readonly root: string;
  readonly outputPath: string;
  readonly ledgerPath: string;
  readonly transport?: OllamaResearchTransport;
}): Promise<CorrectionReport> {
  await verifyFrozenInputs(options.root);
  const fixture: unknown = JSON.parse(await readFile(resolve(options.root, "docs/P7-DEVELOPMENT-CASES.json"), "utf8"));
  if (!validCases(fixture)) throw new Error("development cases changed; stop before route-v2 inference");
  const budget = new P7LocalCallBudget(options.ledgerPath);
  const reservedPostsBefore = await budget.readReservedPosts();
  await budget.claimCorrectionDevelopmentOnce();
  const startedAt = new Date().toISOString();
  const baseTransport = options.transport ?? createLoopbackOllamaTransport();
  let runPosts = 0;
  let stopped: CorrectionReport["stopped"] = null;
  const cases: CorrectionReport["cases"][number][] = [];

  for (const testCase of fixture.cases) {
    let sourceContentReads = 0;
    let casePosts = 0;
    let proposal: ProposalCapture | null = null;
    const countedTransport: OllamaResearchTransport = async (request, transportOptions) => {
      const stage = stageFromBody(request.body);
      if (runPosts >= 9 || casePosts >= testCase.maxModelCallsPerConfig) {
        throw new Error("route-v2 preregistered POST cap reached; stop before POST");
      }
      await budget.reserve({
        phase: "correction-development",
        promptConfigId: "P7_ROUTE_V2",
        caseId: testCase.id,
        stage,
      });
      runPosts += 1;
      casePosts += 1;
      return await baseTransport(request, transportOptions);
    };
    const adapter = new OllamaLocalSkillAdapter(countedTransport, {
      enabled: true,
      verifiedManifestSha256: P6_OLLAMA_MANIFEST_SHA256,
      promptConfigId: "P7_ROUTE_V2",
      timeoutMs: 20_000,
      maxRequestBytes: P7_MAX_HTTP_REQUEST_BYTES,
      maxResponseBytes: 8_192,
      maxOutputTokens: P7_GENERATION_OUTPUT_TOKENS,
    });
    const capturingModel: LocalSkillModel = {
      name: adapter.name,
      get proposalCallCount() { return adapter.proposalCallCount; },
      get generationCallCount() { return adapter.generationCallCount; },
      async propose(input, callOptions) {
        const raw = await adapter.propose(input, callOptions);
        proposal = captureP7BenchmarkProposal(raw);
        return raw;
      },
      async generate(input, callOptions) { return await adapter.generate(input, callOptions); },
    };
    const sources = testCase.documents.map((document) => createHostResolvedSource({
      id: document.id,
      organizationId: document.organizationId,
      title: document.id,
    }, () => {
      sourceContentReads += 1;
      return document.paragraphs.map(({ text }) => text).join("\n\n");
    }));
    const result = await new LocalSkillLane(new LocalSkillAuthority(policyFor(testCase)), capturingModel).run({
      schemaVersion: 1,
      requestNonce: `route-v2-${testCase.id}`,
      text: testCase.request,
      sources,
    });
    cases.push({
      caseId: testCase.id,
      kind: testCase.kind,
      expectedSkills: testCase.expectedSkills,
      criteria: testCase.criteria,
      sourceContentReads,
      localPosts: casePosts,
      proposal,
      result,
    });
    if (testCase.id === "P7-11" && (sourceContentReads !== 0 || casePosts !== 0 || proposal !== null ||
        result.ok || result.reasonCode !== "LOCAL_SKILL_SOURCE_DENIED")) {
      stopped = { caseId: testCase.id, reason: "host source-denial invariant failed" };
      break;
    }
    if (!result.ok && result.reasonCode === "LOCAL_SKILL_MODEL_ERROR") {
      stopped = { caseId: testCase.id, reason: "transport, timeout, or unknown model execution failure" };
      break;
    }
  }
  const report: CorrectionReport = {
    schemaVersion: 1,
    amendmentSha256: EXPECTED_PROTOCOL_AMENDMENT_SHA256,
    routeV2CoreSha256: EXPECTED_ROUTE_V2_CORE_SHA256,
    routeV2PromptSha256: EXPECTED_ROUTE_V2_PROMPT_SHA256,
    p6CoreSha256: EXPECTED_P6_CORE_SHA256,
    p6AdapterSha256: EXPECTED_P6_ADAPTER_SHA256,
    model: P6_OLLAMA_MODEL,
    startedAt,
    completedAt: new Date().toISOString(),
    reservedPostsBefore,
    reservedPostsAfter: await budget.readReservedPosts(),
    runPosts,
    stopped,
    cases,
  };
  await writeProtectedJson(options.outputPath, report);
  return report;
}

async function main(): Promise<void> {
  const root = resolve(process.cwd());
  await verifyFrozenInputs(root);
  const fixture: unknown = JSON.parse(await readFile(resolve(root, "docs/P7-DEVELOPMENT-CASES.json"), "utf8"));
  if (!validCases(fixture)) throw new Error("development cases changed; stop before route-v2 inference");
  if (process.argv[2] === "--preflight") {
    process.stdout.write(`P7 route-v2 correction preflight passed: core ${EXPECTED_ROUTE_V2_CORE_SHA256}, 6 cases, 0 POSTs.\n`);
    return;
  }
  if (process.argv[2] !== "--run-correction-development") {
    throw new Error("use --preflight or --run-correction-development explicitly");
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const report = await runP7CorrectionDevelopment({
    root,
    outputPath: resolve(root, `.local/p7/correction-development-${stamp}.json`),
    ledgerPath: resolve(root, ".local/p7/call-budget.json"),
  });
  process.stdout.write(`P7 route-v2 correction stored locally: ${report.runPosts} counted POSTs; stopped=${report.stopped !== null}.\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "P7 route-v2 runner failed"}\n`);
    process.exitCode = 1;
  });
}
