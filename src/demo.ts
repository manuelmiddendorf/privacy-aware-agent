import { runDemoScenarios } from "./demoScenarios.js";

const scenarios = await runDemoScenarios();

console.log(JSON.stringify({
  scenarios,
  providerCalls: scenarios.reduce((total, scenario) => total + scenario.providerCalls, 0),
}, null, 2));
