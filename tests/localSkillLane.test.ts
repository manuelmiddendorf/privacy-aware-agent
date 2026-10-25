import assert from "node:assert/strict";
import test from "node:test";
import { LocalSkillAuthority } from "../src/localSkillAuthority.js";
import { LocalSkillLane } from "../src/localSkillLane.js";
import { LocalSkillTestDouble } from "../src/localSkillModel.js";
import { createHostResolvedSource, createInlineSyntheticSource } from "../src/localSkillSources.js";
import type { LocalSkillModel, TrustedLocalSkillPolicy } from "../src/localSkillTypes.js";

const POLICY: TrustedLocalSkillPolicy = {
  schemaVersion: 1,
  policyId: "p7-test-policy",
  organizationId: "p7-lab-org-a",
  principalId: "synthetic-user",
  sessionId: "synthetic-session",
  authorizationVersion: 1,
  purpose: "SYNTHETIC_LOCAL_EDITORIAL",
  contentScope: "SYNTHETIC_DEMO_ONLY",
  executableSkillIds: ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"],
  readableSourceIds: ["allowed-source"],
  allowInlineSyntheticAttachments: true,
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

const inline = (id: string, text: string) => createInlineSyntheticSource({ id, organizationId: POLICY.organizationId, title: `Titel ${id}` }, text);
const request = (nonce: string, text: string, sources = [inline("inline-1", "Ein vollständig synthetischer Absatz.")]) => ({
  schemaVersion: 1 as const,
  requestNonce: nonce,
  text,
  sources,
});

test("synthetic sensitive examples can stay local when the trusted host policy permits them", async () => {
  const model = new LocalSkillTestDouble();
  const lane = new LocalSkillLane(new LocalSkillAuthority(POLICY), model);
  const result = await lane.run(request("nonce-1001", "Fasse den synthetischen Text zusammen.", [
    inline("inline-health", "Das erfundene Kind hat Fieber. Dieser Satz ist ausschließlich ein synthetischer lokaler Test."),
  ]));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.skillIds, ["DOCUMENT_UNDERSTANDING"]);
    assert.equal(result.provider, "LOCAL_TEST_DOUBLE");
    assert.deepEqual(result.parts[0]?.citations.map(({ paragraphId }) => paragraphId), ["inline-health:p01"]);
  }
  assert.equal(model.proposalCallCount, 1);
  assert.equal(model.generationCallCount, 1);
});

test("text composition works without a document and remains labelled as a draft", async () => {
  const model = new LocalSkillTestDouble();
  const result = await new LocalSkillLane(new LocalSkillAuthority(POLICY), model)
    .run(request("nonce-1002", "Formuliere eine freundliche synthetische Einladung.", []));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.skillIds, ["TEXT_COMPOSITION"]);
    assert.equal(result.parts[0]?.resultKind, "draft");
    assert.deepEqual(result.parts[0]?.citations, []);
  }
});

test("the one fixed understand-plus-compose combination uses one proposal and one generation", async () => {
  const model = new LocalSkillTestDouble();
  const result = await new LocalSkillLane(new LocalSkillAuthority(POLICY), model)
    .run(request("nonce-1010", "Erkläre den Text und formuliere daraus einen freundlichen Entwurf."));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.skillIds, ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"]);
    assert.deepEqual(result.parts.map(({ resultKind }) => resultKind), ["answer", "draft"]);
    assert.equal(result.parts[0]?.citations.length, 1);
    assert.equal(result.parts[1]?.citations.length, 0);
  }
  assert.equal(model.proposalCallCount, 1);
  assert.equal(model.generationCallCount, 1);
});

test("ambiguous requests ask one fixed question and make no generation call", async () => {
  const model = new LocalSkillTestDouble();
  const result = await new LocalSkillLane(new LocalSkillAuthority(POLICY), model)
    .run(request("nonce-1003", "Kannst du das bitte für mich erledigen?", []));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reasonCode, "LOCAL_SKILL_CLARIFICATION_REQUIRED");
    assert.match(result.message, /verstehen oder.*formulieren/i);
  }
  assert.equal(model.proposalCallCount, 1);
  assert.equal(model.generationCallCount, 0);
});

