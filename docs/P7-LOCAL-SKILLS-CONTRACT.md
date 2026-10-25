# P7 local skills contract and implementation plan

Date: 2026-10-25  
Status: P7A architecture gate; no P7 model call or product integration has run.

## Scope and current baseline

P7 adds a separate local-only skill lane for synthetic text. It must not change the existing `PrivacyAwareAgent`, `privacyGate.ts`, provider transport, OpenAI budget ledgers, P6 research renderer, or their external-data boundaries. The current P5 checkpoint remains commit `4148a02` on branch `codex/offline-local-ui`; the uncommitted P6 work remains in place.

The existing P5 UI accepts one request plus fixed synthetic source IDs and invokes `PrivacyAwareAgent` with `MOCK_OFFLINE`. Its task radio buttons and fixture loader are not suitable as a P7 skill catalog, and its conservative pre-provider privacy classification remains part of the old external-agent contract. P7 therefore reuses the small local server, defensive headers, same-origin checks, bounded JSON handling, busy guard, cancellation, and general visual style, but not that orchestrator or source loader.

The verified project runtime is Node.js 20.20.1 at `/Users/my/.config/nvm/versions/node/v20.20.1/bin/node`. The managed command environment blocks Node loopback fetch with `EPERM`; authorized host-context execution was required for the P6 Ollama check. This is an execution-environment constraint, not a product fallback. P7 must never silently switch to a cloud provider when loopback is unavailable.

## Stable catalog

The canonical machine-readable catalog is `config/p7-skill-catalog.json`. IDs are stable product contracts:

| ID | Display name | P7 state | Result contract |
| --- | --- | --- | --- |
| `DOCUMENT_UNDERSTANDING` | Dokumente verstehen | implementation target | answer with host-validated paragraph citations |
| `INFORMATION_COMPARISON` | Informationen vergleichen | planned | unavailable |
| `TEXT_COMPOSITION` | Texte formulieren | implementation target | editable draft only, never an action |
| `PROCESS_PREPARATION` | Vorgänge vorbereiten | planned | unavailable |
| `GENERAL_RESEARCH` | Allgemein recherchieren | planned | unavailable; no external research |

Only `DOCUMENT_UNDERSTANDING` and `TEXT_COMPOSITION` may become executable in P7. The other IDs can be shown as planned but must never be accepted as working routes. A model proposal is advisory: it cannot create a skill, enable a planned skill, grant source access, or change the allowed combination of skill and sources.

## Trusted host authorization

Before any document segmentation or model call, trusted server code validates a closed authorization snapshot containing:

- schema and policy version;
- organization, principal, session, authorization-version, and request-generation identifiers;
- purpose fixed to `SYNTHETIC_LOCAL_EDITORIAL`;
- content scope fixed to `SYNTHETIC_DEMO_ONLY`;
- explicitly allowed executable skill IDs;
- explicitly readable host-resolved source IDs and whether synthetic inline attachments may be created by trusted server code;
- allowed source count, per-source bytes, aggregate source bytes, input bytes, and output bytes;
- whether selected synthetic health, child, or personnel examples may be handled locally;
- actions fixed to false and persistence fixed to false.

Role names, browser flags, document text, model output, and model instructions are data only. None can satisfy or modify this authorization. Every source has frozen trusted metadata for organization, read-only capability, source kind, and title. A host-resolved source ID must appear in `readableSourceIds`; an inline attachment is accepted only when `allowInlineSyntheticAttachments` is true and trusted server code has stamped the fixed organization. Deliberate attachment, filename, or a document's own permission claim never overrides a denial. A session switch, durable revocation, policy-version change, newer request generation, caller abort, or stale browser nonce invalidates held proposal and generation results before they can be displayed.

The fixed local demo policy must explicitly set `allowSensitiveSyntheticExamples` to true before this lane accepts any request. It may then allow synthetic health, child, and personnel examples because processing remains inside the authorized local lane. False stops before source reads and model calls; it is not presented as a universal content detector. P7 must not route authorized local examples through the existing blanket regex decision used before external providers. This does not weaken that existing gate. The server cannot prove that arbitrary pasted text is genuinely synthetic; the UI and documentation prohibit real data, and production use remains blocked until a separate lawful host policy and data-handling decision exist. No compliance guarantee is claimed, and Article 9 is not treated as a label for every name, address, or child-related sentence.

## Request and source contract

The browser sends only:

- free request text;
- zero to four explicitly selected plain-text attachments, each with a short display title and bounded text;
- one opaque UI request nonce used only to reject stale browser results.

