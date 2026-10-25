import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryResearchAuthority } from "../src/localResearchAuthority.js";
import { LocalResearchLane, OUTBOUND_TEXT } from "../src/localResearchLane.js";
import type {
  LocalResearchModelAdapter,
  LocalResearchModelInput,
  LocalResearchRequest,
  ResearchMockInput,
  ResearchMockProvider,
  ResearchSource,
} from "../src/localResearchTypes.js";

const SOURCE_A: ResearchSource = {
  id: "lab-workingtime-note",
  organizationId: "lab-org-a",
  identifiers: [
    { subjectId: "person-talea", type: "person_name", value: "Talea Fantasie" },
    { subjectId: "person-talea", type: "person_alias", value: "T. Fantasie" },
    { subjectId: "person-talea", type: "email", value: "talea@verein.invalid" },
    { subjectId: "person-talea", type: "postal_address", value: "Beispielbogen 84, 00000 Musterort" },
    { subjectId: "person-talia", type: "person_name", value: "Talia Fantasie" },
    { subjectId: "person-talea", type: "contextual_short_alias", value: "Al" },
  ],
};

const SOURCE_B: ResearchSource = {
  id: "lab-private-note",
  organizationId: "lab-org-b",
  identifiers: [{ subjectId: "foreign", type: "person_name", value: "Foreign Fixture" }],
};

const request = (text: string, overrides: Partial<LocalResearchRequest> = {}): LocalResearchRequest => ({
  schemaVersion: 1,
  organizationId: "lab-org-a",
  actorId: "lab-actor-a",
  sessionId: "lab-session-1",
  sourceIds: ["lab-workingtime-note"],
  purpose: "GENERAL_WORKING_TIME_RESEARCH",
  language: "de",
  text,
  ...overrides,
});

class GeneralizingModel implements LocalResearchModelAdapter {
  readonly name = "LOCAL_TEST_DOUBLE";
  callCount = 0;
  captured: LocalResearchModelInput[] = [];

  async classify(input: LocalResearchModelInput): Promise<unknown> {
    this.callCount += 1;
    this.captured.push(input);
    return {
      schemaVersion: 1,
      decision: "generalize",
      researchIntent: "WORKING_TIME_CHANGE",
      jurisdiction: "DE",
      language: input.language,
    };
  }
}

class OfflineResearchMock implements ResearchMockProvider {
  readonly name = "MOCK_OFFLINE";
  callCount = 0;
  captured: ResearchMockInput[] = [];
  response: unknown = { text: "Synthetic general information about working-time changes." };

  async generate(input: ResearchMockInput): Promise<unknown> {
    this.callCount += 1;
    this.captured.push(input);
    return this.response;
  }
}

const fixture = () => {
  const authority = new InMemoryResearchAuthority({
    organizationId: "lab-org-a",
    actorId: "lab-actor-a",
    sessionId: "lab-session-1",
    readableSourceIds: ["lab-workingtime-note"],
  }, [SOURCE_A, SOURCE_B]);
  const model = new GeneralizingModel();
  const provider = new OfflineResearchMock();
  return { authority, model, provider, lane: new LocalResearchLane(authority, model, provider) };
};

test("Q01-Q03 uniquely registered identifiers generalize locally to the one fixed outbound text", async () => {
  const cases = [
    "Talea Fantasie möchte ihre vertraglichen Wochenstunden ändern. Welche allgemeinen Rahmenbedingungen gelten in Deutschland?",
    "Please explain a contractual hours change in Germany for talea@verein.invalid, living at Beispielbogen 84, 00000 Musterort.",
    "Ｔａｌｅａ　Ｆａｎｔａｓｉｅ möchte die Vertragsarbeitszeit in Deutschland ändern.",
  ];
  for (const text of cases) {
    const { lane, model, provider } = fixture();
    const result = await lane.run(request(text));
    assert.equal(result.ok, true);
    assert.equal(model.callCount, 1);
    assert.equal(provider.callCount, 1);
    assert.deepEqual(provider.captured, [{
      researchIntent: "WORKING_TIME_CHANGE",
      jurisdiction: "DE",
      language: "de",
      text: OUTBOUND_TEXT,
    }]);
    assert.doesNotMatch(JSON.stringify(provider.captured), /Talea|talea@|Beispielbogen|Wochenstunden|lab-org|lab-actor|84|00000/u);
  }
});

