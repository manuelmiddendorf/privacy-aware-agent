import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { OllamaWorkingTimeWorkflowAdapter } from "./ollamaWorkingTimeWorkflowAdapter.js";
import { createLoopbackOllamaTransport, P6_OLLAMA_MANIFEST_SHA256, type OllamaResearchTransport } from "./ollamaResearchAdapter.js";
import { P7LocalCallBudget } from "./p7LocalCallBudget.js";
import {
  P8_REMAINING_PATHS_FIXTURE_SHA256,
  P8_REMAINING_PATHS_HELPER_SHA256,
  P8_REMAINING_PATHS_LEDGER_SHA256,
  P8_REMAINING_PATHS_PROTOCOL_SHA256,
  P8_REMAINING_PATHS_REPORT_SHA256,
  P8_REMAINING_PATHS_SOURCE_SHA256,
  verifyP8RemainingPathsModelFreePreflight,
} from "./p8RemainingPathsReadiness.js";
import { verifyP8LoopbackRuntimeReady } from "./p8WorkflowReadiness.js";
import { WorkingTimeContractWorkflow, WorkingTimeWorkflowAuthority, type WorkingTimeWorkflowModel } from "./workingTimeContractWorkflow.js";
import { createWorkingTimeMockPayload, type WorkingTimeResearchMock } from "./workingTimeResearchCatalog.js";

type Intent = { personId: "person-lina"; targetWeeklyHours: 25; effectiveDate: "2031-09-01"; researchRequested: boolean };
type Path = { id: "WF02_EXPLICIT_CONFIRMED_ACTION" | "WF03_COMPLETE_MOCK_RESEARCH"; requestText: string; confirmedIntent: Intent; expectedLocalPosts: 2; expectedGetterCalls: 1; expectedMockCalls: 0 | 1 };
type Protocol = { paths: readonly Path[] };
type Fixture = { source: { id: "contract-lina"; organizationId: "OrgWF-A"; personId: "person-lina"; displayName: string; currentWeeklyHours: 20; paragraphs: readonly { id: string; text: string }[] } };

function stage(body: string): "understand" | "draft" {
  const parsed = JSON.parse(body) as { options?: { num_predict?: unknown } };
  if (parsed.options?.num_predict === 256) return "understand";
  if (parsed.options?.num_predict === 768) return "draft";
  throw new Error("unexpected P8 remaining-path model stage; stop before POST");
}

function loadBoundProtocol(value: unknown): Protocol {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { paths?: unknown }).paths)) throw new Error("P8 remaining-path protocol invalid");
  const paths = (value as { paths: unknown[] }).paths;
  if (paths.length !== 2) throw new Error("P8 remaining-path protocol invalid");
  const [first, second] = paths as Record<string, unknown>[];
  if (first?.id !== "WF02_EXPLICIT_CONFIRMED_ACTION" || second?.id !== "WF03_COMPLETE_MOCK_RESEARCH" ||
      first.expectedLocalPosts !== 2 || second.expectedLocalPosts !== 2 || first.expectedGetterCalls !== 1 || second.expectedGetterCalls !== 1 ||
      first.expectedMockCalls !== 0 || second.expectedMockCalls !== 1 || typeof first.requestText !== "string" || typeof second.requestText !== "string") {
    throw new Error("P8 remaining-path protocol invalid");
  }
  for (const [item, researchRequested] of [[first, false], [second, true]] as const) {
    const intent = item.confirmedIntent;
    if (typeof intent !== "object" || intent === null || Array.isArray(intent) || Object.keys(intent).sort().join("|") !== "effectiveDate|personId|researchRequested|targetWeeklyHours" ||
        (intent as Record<string, unknown>).personId !== "person-lina" || (intent as Record<string, unknown>).targetWeeklyHours !== 25 ||
        (intent as Record<string, unknown>).effectiveDate !== "2031-09-01" || (intent as Record<string, unknown>).researchRequested !== researchRequested) {
      throw new Error("P8 remaining-path protocol invalid");
    }
  }
  return Object.freeze({ paths: Object.freeze(paths.map((item) => Object.freeze(item as unknown as Path))) });
}

export function isAcceptedRemainingPathDraft(result: unknown): boolean {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return false;
  const item = result as { ok?: unknown; kind?: unknown; draft?: unknown; citations?: unknown };
  if (item.ok !== true || item.kind !== "draft" || typeof item.draft !== "string" || !Array.isArray(item.citations)) return false;
  const normalized = item.draft.toLocaleLowerCase("de-DE");
  return /\b20\b/.test(normalized) && /\b25\b/.test(normalized) && /(2031-09-01|01\.09\.2031)/.test(normalized) &&
    normalized.includes("andere vertragsbestimmungen bleiben unverändert") && normalized.includes("unverbindlich") &&
    item.citations.includes("contract-lina:p01") && item.citations.includes("contract-lina:p02");
}

