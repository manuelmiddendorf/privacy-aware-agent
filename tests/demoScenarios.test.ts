import assert from "node:assert/strict";
import test from "node:test";
import { runDemoScenarios } from "../src/demoScenarios.js";

test("the four offline CLI scenarios preserve evidence, privacy and no-action boundaries", async () => {
  const scenarios = await runDemoScenarios();
  assert.equal(scenarios.length, 4);
  const meeting = scenarios[0]!;
  const gardening = scenarios[1]!;
  const sensitive = scenarios[2]!;
  const notice = scenarios[3]!;

  assert.equal(meeting.ok, true);
  assert.equal(meeting.providerCalls, 1);
  assert.deepEqual(meeting.citations, ["meeting-preparation"]);
  assert.match(meeting.message, /1\. Collect topics and the meeting goal\./);
  assert.match(meeting.message, /2\. Create the agenda\./);
  assert.match(meeting.message, /3\. Link the relevant documents\./);
  assert.match(meeting.message, /4\. Send the invitation\./);
  assert.doesNotMatch(meeting.message, /\b5\./);

  assert.equal(gardening.ok, true);
  assert.equal(gardening.providerCalls, 1);
  assert.match(gardening.message, /^MOCK_OFFLINE example letter:/);
  assert.match(gardening.message, /Dear families,/);
  assert.match(gardening.message, /You are warmly invited to our gardening day on \[Date\] at \[Time\]\./);
  assert.match(gardening.message, /We will meet at \[Location\]\./);
  assert.match(gardening.message, /We look forward to your support!/);
  assert.doesNotMatch(gardening.message, /Do not send it/);

  assert.equal(sensitive.ok, false);
  assert.equal(sensitive.providerCalls, 0);
  assert.equal(sensitive.message, "This request contains sensitive information. Please describe your request generally, without information about individual people.");
  assert.doesNotMatch(JSON.stringify(sensitive), /fever|personal update|A child/i);

  assert.equal(notice.ok, false);
  assert.equal(notice.reasonCode, "BLOCK_EVIDENCE_INSUFFICIENT");
  assert.equal(notice.providerCalls, 0);
  assert.equal(notice.message, "The information needed for this answer has not been sufficiently confirmed.");
  assert.deepEqual(notice.citations, []);
  assert.doesNotMatch(notice.message, /day|week|month|deadline|citation/i);
});