test("Q04, Q05 and Q07 fuzzy, ambiguous and short aliases fail before the local model", async () => {
  const cases = [
    "Talea Fantasle möchte die Vertragsstunden in Deutschland anpassen.",
    "Tala Fantasie möchte ihre Stunden ändern.",
    "Unser Kollege Al möchte seine Vertragsstunden ändern.",
  ];
  for (const text of cases) {
    const { lane, model, provider } = fixture();
    const result = await lane.run(request(text));
    assert.deepEqual(result, { ok: false, reasonCode: "BLOCK_RESEARCH_IDENTIFIER_UNCERTAIN" });
    assert.equal(model.callCount, 0);
    assert.equal(provider.callCount, 0);
  }
});

test("Q06 benign general research does not substring-match the short alias", async () => {
  const { lane, model, provider } = fixture();
  const result = await lane.run(request("Allgemeine Informationen zur Änderung vertraglicher Arbeitszeit in Deutschland, ohne Einzelfall."));
  assert.equal(result.ok, true);
  assert.equal(model.callCount, 1);
  assert.equal(provider.callCount, 1);
});

test("Q08 foreign source and untrusted approval-like fields yield zero source, model and provider reads", async () => {
  const { lane, authority, model, provider } = fixture();
  const result = await lane.run({
    ...request("Talea Fantasie möchte ihre vertraglichen Wochenstunden ändern."),
    sourceIds: ["lab-private-note"],
    modelApproved: true,
    requestApproved: true,
  });
  assert.deepEqual(result, { ok: false, reasonCode: "BLOCK_RESEARCH_REQUEST_INVALID" });
  assert.equal(authority.sourceReadCount, 0);
  assert.equal(model.callCount, 0);
  assert.equal(provider.callCount, 0);

  const deniedWithoutExtraFields = await lane.run(request("Talea Fantasie möchte ihre vertraglichen Wochenstunden ändern.", {
    sourceIds: ["lab-private-note"],
  }));
  assert.deepEqual(deniedWithoutExtraFields, { ok: false, reasonCode: "BLOCK_RESEARCH_SOURCE_DENIED" });
  assert.equal(authority.sourceReadCount, 0);
});

test("Q09 held model result is discarded after an organization switch", async () => {
  let release!: (value: unknown) => void;
  let started!: () => void;
  const held = new Promise<unknown>((resolve) => { release = resolve; });
  const modelStarted = new Promise<void>((resolve) => { started = resolve; });
  const { authority, provider } = fixture();
  const model: LocalResearchModelAdapter = {
    name: "HELD_LOCAL_TEST_DOUBLE",
    callCount: 0,
    async classify() {
      (this as { callCount: number }).callCount += 1;
      started();
      return held;
    },
  };
  const lane = new LocalResearchLane(authority, model, provider);
  const pending = lane.run(request("Talea Fantasie möchte ihre vertraglichen Wochenstunden ändern."));
  await modelStarted;
  authority.switchSession({ organizationId: "lab-org-b", actorId: "lab-actor-a", sessionId: "lab-session-1", readableSourceIds: ["lab-private-note"] });
  release({ schemaVersion: 1, decision: "generalize", researchIntent: "WORKING_TIME_CHANGE", jurisdiction: "DE", language: "de" });
  assert.deepEqual(await pending, { ok: false, reasonCode: "BLOCK_RESEARCH_STALE_GENERATION" });
  assert.equal(provider.callCount, 0);
});

