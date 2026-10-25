import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { OllamaWorkingTimeWorkflowAdapter } from "./ollamaWorkingTimeWorkflowAdapter.js";
import { createLoopbackOllamaTransport, P6_OLLAMA_MANIFEST_SHA256, type OllamaResearchTransport } from "./ollamaResearchAdapter.js";
import { P7LocalCallBudget } from "./p7LocalCallBudget.js";
import { P8_FAILED_REPORT_SHA256, P8_WORKFLOW_CORE_SHA256, verifyP8CorrectionModelFreePreflight, verifyP8LoopbackRuntimeReady, verifyP8ModelFreePreflight } from "./p8WorkflowReadiness.js";
import { WorkingTimeContractWorkflow, WorkingTimeWorkflowAuthority, type WorkingTimeWorkflowModel } from "./workingTimeContractWorkflow.js";
import type { WorkingTimeResearchMock } from "./workingTimeResearchCatalog.js";

type ConfirmedIntent = { personId: string | null; targetWeeklyHours: number | null; effectiveDate: string | null; researchRequested: boolean | null };
type FixtureCase = { id: string; requestText: string; confirmedIntent: ConfirmedIntent; confirmedFollowup?: ConfirmedIntent; expectedFirstQuestions?: string[]; expectedModelCalls: number; expectedResearchCalls: number };
type Fixture = {
  schemaVersion: 1; split: "preregistered-development"; cases: FixtureCase[];
  source: { id: string; organizationId: string; personId: string; displayName: string; currentWeeklyHours: number; paragraphs: { id: string; text: string }[] };
};

const EXPECTED_CASE_IDS = ["WF01_COMPLETE_LOCAL", "WF02_MISSING_THEN_CONFIRMED", "WF03_COMPLETE_MOCK_RESEARCH"] as const;
export const P8_WORKFLOW_CASES_SHA256 = "84d126eb3ae5ea0132c59ae64fd894280b0a081a52441ada89c5afc381ded264";

function validIntent(value: unknown): value is ConfirmedIntent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).sort().join("|") === "effectiveDate|personId|researchRequested|targetWeeklyHours" &&
    (item.personId === null || typeof item.personId === "string") && (item.targetWeeklyHours === null || typeof item.targetWeeklyHours === "number") &&
    (item.effectiveDate === null || typeof item.effectiveDate === "string") && (item.researchRequested === null || typeof item.researchRequested === "boolean");
}

function validFixture(value: unknown): value is Fixture {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const fixture = value as Fixture;
  return fixture.schemaVersion === 1 && fixture.split === "preregistered-development" && Array.isArray(fixture.cases) && fixture.cases.length === 3 &&
    fixture.cases.every((item, index) => item.id === EXPECTED_CASE_IDS[index] && typeof item.requestText === "string" && validIntent(item.confirmedIntent) &&
      (item.confirmedFollowup === undefined || validIntent(item.confirmedFollowup)) &&
      (item.expectedFirstQuestions === undefined || (Array.isArray(item.expectedFirstQuestions) && item.expectedFirstQuestions.length > 0 && item.expectedFirstQuestions.every((question) => typeof question === "string"))) &&
      (item.confirmedFollowup === undefined) === (item.expectedFirstQuestions === undefined) && Number.isInteger(item.expectedModelCalls) && Number.isInteger(item.expectedResearchCalls)) &&
    typeof fixture.source === "object" && fixture.source !== null && Array.isArray(fixture.source.paragraphs);
}

function request(caseItem: FixtureCase, intent: ConfirmedIntent, sourceId: string) {
  return { schemaVersion: 1, organizationId: "OrgWF-A", actorId: "ActorWF-A", sessionId: "SessionWF-A", taskId: "TaskWF-A", sourceId, purpose: "SYNTHETIC_WORKING_TIME_CONTRACT_DRAFT", text: caseItem.requestText, confirmedIntent: { ...intent, templateRequested: false } };
}

function stage(body: string): "understand" | "draft" {
  const parsed = JSON.parse(body) as { options?: { num_predict?: unknown } };
  if (parsed.options?.num_predict === 256) return "understand";
  if (parsed.options?.num_predict === 768) return "draft";
  throw new Error("unexpected P8 model stage; stop before POST");
}

export function shouldRunP8ConfirmedFollowup(first: unknown, expectedQuestions: readonly string[]): boolean {
  if (typeof first !== "object" || first === null || Array.isArray(first)) return false;
  const item = first as { ok?: unknown; kind?: unknown; questions?: unknown };
  return item.ok === true && item.kind === "clarification" && Array.isArray(item.questions) &&
    item.questions.length === expectedQuestions.length && item.questions.every((question, index) => question === expectedQuestions[index]);
}

async function writeProtected(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}