There is no required skill selector or file-type selector. There is no file upload, path, URL, database lookup, mailbox, personnel record, OCR, PDF parser, or automatic source discovery. Text attachments remain in browser memory and one server request only; neither side uses local storage, IndexedDB, files, logs, or a knowledge cache.

After authorization, the host snapshots the request and assigns deterministic request-local source IDs and paragraph IDs such as `inline-1` and `inline-1:p03`. The UI presents these as “Abschnitt 1 · Absatz 3”. Paragraphs are bounded non-empty blocks separated by blank lines; P7 does not infer a document type or introduce a general parser. Model-provided IDs never replace host IDs.

Initial hard limits proposed for implementation:

- request text: 8 KiB UTF-8;
- attachment title: 128 bytes UTF-8;
- attachment body: 12 KiB UTF-8 each;
- selected attachments: at most 4;
- aggregate attachment text: 24 KiB UTF-8;
- paragraphs: at most 64 total, 4 KiB each;
- proposal response: 2 KiB;
- generated result: 8 KiB;
- one active request, no automatic retry, 20-second end-to-end timeout.

Those are outer HTTP and in-memory bounds. The mechanical P7 policy additionally limits each serialized proposal or generation input, plus a conservative 4 KiB fixed-prompt reserve, to 12 KiB. The adapter separately verifies the final serialized messages and response schema against the same 12 KiB model-prompt ceiling before transport. Its model context is fixed to 16,384 tokens, proposal output to 128 tokens, and generation output to 768 tokens, below the host hard maximum of 1,024. The HTTP request ceiling is a separate 24 KiB transport bound and is never used as the model-context budget. Both prompt configurations use identical context and output budgets. Input that exceeds either effective model bound stops with a clear message while browser input remains available; there is no truncation, chunker, retry, larger model, or hidden warm-up.

Oversize, invalid Unicode structure, duplicate source IDs, authorization changes, or malformed model results stop with a neutral error and no second call.

## Two-stage local model contract

At most two local model calls are allowed for one request.

1. **Task proposal.** The corrected route-v2 contract gives the model one closed choice rather than three interdependent fields. It receives the authorized request snapshot and attachment metadata/text and returns exactly `{ "schemaVersion": 1, "route": ... }`, where `route` is one of `UNDERSTAND_DOCUMENTS`, `COMPOSE_TEXT`, `UNDERSTAND_THEN_COMPOSE`, `CLARIFY`, or `UNSUPPORTED`. The host maps those values to the known understanding skill, composition skill, exact ordered pair, fixed clarification, or fixed unsupported response. Unknown routes and extra fields fail schema validation. The model cannot provide catalog IDs, grant source rights, or change the combination. `CLARIFY` and `UNSUPPORTED` cause no second call and cannot expand data access.
2. **Generation.** Only after another authorization/generation check, the model receives a skill-specific closed prompt. `DOCUMENT_UNDERSTANDING` must return an answer plus unique host paragraph IDs. The host rejects unknown, duplicate, unselected, or citation-free factual results and renders citation labels from its own snapshot. ID membership proves selection, not semantic support or factual correctness. `TEXT_COMPOSITION` returns one editable draft and no action instruction or execution result. For the fixed pair, the same one generation call must return exactly an explanation part followed by a draft part. Planned skill IDs cannot reach this stage.

The adapter stays fixed to the reviewed loopback endpoint, pinned local model, explicit enablement, complete response envelope, byte caps, no tools, no retry, no streaming, and no cloud fallback. The original P7B A/B comparison was run once after preregistration and failed all four development positives for both configurations. Its ten calls, durable claim, hashes, and limits remain historical evidence in `P7B-DEVELOPMENT-RESULT.md`; they are never reset or relabelled as route-v2 results.

After that failure, and before any further inference or holdout access, the disclosed protocol amendment `P7_ROUTE_V2_CONTRACT_CORRECTION` was frozen with SHA-256 `48a0f4cbece22c424057d9613ea4b6ce90a13e0c57e928d2d51d43eed4c9c689`. It authorizes exactly one correction configuration, `P7_ROUTE_V2`, using the same model and limits. The same six known development cases may run once with at most nine additional counted POSTs under a separate durable claim. Only if at least three of four development positives and every critical protection pass may the unchanged private holdouts run once with at most nine POSTs. A later real-UI smoke remains separately gated and capped at four POSTs. The amendment permits at most 32 cumulative POSTs (10 historical + 9 correction development + 9 holdout + 4 UI); the remaining eight below the older hard ceiling of 40 are not authorization for further experiments. Warm-ups, probes, retries, a second route-v2 prompt, and post-holdout tuning are prohibited.

