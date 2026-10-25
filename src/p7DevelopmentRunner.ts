import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { LocalSkillAuthority } from "./localSkillAuthority.js";
import { LocalSkillLane } from "./localSkillLane.js";
import { createHostResolvedSource } from "./localSkillSources.js";
import type { LocalSkillResult, TrustedLocalSkillPolicy } from "./localSkillTypes.js";
import {
  OllamaLocalSkillAdapter,
  P7_GENERATION_OUTPUT_TOKENS,
  P7_MAX_HTTP_REQUEST_BYTES,
  P7_PROMPT_CONFIG_CANONICAL,
  type P7PromptConfigId,
} from "./ollamaLocalSkillAdapter.js";
import {
  createLoopbackOllamaTransport,
  P6_OLLAMA_MANIFEST_SHA256,
  P6_OLLAMA_MODEL,
  type OllamaResearchTransport,
} from "./ollamaResearchAdapter.js";
import { P7LocalCallBudget } from "./p7LocalCallBudget.js";

const EXPECTED_P7_CANDIDATE_SHA256 = "4f848263aa4bf03558da4efee7e284e9a1ac623455ab85b636d620988ad67152";
const EXPECTED_P6_CORE_SHA256 = "754391021dfa974659c4903367f9b8b2fd8c9c2690238e87c100cc0019b9af9d";
const EXPECTED_P6_ADAPTER_SHA256 = "d6ef85281731b73b79393b615943563956a5b7ddd1906cb6da8494796d164401";
type HistoricalPromptConfigId = Extract<P7PromptConfigId, "P7_SKILLS_A" | "P7_SKILLS_B">;
const EXPECTED_PROMPT_HASHES: Readonly<Record<HistoricalPromptConfigId, string>> = Object.freeze({
  P7_SKILLS_A: "aecd1de45873952ab932c7591de9cf40b416277ae161b7b52159d38d2199012e",
  P7_SKILLS_B: "086f03498699736663a2f5c0874bcf7e2d6ebe41893eb1b3441adab9d9d4adca",
});
const CONFIGS = ["P7_SKILLS_A", "P7_SKILLS_B"] as const;
const P7_CANDIDATE_FILES = [
  "README.md", "config/p7-prompt-configs.json", "config/p7-skill-catalog.json", "docs/ARCHITECTURE.md",
  "docs/P7-DEVELOPMENT-CASES.json", "docs/P7-LOCAL-SKILLS-CONTRACT.md", "src/localSkillAuthority.ts",
  "src/localSkillCatalog.ts", "src/localSkillLane.ts", "src/localSkillModel.ts", "src/localSkillSources.ts",
  "src/localSkillTypes.ts", "src/ollamaLocalSkillAdapter.ts", "src/localUiServer.ts", "tests/localSkillCatalog.test.ts",
  "tests/localSkillLane.test.ts", "tests/localSkillSources.test.ts", "tests/ollamaLocalSkillAdapter.test.ts",
  "tests/localUiServer.test.ts", "ui/app.js", "ui/index.html", "ui/styles.css",
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

type DevelopmentReport = {
  schemaVersion: 1;
  candidateSha256: string;
  p6CoreSha256: string;
  p6AdapterSha256: string;
  promptHashes: Readonly<Record<HistoricalPromptConfigId, string>>;
  model: string;
  startedAt: string;
  completedAt: string;
  reservedPostsBefore: number;
  reservedPostsAfter: number;
  runPosts: number;
  stopped: null | { configId: P7PromptConfigId; caseId: string; reason: string };
  configurations: readonly {
    configId: P7PromptConfigId;
    cases: readonly {
      caseId: string;
      kind: string;
      expectedSkills: readonly string[];
      criteria: readonly string[];
      sourceContentReads: number;
      localPosts: number;
      result: LocalSkillResult;
    }[];
  }[];
};

function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
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
  const [candidate, core, adapter] = await Promise.all([
    orderedFileHash(root, P7_CANDIDATE_FILES),
    orderedFileHash(root, P6_CORE_FILES),
    orderedFileHash(root, P6_ADAPTER_FILES),
  ]);
  if (candidate !== EXPECTED_P7_CANDIDATE_SHA256 || core !== EXPECTED_P6_CORE_SHA256 || adapter !== EXPECTED_P6_ADAPTER_SHA256) {
    throw new Error("frozen source hash mismatch; stop before local inference");
  }
  for (const configId of CONFIGS) {
    if (sha256(P7_PROMPT_CONFIG_CANONICAL[configId]) !== EXPECTED_PROMPT_HASHES[configId]) {
      throw new Error("prompt hash mismatch; stop before local inference");
    }
  }
}

