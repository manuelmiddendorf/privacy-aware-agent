import { performance } from "node:perf_hooks";
import { createExactSyntheticEvidenceAssessor } from "./demoEvidence.js";
import { DEMO_POLICY } from "./demoPolicy.js";
import { PrivacyAwareAgent } from "./orchestrator.js";
import type { AgentRequest, ModelProvider, ProviderOutput, ReasonCode } from "./types.js";

interface PracticalLiveScenario {
  id: "P01" | "P02" | "P03";
  liveId: "L1" | "L2" | "L3";
  request: AgentRequest;
  evidence: "exact-synthetic-pair" | "source-free";
}

export const OPENAI_PRACTICAL_SCENARIOS: readonly PracticalLiveScenario[] = Object.freeze([
  Object.freeze({
    id: "P01",
    liveId: "L1",
    request: Object.freeze({
      task: "ask",
      text: "Which preparation step comes after creating the agenda, and what is the final step? Answer only from the approved page.",
      sourceIds: Object.freeze(["meeting-preparation"]),
    }),
    evidence: "exact-synthetic-pair",
  }),
  Object.freeze({
    id: "P02",
    liveId: "L2",
    request: Object.freeze({
      task: "draft",
      text: "Write a warm two-sentence reminder to bring reusable cups to our community picnic at [Location] on [Date]. Leave placeholders unchanged; do not send anything.",
      sourceIds: Object.freeze([]),
    }),
    evidence: "source-free",
  }),
  Object.freeze({
    id: "P03",
    liveId: "L3",
    request: Object.freeze({
      task: "summarize",
      text: "Condense this general plan into two bullets: arrange the chairs before the workshop; place reusable cups near the entrance; return the chairs afterwards.",
      sourceIds: Object.freeze([]),
    }),
    evidence: "source-free",
  }),
]);

function qualityChecks(id: PracticalLiveScenario["id"], output: ProviderOutput): Record<string, boolean> {
  if (id === "P01") return {
    linksDocuments: /Link the relevant documents/i.test(output.text),
    finalSendInvitation: /Send the invitation/i.test(output.text),
    onlyExpectedCitation: JSON.stringify(output.citations) === JSON.stringify(["meeting-preparation"]),
    noInventedDeadline: !/deadline|notice period|\bday\b|\bweek\b|\bmonth\b/i.test(output.text),
  };
  if (id === "P02") return {
    twoSentences: (output.text.match(/[.!?](?:\s|$)/g) ?? []).length === 2,
    locationPlaceholder: output.text.includes("[Location]"),
    datePlaceholder: output.text.includes("[Date]"),
    noCitations: output.citations.length === 0,
    noSentClaim: !/\b(?:sent|have sent|was sent)\b/i.test(output.text),
  };
  return {
    twoBullets: (output.text.match(/(?:^|\n)\s*[-*•]\s+/g) ?? []).length === 2,
    arrangeChairs: /arrange (?:the )?chairs/i.test(output.text),
    reusableCups: /reusable cups/i.test(output.text),
    returnChairs: /return (?:the )?chairs/i.test(output.text),
    noCitations: output.citations.length === 0,
  };
}

export interface PracticalScenarioResult {
  id: PracticalLiveScenario["id"];
  liveId: PracticalLiveScenario["liveId"];
  ok: boolean;
  reasonCode: ReasonCode;
  providerCalls: number;
  endToEndLatencyMs: number;
  output?: ProviderOutput;
  qualityChecks?: Record<string, boolean>;
  qualityPassed?: boolean;
}

export async function runOpenAIPracticalScenarios(provider: ModelProvider): Promise<PracticalScenarioResult[]> {
  const results: PracticalScenarioResult[] = [];
  for (const scenario of OPENAI_PRACTICAL_SCENARIOS) {
    const callsBefore = provider.callCount;
    const assessor = scenario.evidence === "exact-synthetic-pair"
      ? createExactSyntheticEvidenceAssessor(scenario.request)
      : undefined;
    const started = performance.now();
    const result = await new PrivacyAwareAgent(provider, undefined, assessor).run(DEMO_POLICY, scenario.request);
    const endToEndLatencyMs = Math.round((performance.now() - started) * 100) / 100;
    const providerCalls = provider.callCount - callsBefore;
    if (!result.ok || providerCalls !== 1) {
      results.push({ id: scenario.id, liveId: scenario.liveId, ok: false, reasonCode: result.reasonCode, providerCalls, endToEndLatencyMs });
      break;
    }
    const checks = qualityChecks(scenario.id, result.output);
    results.push({
      id: scenario.id,
      liveId: scenario.liveId,
      ok: true,
      reasonCode: result.reasonCode,
      providerCalls,
      endToEndLatencyMs,
      output: result.output,
      qualityChecks: checks,
      qualityPassed: Object.values(checks).every((value) => value),
    });
  }
  return results;
}