async function writeProtected(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}

export async function runP8RemainingPaths(options: {
  readonly root: string;
  readonly protocolPath: string;
  readonly evidenceReportPath: string;
  readonly ledgerPath: string;
  readonly runtimeMetadataPath: string;
  readonly outputPath: string;
  readonly transport?: OllamaResearchTransport;
}) {
  await verifyP8RemainingPathsModelFreePreflight(options);
  const runtimeMetadataBytes = await readFile(options.runtimeMetadataPath);
  verifyP8LoopbackRuntimeReady(JSON.parse(runtimeMetadataBytes.toString("utf8")));
  const protocol = loadBoundProtocol(JSON.parse(await readFile(options.protocolPath, "utf8")));
  const fixtureBytes = await readFile(resolve(options.root, "docs/P8-WORKFLOW-CASES.json"));
  if (createHash("sha256").update(fixtureBytes).digest("hex") !== P8_REMAINING_PATHS_FIXTURE_SHA256) throw new Error("P8 remaining-path fixture mismatch; stop before claim");
  const fixture = JSON.parse(fixtureBytes.toString("utf8")) as Fixture;
  if (fixture.source?.id !== "contract-lina" || fixture.source.organizationId !== "OrgWF-A" || fixture.source.personId !== "person-lina" ||
      fixture.source.currentWeeklyHours !== 20 || !Array.isArray(fixture.source.paragraphs) || fixture.source.paragraphs.length !== 2) {
    throw new Error("P8 remaining-path source fixture invalid; stop before claim");
  }

  const budget = new P7LocalCallBudget(options.ledgerPath);
  const before = await budget.readReservedPosts();
  await budget.claimWorkingTimeRemainingPathsOnce({
    protocolSha256: P8_REMAINING_PATHS_PROTOCOL_SHA256,
    evidenceReportSha256: P8_REMAINING_PATHS_REPORT_SHA256,
    fixtureSha256: P8_REMAINING_PATHS_FIXTURE_SHA256,
    ledgerBeforeSha256: P8_REMAINING_PATHS_LEDGER_SHA256,
    sourceCoreSha256: P8_REMAINING_PATHS_SOURCE_SHA256,
    helperSha256: P8_REMAINING_PATHS_HELPER_SHA256,
    runtimeMetadataSha256: createHash("sha256").update(runtimeMetadataBytes).digest("hex"),
  });

  let activeCaseId: Path["id"] = "WF02_EXPLICIT_CONFIRMED_ACTION";
  let activeRequests: { stage: "understand" | "draft"; headers: { "content-type": string }; body: string }[] = [];
  let runPosts = 0;
  const baseTransport = options.transport ?? createLoopbackOllamaTransport();
  const countedTransport: OllamaResearchTransport = async (request, transportOptions) => {
    if (runPosts >= 4) throw new Error("P8 remaining-path four-POST cap reached; stop before POST");
    const requestStage = stage(request.body);
    await budget.reserve({ phase: "working-time-workflow", promptConfigId: "P8_WORKING_TIME_V1", caseId: activeCaseId, stage: requestStage });
    runPosts += 1;
    activeRequests.push(Object.freeze({ stage: requestStage, headers: Object.freeze({ "content-type": request.headers["content-type"] }), body: request.body }));
    return await baseTransport(request, transportOptions);
  };
  const adapter = new OllamaWorkingTimeWorkflowAdapter(countedTransport, { enabled: true, verifiedManifestSha256: P6_OLLAMA_MANIFEST_SHA256, timeoutMs: 20_000, maxRequestBytes: 24_576, maxResponseBytes: 16_384 });
  const cases: unknown[] = [];
  let stopped: null | { caseId: Path["id"]; reason: string } = null;

  for (const path of protocol.paths) {
    activeCaseId = path.id;
    activeRequests = [];
    let sourceReads = 0;
    let mockCalls = 0;
    const closedModelOutputs: unknown[] = [];
    const mockRequests: unknown[] = [];
    const model: WorkingTimeWorkflowModel = {
      name: adapter.name,
      get planCallCount() { return adapter.planCallCount; },
      get draftCallCount() { return adapter.draftCallCount; },
      async plan(input, callOptions) { const output = await adapter.plan(input, callOptions); closedModelOutputs.push(output); return output; },
      async draft(input, callOptions) { const output = await adapter.draft(input, callOptions); closedModelOutputs.push(output); return output; },
    };
    const authority = new WorkingTimeWorkflowAuthority({
      organizationId: "OrgWF-A", actorId: "ActorWF-A", sessionId: `Session-${path.id}`, taskIds: [`Task-${path.id}`], sourceIds: [fixture.source.id],
      people: [{ personId: fixture.source.personId, displayLabel: fixture.source.displayName }], fieldIds: ["display_name", "current_weekly_hours", "contract_paragraphs", "unchanged_terms"],
      allowGeneralResearch: true, allowGeneralTemplate: false, researchCatalogVersion: 1,
    }, [{ id: fixture.source.id, organizationId: fixture.source.organizationId, personId: fixture.source.personId, readFields(fields) {
      sourceReads += 1;
      const values = { display_name: fixture.source.displayName, current_weekly_hours: fixture.source.currentWeeklyHours, contract_paragraphs: fixture.source.paragraphs, unchanged_terms: fixture.source.paragraphs[1]!.text };
      return Object.fromEntries(fields.map((field) => [field, values[field]]));
    } }]);
    const mock: WorkingTimeResearchMock = { name: "MOCK_OFFLINE", get callCount() { return mockCalls; }, async generate(input) {
      mockCalls += 1;
      mockRequests.push(JSON.parse(JSON.stringify(input)));
      return { text: "Eingefrorene synthetische allgemeine Referenz. Keine aktuelle Rechtsrecherche oder Einzelfallberatung." };
    } };
    const callsBefore = adapter.planCallCount + adapter.draftCallCount;
    const workflow = new WorkingTimeContractWorkflow(authority, model, mock);
    const request = { schemaVersion: 1, organizationId: "OrgWF-A", actorId: "ActorWF-A", sessionId: `Session-${path.id}`, taskId: `Task-${path.id}`, sourceId: fixture.source.id, purpose: "SYNTHETIC_WORKING_TIME_CONTRACT_DRAFT", text: path.requestText, confirmedIntent: { ...path.confirmedIntent, templateRequested: false } } as const;
    const result = await workflow.run(request);
    const modelCalls = adapter.planCallCount + adapter.draftCallCount - callsBefore;
    const evidence = { caseId: path.id, request, sourceReads, mockCalls, modelCalls, modelRequests: activeRequests, closedModelOutputs, mockRequests, result };
    cases.push(evidence);
    const expectedMock = path.expectedMockCalls === 1
      ? createWorkingTimeMockPayload({ type: "employment_contract_change", jurisdiction: "DE", topic: "weekly_working_hours", goal: "general_requirements" }, 1, [])
      : null;
    if (modelCalls !== path.expectedLocalPosts || sourceReads !== path.expectedGetterCalls || mockCalls !== path.expectedMockCalls || !isAcceptedRemainingPathDraft(result) ||
        (expectedMock !== null && JSON.stringify(mockRequests[0]) !== JSON.stringify(expectedMock))) {
      stopped = { caseId: path.id, reason: "remaining-path outcome or evidence mismatch" };
      break;
    }
  }

  const report = { schemaVersion: 1, validationKind: "remaining-paths", protocolSha256: P8_REMAINING_PATHS_PROTOCOL_SHA256, evidenceReportSha256: P8_REMAINING_PATHS_REPORT_SHA256, sourceCoreSha256: P8_REMAINING_PATHS_SOURCE_SHA256, helperSha256: P8_REMAINING_PATHS_HELPER_SHA256, startedWithReservedPosts: before, completedWithReservedPosts: await budget.readReservedPosts(), runPosts, stopped, cases };
  await writeProtected(options.outputPath, report);
  return report;
}

async function main(): Promise<void> {
  const root = resolve(process.cwd());
  const mode = process.argv[2];
  const common = { root, protocolPath: "/private/tmp/P8-root-remaining-paths-protocol.json", evidenceReportPath: resolve(root, ".local/p8/workflow-fieldset-correction-2026-10-25T00-32-30-228Z.json"), ledgerPath: resolve(root, ".local/p7/call-budget.json") };
  if (mode === "--preflight") {
    await verifyP8RemainingPathsModelFreePreflight(common);
    process.stdout.write("P8 remaining-paths model-free preflight passed; 0 POSTs.\n");
    return;
  }
  if (mode !== "--run-development") throw new Error("use --preflight or --run-development explicitly");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const report = await runP8RemainingPaths({ ...common, runtimeMetadataPath: resolve(root, ".local/p8/runtime-ready.json"), outputPath: resolve(root, `.local/p8/remaining-paths-${stamp}.json`) });
  process.stdout.write(`P8 remaining-paths report stored locally: ${report.runPosts} POSTs; stopped=${report.stopped !== null}.\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "P8 remaining-paths runner failed"}\n`); process.exitCode = 1; });