export async function runP8WorkflowDevelopment(options: {
  root: string; ledgerPath: string; runtimeMetadataPath: string; protocolPath: string; outputPath: string; transport?: OllamaResearchTransport;
  mode?: "initial" | "fieldset-correction";
  historicalReportPath?: string;
  historicalSourceArchivePath?: string;
}) {
  const mode = options.mode ?? "initial";
  if (mode === "fieldset-correction") {
    if (!options.historicalReportPath || !options.historicalSourceArchivePath) throw new Error("P8 correction evidence paths missing; stop before runtime or claim");
    await verifyP8CorrectionModelFreePreflight({ root: options.root, correctionProtocolPath: options.protocolPath, historicalReportPath: options.historicalReportPath, historicalSourceArchivePath: options.historicalSourceArchivePath, ledgerPath: options.ledgerPath });
  } else await verifyP8ModelFreePreflight({ root: options.root, protocolPath: options.protocolPath, ledgerPath: options.ledgerPath });
  const runtimeMetadataBytes = await readFile(options.runtimeMetadataPath);
  verifyP8LoopbackRuntimeReady(JSON.parse(runtimeMetadataBytes.toString("utf8")));
  const fixtureBytes = await readFile(resolve(options.root, "docs/P8-WORKFLOW-CASES.json"));
  if (createHash("sha256").update(fixtureBytes).digest("hex") !== P8_WORKFLOW_CASES_SHA256) throw new Error("P8 workflow cases are not frozen; stop before claim");
  const fixture: unknown = JSON.parse(fixtureBytes.toString("utf8"));
  if (!validFixture(fixture)) throw new Error("P8 workflow fixture invalid; stop before claim");
  const budget = new P7LocalCallBudget(options.ledgerPath);
  const before = await budget.readReservedPosts();
  if (mode === "fieldset-correction") {
    await budget.claimWorkingTimeWorkflowCorrectionOnce({ historicalReportSha256: P8_FAILED_REPORT_SHA256, correctedCoreSha256: P8_WORKFLOW_CORE_SHA256, runtimeMetadataSha256: createHash("sha256").update(runtimeMetadataBytes).digest("hex") });
  } else await budget.claimWorkingTimeWorkflowOnce();
  const baseTransport = options.transport ?? createLoopbackOllamaTransport();
  const runPostLimit = mode === "fieldset-correction" ? 7 : 8;
  let activeCaseId = "";
  let activeModelRequests: { stage: "understand" | "draft"; headers: { "content-type": "application/json" }; body: string }[] = [];
  let runPosts = 0;
  const countedTransport: OllamaResearchTransport = async (transportRequest, transportOptions) => {
    if (runPosts >= runPostLimit) throw new Error("P8 workflow POST cap reached; stop before POST");
    const requestStage = stage(transportRequest.body);
    await budget.reserve({ phase: "working-time-workflow", promptConfigId: "P8_WORKING_TIME_V1", caseId: activeCaseId, stage: requestStage });
    runPosts += 1;
    activeModelRequests.push(Object.freeze({ stage: requestStage, headers: Object.freeze({ "content-type": transportRequest.headers["content-type"] }), body: transportRequest.body }));
    return await baseTransport(transportRequest, transportOptions);
  };
  const adapter = new OllamaWorkingTimeWorkflowAdapter(countedTransport, { enabled: true, verifiedManifestSha256: P6_OLLAMA_MANIFEST_SHA256, timeoutMs: 20_000, maxRequestBytes: 24_576, maxResponseBytes: 16_384 });
  const cases: unknown[] = [];
  let stopped: null | { caseId: string; reason: string } = null;
  for (const item of fixture.cases) {
    activeCaseId = item.id;
    let sourceReads = 0;
    let mockCalls = 0;
    activeModelRequests = [];
    const mockRequests: unknown[] = [];
    const closedModelOutputs: unknown[] = [];
    const capturingModel: WorkingTimeWorkflowModel = {
      name: adapter.name,
      get planCallCount() { return adapter.planCallCount; },
      get draftCallCount() { return adapter.draftCallCount; },
      async plan(input, callOptions) { const output = await adapter.plan(input, callOptions); closedModelOutputs.push(output); return output; },
      async draft(input, callOptions) { const output = await adapter.draft(input, callOptions); closedModelOutputs.push(output); return output; },
    };
    const authority = new WorkingTimeWorkflowAuthority({ organizationId: "OrgWF-A", actorId: "ActorWF-A", sessionId: "SessionWF-A", taskIds: ["TaskWF-A"], sourceIds: [fixture.source.id], people: [{ personId: fixture.source.personId, displayLabel: fixture.source.displayName }], fieldIds: ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"], allowGeneralResearch: true, allowGeneralTemplate: false, researchCatalogVersion: 1 }, [{ id: fixture.source.id, organizationId: fixture.source.organizationId, personId: fixture.source.personId, readFields(fields) { sourceReads += 1; const values = { display_name: fixture.source.displayName, current_weekly_hours: fixture.source.currentWeeklyHours, contract_paragraphs: fixture.source.paragraphs, unchanged_terms: fixture.source.paragraphs[1]!.text }; return Object.fromEntries(fields.map((field) => [field, values[field]])); } }]);
    const mock: WorkingTimeResearchMock = { name: "MOCK_OFFLINE", get callCount() { return mockCalls; }, async generate(input) { mockCalls += 1; mockRequests.push(JSON.parse(JSON.stringify(input))); return { text: "Eingefrorene synthetische allgemeine Referenz. Keine aktuelle Rechtsrecherche oder Einzelfallberatung." }; } };
    const workflow = new WorkingTimeContractWorkflow(authority, capturingModel, mock);
    const callsBefore = adapter.planCallCount + adapter.draftCallCount;
    const first = await workflow.run(request(item, item.confirmedIntent, fixture.source.id));
    const results = [first];
    if (item.confirmedFollowup) {
      if (shouldRunP8ConfirmedFollowup(first, item.expectedFirstQuestions!)) {
        results.push(await workflow.run(request(item, item.confirmedFollowup, fixture.source.id)));
      } else {
        const caseModelCalls = adapter.planCallCount + adapter.draftCallCount - callsBefore;
        cases.push({ caseId: item.id, sourceReads, mockCalls, modelCalls: caseModelCalls, modelRequests: activeModelRequests, closedModelOutputs, mockRequests, results });
        stopped = { caseId: item.id, reason: "expected first clarification failed; follow-up suppressed" };
        break;
      }
    }
    const caseModelCalls = adapter.planCallCount + adapter.draftCallCount - callsBefore;
    cases.push({ caseId: item.id, sourceReads, mockCalls, modelCalls: caseModelCalls, modelRequests: activeModelRequests, closedModelOutputs, mockRequests, results });
    const final = results.at(-1);
    if (caseModelCalls !== item.expectedModelCalls || mockCalls !== item.expectedResearchCalls || !final ||
        typeof final !== "object" || final === null || (final as { ok?: unknown }).ok !== true || (final as { kind?: unknown }).kind !== "draft") {
      stopped = { caseId: item.id, reason: "preregistered workflow outcome or call count mismatch" };
      break;
    }
  }
  const report = { schemaVersion: 1, validationKind: mode, historicalReportSha256: mode === "fieldset-correction" ? P8_FAILED_REPORT_SHA256 : null, fixtureSha256: P8_WORKFLOW_CASES_SHA256, startedWithReservedPosts: before, completedWithReservedPosts: await budget.readReservedPosts(), runPosts, stopped, cases };
  await writeProtected(options.outputPath, report);
  return report;
}

async function main(): Promise<void> {
  const root = resolve(process.cwd());
  const mode = process.argv[2];
  if (mode === "--preflight") {
    await verifyP8ModelFreePreflight({ root, protocolPath: "/private/tmp/P7-root-workflow-protocol-amendment.json", ledgerPath: resolve(root, ".local/p7/call-budget.json") });
    process.stdout.write("P8 workflow model-free preflight passed; 0 POSTs.\n");
    return;
  }
  if (mode === "--preflight-correction") {
    await verifyP8CorrectionModelFreePreflight({ root, correctionProtocolPath: "/private/tmp/P8-root-fieldset-correction-protocol.json", historicalReportPath: resolve(root, ".local/p8/workflow-development-2026-10-25T00-21-11-069Z.json"), historicalSourceArchivePath: resolve(root, ".local/p8/failed-candidate-core-0e081d98d7cee178317d42add983f2bf403971d7fda38620cbf0f652ea08999a.tar.gz"), ledgerPath: resolve(root, ".local/p7/call-budget.json") });
    process.stdout.write("P8 fieldset-correction model-free preflight passed; 0 POSTs.\n");
    return;
  }
  if (mode !== "--run-development" && mode !== "--run-correction-development") throw new Error("use --preflight, --preflight-correction, --run-development or --run-correction-development explicitly");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const correction = mode === "--run-correction-development";
  const report = await runP8WorkflowDevelopment({ root, ledgerPath: resolve(root, ".local/p7/call-budget.json"), runtimeMetadataPath: resolve(root, ".local/p8/runtime-ready.json"), protocolPath: correction ? "/private/tmp/P8-root-fieldset-correction-protocol.json" : "/private/tmp/P7-root-workflow-protocol-amendment.json", outputPath: resolve(root, `.local/p8/workflow-${correction ? "fieldset-correction" : "development"}-${stamp}.json`), mode: correction ? "fieldset-correction" : "initial", ...(correction ? { historicalReportPath: resolve(root, ".local/p8/workflow-development-2026-10-25T00-21-11-069Z.json"), historicalSourceArchivePath: resolve(root, ".local/p8/failed-candidate-core-0e081d98d7cee178317d42add983f2bf403971d7fda38620cbf0f652ea08999a.tar.gz") } : {}) });
  process.stdout.write(`P8 workflow report stored locally: ${report.runPosts} POSTs; stopped=${report.stopped !== null}.\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "P8 workflow runner failed"}\n`); process.exitCode = 1; });
