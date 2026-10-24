import { DEMO_POLICY } from "./demoPolicy.js";
import { MockProvider } from "./mockProvider.js";
import { PrivacyAwareAgent, type EvidenceAssessor } from "./orchestrator.js";
import type { AgentRequest, AgentResult, ReasonCode } from "./types.js";

interface DemoScenario {
  id: "A" | "B" | "C" | "D";
  label: string;
  request: AgentRequest;
  evidenceAssessor?: EvidenceAssessor;
}

export interface DemoScenarioResult {
  id: DemoScenario["id"];
  label: string;
  ok: boolean;
  reasonCode: ReasonCode;
  providerCalls: number;
  message: string;
  citations: readonly string[];
}

const SCENARIOS: readonly DemoScenario[] = [
  {
    id: "A",
    label: "approved board-meeting preparation",
    request: {
      task: "ask",
      text: "List only the approved preparation steps for the synthetic board meeting.",
      sourceIds: ["meeting-preparation"],
    },
  },
  {
    id: "B",
    label: "friendly gardening-day draft",
    request: {
      task: "draft",
      text: "Write a friendly gardening-day invitation for [Date] at [Time] in [Location]. Do not send it.",
      sourceIds: [],
    },
  },
  {
    id: "C",
    label: "privacy block",
    request: {
      task: "draft",
      text: "A child has a fever. Draft a personal update.",
      sourceIds: [],
    },
  },
  {
    id: "D",
    label: "approved sources lack binding notice evidence",
    request: {
      task: "ask",
      text: "What binding notice period applies to our next general meeting?",
      sourceIds: ["meeting-preparation"],
    },
    evidenceAssessor: {
      isSufficient: (_request, documents) => documents.some((document) => document.id === "binding-notice-period"),
    },
  },
];

function blockedMessage(result: AgentResult): string {
  if (result.ok) return result.output.text;
  if (result.reasonCode === "BLOCK_EVIDENCE_REQUIRED") {
    return "I do not have an approved document for this question.";
  }
  if (result.reasonCode === "BLOCK_EVIDENCE_INSUFFICIENT") {
    return "The approved documents do not contain sufficient information to answer this.";
  }
  return "This request contains sensitive information. Please describe your request generally, without information about individual people.";
}

export async function runDemoScenarios(): Promise<DemoScenarioResult[]> {
  const results: DemoScenarioResult[] = [];
  for (const scenario of SCENARIOS) {
    const provider = new MockProvider();
    const result = await new PrivacyAwareAgent(provider, undefined, scenario.evidenceAssessor).run(DEMO_POLICY, scenario.request);
    results.push({
      id: scenario.id,
      label: scenario.label,
      ok: result.ok,
      reasonCode: result.reasonCode,
      providerCalls: provider.callCount,
      message: blockedMessage(result),
      citations: result.ok ? result.output.citations : [],
    });
  }
  return results;
}