test("an unknown route is rejected as a closed-schema model error and cannot create a third stage", async () => {
  const model: LocalSkillModel = {
    name: "LOCAL_TEST_DOUBLE",
    proposalCallCount: 0,
    generationCallCount: 0,
    async propose() { return { schemaVersion: 1, route: "GENERAL_RESEARCH" }; },
    async generate() { throw new Error("must not run"); },
  };
  const result = await new LocalSkillLane(new LocalSkillAuthority(POLICY), model)
    .run(request("nonce-1004", "Recherchiere allgemein", []));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reasonCode, "LOCAL_SKILL_MODEL_SCHEMA");
});

test("closed routes map only to the two known skills, fixed pair, clarification or unsupported", async () => {
  const cases = [
    { route: "UNDERSTAND_DOCUMENTS", sources: request("nonce-map1", "Erkläre den Text"), expected: ["DOCUMENT_UNDERSTANDING"] },
    { route: "COMPOSE_TEXT", sources: request("nonce-map2", "Formuliere einen Text", []), expected: ["TEXT_COMPOSITION"] },
    { route: "UNDERSTAND_THEN_COMPOSE", sources: request("nonce-map3", "Erkläre und formuliere"), expected: ["DOCUMENT_UNDERSTANDING", "TEXT_COMPOSITION"] },
  ] as const;
  for (const item of cases) {
    const model: LocalSkillModel = {
      name: "LOCAL_TEST_DOUBLE", proposalCallCount: 0, generationCallCount: 0,
      async propose() { return { schemaVersion: 1, route: item.route }; },
      async generate(input) {
        return { schemaVersion: 1, parts: input.skillIds.map((skillId) => ({
          skillId,
          kind: skillId === "DOCUMENT_UNDERSTANDING" ? "answer" : "draft",
          text: "Synthetisches Ergebnis",
          citationParagraphIds: skillId === "DOCUMENT_UNDERSTANDING" ? ["inline-1:p01"] : [],
        })) };
      },
    };
    const result = await new LocalSkillLane(new LocalSkillAuthority(POLICY), model).run(item.sources);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.skillIds, item.expected);
  }

  for (const raw of [
    { schemaVersion: 1, route: "CLARIFY" },
    { schemaVersion: 1, route: "UNSUPPORTED" },
    { schemaVersion: 1, route: "COMPOSE_TEXT", skillIds: ["TEXT_COMPOSITION"] },
    { schemaVersion: 1, route: "UNKNOWN" },
  ]) {
    const model: LocalSkillModel = {
      name: "LOCAL_TEST_DOUBLE", proposalCallCount: 0, generationCallCount: 0,
      async propose() { return raw; },
      async generate() { throw new Error("must not run"); },
    };
    const result = await new LocalSkillLane(new LocalSkillAuthority(POLICY), model)
      .run(request(`nonce-closed-${raw.route.toLowerCase()}`, "Bitte bearbeiten", []));
    assert.equal(result.ok, false);
    if (!result.ok) {
      const expected = raw.route === "CLARIFY" ? "LOCAL_SKILL_CLARIFICATION_REQUIRED"
        : raw.route === "UNSUPPORTED" ? "LOCAL_SKILL_UNSUPPORTED"
        : "LOCAL_SKILL_MODEL_SCHEMA";
      assert.equal(result.reasonCode, expected);
    }
  }
});