The six disclosed development cases and their exact expected skill IDs, source paragraphs, criteria, and per-configuration call caps are versioned in `P7-DEVELOPMENT-CASES.json`. The independent reader retains six additional holdouts privately. The original complete 12-case catalog was frozen before model use with SHA-256 `77cdd0add0cf94e7c3c66f00022ea1fd7b36e66f9d3eaf3e1182f48977367088`. Minimum acceptance for the selected configuration is 7 of 8 positive cases overall, at least 3 of 4 holdout positives, at least one accepted holdout for each executable skill, and all critical authorization, source, injection, no-action, and rights cases passing with zero tolerance for a security-relevant violation.

## UI contract

The P5 server and page structure may be extended with a visibly separate “Local skills experiment” panel. It must show:

- the applied skill after host validation;
- runtime label `LOCAL_TEST_DOUBLE` during mechanical implementation or the exact local model label only after P7C acceptance;
- selected source titles and host paragraph citations;
- clear planned/unavailable labels for catalog items 2, 4, and 5;
- neutral clarification, unsupported, loading, blocked, timeout, and error states;
- retained browser input after an error, without persistent browser storage.

The UI must not present P5 `MOCK_OFFLINE` output as a real local-model result. Real-model UI wiring remains blocked until the preregistered comparison and independent security/usefulness review pass. Browser-provided role, permission, skill, provider, or model flags are rejected as extra fields.

## Proposed implementation files after the architecture gate

New files:

- `src/localSkillTypes.ts` — closed IDs, requests, policies, proposal and result types;
- `src/localSkillCatalog.ts` — load/freeze the checked-in catalog and validate executable IDs;
- `src/localSkillAuthority.ts` — trusted snapshot and revocation/generation fences;
- `src/localSkillSources.ts` — bounded in-memory text snapshot and host paragraph IDs;
- `src/localSkillLane.ts` — authorization, proposal, skill dispatch, citation validation, final fence;
- `src/localSkillModel.ts` — injected proposal/generation interface and deterministic test double;
- `tests/localSkillCatalog.test.ts`, `tests/localSkillLane.test.ts`, `tests/localSkillSources.test.ts`;
- `src/ollamaLocalSkillAdapter.ts` and its focused tests — prepare and freeze the two reviewed prompt configurations before P7B, without running inference or connecting the real-model UI.

Narrow modifications:

- `src/localUiServer.ts` — add a separate bounded `/api/local-skills/run` route with a fixed server-side synthetic policy;
- `tests/localUiServer.test.ts` — boundary, stale response, no persistence, and accurate provider/skill/source labels;
- `ui/index.html`, `ui/app.js`, and `ui/styles.css` — separate P7 panel using plain-text attachments only;
- `README.md` and P7 reports — scope, startup, result, and limitations.

The existing `src/index.ts`, `src/orchestrator.ts`, `src/privacyGate.ts`, all seven P6 core-hash files, the P6 adapter, OpenAI files and ledgers, and fixed knowledge fixtures are not modified. This preserves the reproducible P6 code hashes while P7 remains an internal module set.

## Sequential acceptance plan

1. **P7A architecture gate:** accept this catalog, host authorization boundary, limits, two-stage schema, citation design, and file plan.
2. **Mechanical local lane:** implement catalog/authority/source snapshots/lane with a clearly labelled deterministic test double; run unit and server-boundary tests. No model inference.
3. **P7B original comparison:** preserve the failed A/B development run as historical evidence; do not open holdouts or select a failed configuration.
4. **P7C disclosed route-v2 correction:** freeze the single simplified route contract, offline mappings, protected synthetic benchmark capture, cumulative budget, and correction runner before one correction-development run. Continue to holdout only if the amendment's development and critical gates remain attainable.
5. **Real local UI gate:** wire the accepted local adapter only if safety and usefulness criteria pass; otherwise keep the test-double panel non-product or remove it.
6. **P7D final evidence:** document commands, tests, local startup, process shutdown, known limits, and exact hashes. Only then may the already authorized PAA-only push/PR flow be prepared for an exact reviewed SHA. No tag, npm publication, hosting, Netlify, or Amsel change is included.

## Architecture-gate questions

The implementation can proceed without a product decision if the following defaults are accepted: four text attachments, 24 KiB aggregate text, blank-line paragraph IDs, fixed host clarification messages, and a separate P7 panel. Any request for real files, real organizational data, automatic source discovery, external research, or a general document parser is outside this package and requires a new decision.