function policyFor(testCase: DevelopmentCase): TrustedLocalSkillPolicy {
  const readableSourceIds = testCase.authorization?.readableSourceIds ?? testCase.documents.map(({ id }) => id);
  return {
    schemaVersion: 1,
    policyId: `p7-development-${testCase.id}`,
    organizationId: "p7-lab-org-a",
    principalId: "p7-development-runner",
    sessionId: `p7-development-${testCase.id}`,
    authorizationVersion: 1,
    purpose: "SYNTHETIC_LOCAL_EDITORIAL",
    contentScope: "SYNTHETIC_DEMO_ONLY",
    executableSkillIds: ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"],
    readableSourceIds,
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

function stageFromBody(body: string): "proposal" | "generation" {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new Error("unexpected local request body; stop before POST"); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("unexpected local request body; stop before POST");
  const options = (parsed as { options?: unknown }).options;
  if (typeof options !== "object" || options === null || Array.isArray(options)) throw new Error("unexpected local request body; stop before POST");
  const count = (options as { num_predict?: unknown }).num_predict;
  if (count === 128) return "proposal";
  if (count === P7_GENERATION_OUTPUT_TOKENS) return "generation";
  throw new Error("unexpected local request stage; stop before POST");
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

export async function runP7Development(options: {
  root: string;
  outputPath: string;
  ledgerPath: string;
  transport?: OllamaResearchTransport;
}): Promise<DevelopmentReport> {
  await verifyFrozenInputs(options.root);
  const parsedCases: unknown = JSON.parse(await readFile(resolve(options.root, "docs/P7-DEVELOPMENT-CASES.json"), "utf8"));
  if (!validCases(parsedCases)) throw new Error("development cases changed; stop before local inference");
  const budget = new P7LocalCallBudget(options.ledgerPath);
  const reservedPostsBefore = await budget.readReservedPosts();
  await budget.claimDevelopmentOnce();
  const startedAt = new Date().toISOString();
  let runPosts = 0;
  let stopped: DevelopmentReport["stopped"] = null;
  const configurations: DevelopmentReport["configurations"][number][] = [];
  const baseTransport = options.transport ?? createLoopbackOllamaTransport();

  outer: for (const configId of CONFIGS) {
    let configPosts = 0;
    const caseReports: DevelopmentReport["configurations"][number]["cases"][number][] = [];
    configurations.push({ configId, cases: caseReports });
    for (const testCase of parsedCases.cases) {
      let sourceContentReads = 0;
      let casePosts = 0;
      const countedTransport: OllamaResearchTransport = async (request, transportOptions) => {
        const stage = stageFromBody(request.body);
        if (runPosts >= 18 || configPosts >= 9 || casePosts >= testCase.maxModelCallsPerConfig) {
          throw new Error("preregistered development POST cap reached; stop before POST");
        }
        await budget.reserve({ phase: "development", promptConfigId: configId, caseId: testCase.id, stage });
        runPosts += 1;
        configPosts += 1;
        casePosts += 1;
        return await baseTransport(request, transportOptions);
      };
      const adapter = new OllamaLocalSkillAdapter(countedTransport, {
        enabled: true,
        verifiedManifestSha256: P6_OLLAMA_MANIFEST_SHA256,
        promptConfigId: configId,
        timeoutMs: 20_000,
        maxRequestBytes: P7_MAX_HTTP_REQUEST_BYTES,
        maxResponseBytes: 8_192,
        maxOutputTokens: P7_GENERATION_OUTPUT_TOKENS,
      });
      const sources = testCase.documents.map((document) => createHostResolvedSource({
        id: document.id,
        organizationId: document.organizationId,
        title: document.id,
      }, () => {
        sourceContentReads += 1;
        return document.paragraphs.map(({ text }) => text).join("\n\n");
      }));
      const result = await new LocalSkillLane(new LocalSkillAuthority(policyFor(testCase)), adapter).run({
        schemaVersion: 1,
        requestNonce: `development-${configId}-${testCase.id}`,
        text: testCase.request,
        sources,
      });
      caseReports.push({
        caseId: testCase.id,
        kind: testCase.kind,
        expectedSkills: testCase.expectedSkills,
        criteria: testCase.criteria,
        sourceContentReads,
        localPosts: casePosts,
        result,
      });
      if (testCase.id === "P7-11" && (sourceContentReads !== 0 || casePosts !== 0 || result.ok || result.reasonCode !== "LOCAL_SKILL_SOURCE_DENIED")) {
        stopped = { configId, caseId: testCase.id, reason: "host source-denial invariant failed" };
        break outer;
      }
      if (!result.ok && result.reasonCode === "LOCAL_SKILL_MODEL_ERROR") {
        stopped = { configId, caseId: testCase.id, reason: "transport, timeout, or unknown model execution failure" };
        break outer;
      }
    }
  }
  const reservedPostsAfter = await budget.readReservedPosts();
  const report: DevelopmentReport = {
    schemaVersion: 1,
    candidateSha256: EXPECTED_P7_CANDIDATE_SHA256,
    p6CoreSha256: EXPECTED_P6_CORE_SHA256,
    p6AdapterSha256: EXPECTED_P6_ADAPTER_SHA256,
    promptHashes: EXPECTED_PROMPT_HASHES,
    model: P6_OLLAMA_MODEL,
    startedAt,
    completedAt: new Date().toISOString(),
    reservedPostsBefore,
    reservedPostsAfter,
    runPosts,
    stopped,
    configurations,
  };
  await writeProtectedJson(options.outputPath, report);
  return report;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const root = resolve(process.cwd());
  await verifyFrozenInputs(root);
  const fixture: unknown = JSON.parse(await readFile(resolve(root, "docs/P7-DEVELOPMENT-CASES.json"), "utf8"));
  if (!validCases(fixture)) throw new Error("development cases changed; stop before local inference");
  if (mode === "--preflight") {
    process.stdout.write(`P7 development preflight passed: candidate ${EXPECTED_P7_CANDIDATE_SHA256}, 6 cases, 0 POSTs.\n`);
    return;
  }
  if (mode !== "--run-development") throw new Error("use --preflight or --run-development explicitly");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const report = await runP7Development({
    root,
    outputPath: resolve(root, `.local/p7/development-${stamp}.json`),
    ledgerPath: resolve(root, ".local/p7/call-budget.json"),
  });
  process.stdout.write(`P7 development run stored locally: ${report.runPosts} counted POSTs; stopped=${report.stopped !== null}.\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "P7 development runner failed"}\n`);
    process.exitCode = 1;
  });
}