test("P7-11 denied source makes zero content and model calls", async () => {
  let reads = 0;
  const denied = createHostResolvedSource({ id: "p7-denied", organizationId: POLICY.organizationId, title: "Nicht freigegeben" }, () => {
    reads += 1;
    return "Dieser erfundene Entwurf darf für diesen Nutzer nicht gelesen werden.";
  });
  const model = new LocalSkillTestDouble();
  const result = await new LocalSkillLane(new LocalSkillAuthority({ ...POLICY, readableSourceIds: [] }), model)
    .run(request("nonce-1005", "Fasse den beigefügten Text zusammen.", [denied]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reasonCode, "LOCAL_SKILL_SOURCE_DENIED");
  assert.equal(reads, 0);
  assert.equal(model.proposalCallCount, 0);
  assert.equal(model.generationCallCount, 0);
});

test("the synthetic-sensitive host capability is explicit and revocation stays denied", async () => {
  let reads = 0;
  const source = createHostResolvedSource({ id: "allowed-source", organizationId: POLICY.organizationId, title: "Freigegeben" }, () => {
    reads += 1;
    return "Synthetischer Text";
  });
  const disabledModel = new LocalSkillTestDouble();
  const disabled = await new LocalSkillLane(new LocalSkillAuthority({ ...POLICY, allowSensitiveSyntheticExamples: false }), disabledModel)
    .run(request("nonce-1011", "Fasse zusammen", [source]));
  assert.equal(disabled.ok, false);
  assert.equal(reads, 0);
  assert.equal(disabledModel.proposalCallCount, 0);

  const authority = new LocalSkillAuthority(POLICY);
  authority.revoke();
  const revokedModel = new LocalSkillTestDouble();
  const revoked = await new LocalSkillLane(authority, revokedModel)
    .run(request("nonce-1012", "Formuliere einen Text", []));
  assert.equal(revoked.ok, false);
  assert.equal(revokedModel.proposalCallCount, 0);
  assert.throws(() => authority.begin(request("nonce-1013", "Formuliere einen Text", [])), /revoked/);
});

test("caller abort stops before calls and discards held proposal or generation results", async () => {
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  const untouched = new LocalSkillTestDouble();
  const before = await new LocalSkillLane(new LocalSkillAuthority(POLICY), untouched)
    .run(request("nonce-1014", "Formuliere einen Text", []), { signal: alreadyAborted.signal });
  assert.equal(before.ok, false);
  if (!before.ok) assert.equal(before.reasonCode, "LOCAL_SKILL_CANCELLED");
  assert.equal(untouched.proposalCallCount, 0);

  let releaseProposal!: () => void;
  const heldProposal = new Promise<void>((resolve) => { releaseProposal = resolve; });
  const proposalModel: LocalSkillModel = {
    name: "LOCAL_TEST_DOUBLE", proposalCallCount: 0, generationCallCount: 0,
    async propose() {
      await heldProposal;
      return { schemaVersion: 1, route: "COMPOSE_TEXT" };
    },
    async generate() { throw new Error("must not run"); },
  };
  const proposalAbort = new AbortController();
  const proposalPending = new LocalSkillLane(new LocalSkillAuthority(POLICY), proposalModel)
    .run(request("nonce-1015", "Formuliere einen Text", []), { signal: proposalAbort.signal });
  proposalAbort.abort();
  releaseProposal();
  const proposalResult = await proposalPending;
  assert.equal(proposalResult.ok, false);
  if (!proposalResult.ok) assert.equal(proposalResult.reasonCode, "LOCAL_SKILL_CANCELLED");

  let releaseGeneration!: () => void;
  const heldGeneration = new Promise<void>((resolve) => { releaseGeneration = resolve; });
  const generationModel: LocalSkillModel = {
    name: "LOCAL_TEST_DOUBLE", proposalCallCount: 0, generationCallCount: 0,
    async propose() { return { schemaVersion: 1, route: "COMPOSE_TEXT" }; },
    async generate() {
      await heldGeneration;
      return { schemaVersion: 1, parts: [{ skillId: "TEXT_COMPOSITION", kind: "draft", text: "Nicht anzeigen", citationParagraphIds: [] }] };
    },
  };
  const generationAbort = new AbortController();
  const generationPending = new LocalSkillLane(new LocalSkillAuthority(POLICY), generationModel)
    .run(request("nonce-1016", "Formuliere einen Text", []), { signal: generationAbort.signal });
  await new Promise((resolve) => setImmediate(resolve));
  generationAbort.abort();
  releaseGeneration();
  const generationResult = await generationPending;
  assert.equal(generationResult.ok, false);
  if (!generationResult.ok) assert.equal(generationResult.reasonCode, "LOCAL_SKILL_CANCELLED");
});

test("authorization changes discard held proposal and generation results", async () => {
  let releaseProposal!: () => void;
  const proposalHeld = new Promise<void>((resolve) => { releaseProposal = resolve; });
  const authority = new LocalSkillAuthority(POLICY);
  const model: LocalSkillModel = {
    name: "LOCAL_TEST_DOUBLE",
    proposalCallCount: 0,
    generationCallCount: 0,
    async propose() {
      await proposalHeld;
      return { schemaVersion: 1, route: "UNDERSTAND_DOCUMENTS" };
    },
    async generate() { throw new Error("must not run"); },
  };
  const pending = new LocalSkillLane(authority, model).run(request("nonce-1006", "Fasse den Text zusammen."));
  authority.revoke();
  releaseProposal();
  const result = await pending;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reasonCode, "LOCAL_SKILL_STALE_GENERATION");

  let releaseGeneration!: () => void;
  const generationHeld = new Promise<void>((resolve) => { releaseGeneration = resolve; });
  const authority2 = new LocalSkillAuthority(POLICY);
  const model2: LocalSkillModel = {
    name: "LOCAL_TEST_DOUBLE",
    proposalCallCount: 0,
    generationCallCount: 0,
    async propose() { return { schemaVersion: 1, route: "COMPOSE_TEXT" }; },
    async generate() {
      await generationHeld;
      return { schemaVersion: 1, parts: [{ skillId: "TEXT_COMPOSITION", kind: "draft", text: "Nicht anzeigen", citationParagraphIds: [] }] };
    },
  };
  const pending2 = new LocalSkillLane(authority2, model2).run(request("nonce-1007", "Formuliere einen Text", []));
  await new Promise((resolve) => setImmediate(resolve));
  authority2.invalidateForNewRequest();
  releaseGeneration();
  const result2 = await pending2;
  assert.equal(result2.ok, false);
  if (!result2.ok) assert.equal(result2.reasonCode, "LOCAL_SKILL_STALE_GENERATION");
});

