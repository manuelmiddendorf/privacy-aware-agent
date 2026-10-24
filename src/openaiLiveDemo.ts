import { resolve } from "node:path";
import { runDemoScenarios } from "./demoScenarios.js";
import { FileOpenAIBudgetLedger, OPENAI_DEMO_MAX_REQUESTS } from "./openaiBudget.js";
import { loadProtectedLocalOpenAIKey } from "./openaiKey.js";
import { createOpenAIResponsesTransport } from "./openaiTransport.js";
import { TransportModelProvider } from "./transportProvider.js";

const BUDGET_FILE = resolve(process.cwd(), ".local/openai-live-demo-budget.json");

if (process.env.PAA_OPENAI_LIVE_ENABLED !== "1") {
  throw new Error("Live OpenAI demo is disabled; explicit reviewed host enablement is required");
}

const budget = new FileOpenAIBudgetLedger(BUDGET_FILE);
const transport = createOpenAIResponsesTransport({
  enabled: true,
  apiKey: await loadProtectedLocalOpenAIKey(),
  budget,
});
const provider = new TransportModelProvider(transport, {
  enabled: true,
  timeoutMs: 15_000,
  maxRequestBytes: 32_768,
  maxResponseBytes: 16_384,
});
const scenarios = await runDemoScenarios({ providerFactory: () => provider });
if (provider.transportCallCount !== OPENAI_DEMO_MAX_REQUESTS) {
  throw new Error("Live demo transport count did not match the reviewed two-call contract");
}

console.log(JSON.stringify({
  scenarios,
  providerCalls: provider.callCount,
  transportCalls: provider.transportCallCount,
  budget: await budget.snapshot(),
}, null, 2));
