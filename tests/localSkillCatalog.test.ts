import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LOCAL_SKILL_CATALOG, isExecutableLocalSkillId } from "../src/localSkillCatalog.js";

test("checked-in catalog and runtime catalog expose the same five stable IDs", async () => {
  const configured = JSON.parse(await readFile("config/p7-skill-catalog.json", "utf8")) as {
    schemaVersion: number;
    skills: { id: string; status: string }[];
  };
  assert.equal(configured.schemaVersion, 1);
  assert.deepEqual(configured.skills.map(({ id }) => id), LOCAL_SKILL_CATALOG.map(({ id }) => id));
  assert.deepEqual(configured.skills.map(({ status }) => status), ["p7-target", "planned", "p7-target", "planned", "planned"]);
  assert.deepEqual(LOCAL_SKILL_CATALOG.filter(({ status }) => status === "executable").map(({ id }) => id),
    ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"]);
  assert.equal(isExecutableLocalSkillId("INFORMATION_COMPARISON"), false);
  assert.ok(LOCAL_SKILL_CATALOG.every((entry) => entry.processingBoundary === "LOCAL_ONLY" &&
    entry.inputContract.length > 0 && entry.outputContract.length > 0 && entry.sourceRightsContract.length > 0));
});

test("development catalog remains six disclosed cases with bounded declared calls", async () => {
  const fixture = JSON.parse(await readFile("docs/P7-DEVELOPMENT-CASES.json", "utf8")) as {
    cases: { id: string; split: string; expectedSkills: string[]; maxModelCallsPerConfig: number }[];
  };
  assert.equal(fixture.cases.length, 6);
  assert.equal(new Set(fixture.cases.map(({ id }) => id)).size, 6);
  assert.ok(fixture.cases.every(({ split }) => split === "development"));
  assert.ok(fixture.cases.every(({ expectedSkills }) => expectedSkills.every((id) => isExecutableLocalSkillId(id))));
  assert.ok(fixture.cases.reduce((total, item) => total + item.maxModelCallsPerConfig, 0) <= 9);
});