test("unknown citations and oversized contexts fail closed without truncation", async () => {
  const badCitation: LocalSkillModel = {
    name: "LOCAL_TEST_DOUBLE",
    proposalCallCount: 0,
    generationCallCount: 0,
    async propose() { return { schemaVersion: 1, route: "UNDERSTAND_DOCUMENTS" }; },
    async generate() { return { schemaVersion: 1, parts: [{ skillId: "DOCUMENT_UNDERSTANDING", kind: "answer", text: "Antwort", citationParagraphIds: ["foreign:p01"] }] }; },
  };
  const invalid = await new LocalSkillLane(new LocalSkillAuthority(POLICY), badCitation)
    .run(request("nonce-1008", "Fasse den Text zusammen."));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.reasonCode, "LOCAL_SKILL_OUTPUT_INVALID");

  const model = new LocalSkillTestDouble();
  const tooLarge = await new LocalSkillLane(new LocalSkillAuthority({ ...POLICY, limits: { ...POLICY.limits, maxModelContextBytes: 4_500 } }), model)
    .run(request("nonce-1009", "Fasse den Text zusammen.", [inline("inline-context", "x".repeat(1_000))]));
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) assert.equal(tooLarge.reasonCode, "LOCAL_SKILL_CONTEXT_TOO_LARGE");
  assert.equal(model.proposalCallCount, 0);
});