test("Q10 revocation and A-to-B-to-A invalidate held generations permanently", async () => {
  for (const mutate of [
    (authority: InMemoryResearchAuthority) => authority.revokeSource("lab-workingtime-note"),
    (authority: InMemoryResearchAuthority) => {
      authority.switchSession({ organizationId: "lab-org-b", actorId: "lab-actor-a", sessionId: "lab-session-1", readableSourceIds: ["lab-private-note"] });
      authority.switchSession({ organizationId: "lab-org-a", actorId: "lab-actor-a", sessionId: "lab-session-1", readableSourceIds: ["lab-workingtime-note"] });
    },
  ]) {
    let release!: (value: unknown) => void;
    let started!: () => void;
    const held = new Promise<unknown>((resolve) => { release = resolve; });
    const modelStarted = new Promise<void>((resolve) => { started = resolve; });
    const { authority, provider } = fixture();
    const model: LocalResearchModelAdapter = {
      name: "HELD_LOCAL_TEST_DOUBLE",
      callCount: 0,
      async classify() {
        (this as { callCount: number }).callCount += 1;
        started();
        return held;
      },
    };
    const pending = new LocalResearchLane(authority, model, provider).run(request("Talea Fantasie möchte ihre Stunden ändern."));
    await modelStarted;
    mutate(authority);
    release({ schemaVersion: 1, decision: "generalize", researchIntent: "WORKING_TIME_CHANGE", jurisdiction: "DE", language: "de" });
    assert.deepEqual(await pending, { ok: false, reasonCode: "BLOCK_RESEARCH_STALE_GENERATION" });
    assert.equal(provider.callCount, 0);
  }
});

test("health, child, unknown named-person and direct unregistered identifiers stay closed", async () => {
  const cases = [
    "Talea Fantasie hat Fieber und möchte ihre Stunden ändern.",
    "Ein Kind soll seine Vertragsstunden ändern.",
    "Nora Beispiel möchte ihre Vertragsstunden ändern.",
    "Please research person@example.test and working hours.",
  ];
  for (const text of cases) {
    const { lane, model, provider } = fixture();
    const result = await lane.run(request(text));
    assert.equal(result.ok, false);
    assert.equal(model.callCount, 0);
    assert.equal(provider.callCount, 0);
  }
});

test("an exact known person cannot hide an unknown identifier, short alias or fuzzy second person", async () => {
  const cases = [
    "Talea Fantasie fragt zu fremd@example.invalid nach Vertragsstunden.",
    "Talea +49 30 12345678 Fantasie fragt nach Vertragsstunden.",
    "Talea Fantasie fragt gemeinsam mit Al nach Vertragsstunden.",
    "Talea Fantasie fragt auch für Talia Fantasle nach Vertragsstunden.",
  ];
  for (const text of cases) {
    const { lane, model, provider } = fixture();
    const result = await lane.run(request(text));
    assert.equal(result.ok, false);
    assert.equal(model.callCount, 0);
    assert.equal(provider.callCount, 0);
  }
});

test("caller request mutation during the local await cannot alter the validated snapshot", async () => {
  let release!: (value: unknown) => void;
  let started!: () => void;
  const held = new Promise<unknown>((resolve) => { release = resolve; });
  const modelStarted = new Promise<void>((resolve) => { started = resolve; });
  const { authority, provider } = fixture();
  const model: LocalResearchModelAdapter = {
    name: "HELD_LOCAL_TEST_DOUBLE",
    callCount: 0,
    async classify() {
      (this as { callCount: number }).callCount += 1;
      started();
      return held;
    },
  };
  const mutable = request("Allgemeine Informationen zur Vertragsarbeitszeit in Deutschland.") as {
    organizationId: string;
    text: string;
    sourceIds: string[];
  } & LocalResearchRequest;
  mutable.sourceIds = [...mutable.sourceIds];
  const pending = new LocalResearchLane(authority, model, provider).run(mutable);
  await modelStarted;
  mutable.organizationId = "lab-org-b";
  mutable.text = "Nora Beispiel hat Fieber.";
  mutable.sourceIds[0] = "lab-private-note";
  release({ schemaVersion: 1, decision: "generalize", researchIntent: "WORKING_TIME_CHANGE", jurisdiction: "DE", language: "de" });
  const result = await pending;
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.originalText, "Allgemeine Informationen zur Vertragsarbeitszeit in Deutschland.");
});

test("authority snapshot is immune to source-object mutation during the local await", async () => {
  const mutableSource = {
    id: "lab-workingtime-note",
    organizationId: "lab-org-a",
    identifiers: [{ subjectId: "person-talea", type: "person_name" as const, value: "Talea Fantasie" }],
  };
  const authority = new InMemoryResearchAuthority({
    organizationId: "lab-org-a",
    actorId: "lab-actor-a",
    sessionId: "lab-session-1",
    readableSourceIds: ["lab-workingtime-note"],
  }, [mutableSource]);
  let release!: (value: unknown) => void;
  let started!: () => void;
  const held = new Promise<unknown>((resolve) => { release = resolve; });
  const modelStarted = new Promise<void>((resolve) => { started = resolve; });
  const model: LocalResearchModelAdapter = {
    name: "HELD_LOCAL_TEST_DOUBLE",
    callCount: 0,
    async classify() {
      (this as { callCount: number }).callCount += 1;
      started();
      return held;
    },
  };
  const provider = new OfflineResearchMock();
  const pending = new LocalResearchLane(authority, model, provider).run(request("Talea Fantasie möchte ihre Vertragsstunden ändern."));
  await modelStarted;
  mutableSource.organizationId = "lab-org-b";
  mutableSource.identifiers[0]!.value = "Changed Person";
  release({ schemaVersion: 1, decision: "generalize", researchIntent: "WORKING_TIME_CHANGE", jurisdiction: "DE", language: "de" });
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(provider.callCount, 1);
});

test("extra model fields, model uncertainty and identifier-bearing mock answers fail closed", async () => {
  const { authority, provider } = fixture();
  const extraFieldModel: LocalResearchModelAdapter = {
    name: "INVALID_LOCAL_TEST_DOUBLE",
    callCount: 0,
    async classify() {
      (this as { callCount: number }).callCount += 1;
      return { schemaVersion: 1, decision: "generalize", researchIntent: "WORKING_TIME_CHANGE", jurisdiction: "DE", language: "de", prose: "unsafe" };
    },
  };
  const invalid = await new LocalResearchLane(authority, extraFieldModel, provider).run(request("Allgemeine Informationen zur Vertragsarbeitszeit in Deutschland."));
  assert.deepEqual(invalid, { ok: false, reasonCode: "BLOCK_RESEARCH_MODEL_SCHEMA" });
  assert.equal(provider.callCount, 0);

  const second = fixture();
  second.provider.response = { text: "Talea Fantasie should do this." };
  const leaked = await second.lane.run(request("Allgemeine Informationen zur Vertragsarbeitszeit in Deutschland."));
  assert.deepEqual(leaked, { ok: false, reasonCode: "BLOCK_RESEARCH_PROVIDER_RESPONSE" });
});

test("a rights change while the mock is held prevents the answer from being displayed", async () => {
  let release!: (value: unknown) => void;
  let started!: () => void;
  const held = new Promise<unknown>((resolve) => { release = resolve; });
  const providerStarted = new Promise<void>((resolve) => { started = resolve; });
  const { authority, model } = fixture();
  const provider: ResearchMockProvider = {
    name: "MOCK_OFFLINE",
    callCount: 0,
    async generate() {
      (this as { callCount: number }).callCount += 1;
      started();
      return held;
    },
  };
  const pending = new LocalResearchLane(authority, model, provider).run(request("Allgemeine Informationen zur Vertragsarbeitszeit in Deutschland."));
  await providerStarted;
  authority.revokeSource("lab-workingtime-note");
  release({ text: "Synthetic general answer." });
  assert.deepEqual(await pending, { ok: false, reasonCode: "BLOCK_RESEARCH_STALE_GENERATION" });
});
