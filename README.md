# privacy-aware-agent

A small TypeScript/Node reference implementation of a policy-bound assistant. The existing external-provider path follows **privacy gate before model access**: missing or explicitly insufficient evidence, sensitive content, uncertain content, denied sources, and technical gate failures stop before a provider call. The separately isolated P7 synthetic local-only experiment uses prior host authorization and source checks instead of weakening or reusing that external boundary.

The ordinary version 0.1 workflow is offline and intentionally limited. It uses a deterministic provider named `MOCK_OFFLINE`, synthetic help documents, and no API keys, live model, external actions, arbitrary URLs, or file access. A separate, default-disabled synthetic OpenAI preflight is documented below.

The separately gated P6 local-model research experiment is not connected to the product or local UI. Its pinned transport worked, but the first frozen run overblocked all reached cases and continued none of four expected safe positives. The current product path therefore remains `MOCK_OFFLINE`; see [the P6 result](docs/P6-LOCAL-MODEL-RESULT.md).

P7 defines a stable five-skill catalog and a separate local-only synthetic text lane; only “Dokumente verstehen” and “Texte formulieren”, plus their one fixed two-part combination, are mechanical implementation targets. The remaining skills stay visibly planned and unavailable. Its older UI stays explicitly labelled `LOCAL_TEST_DOUBLE` and collapsed below the newer pilot. It is not a generic real-model router. See [the P7 contract](docs/P7-LOCAL-SKILLS-CONTRACT.md).

P8 adds one narrow synthetic working-time-contract draft workflow. Its host-owned scope, separate user confirmation, field-scoped source reads, optional fixed offline research mock, and editable non-binding output have been exercised through bounded development workflows. The original three-case run did not pass as a whole; later separately gated evidence covered the corrected complete path, the separately confirmed follow-up, and the fixed-mock research path. The eight-call P8 workflow allowance is exhausted. One separately reviewed browser smoke used exactly three additional UI calls and completed the single synthetic clarification-to-draft path. The default UI server still leaves the real local-model runner disabled. See [the P8 UI candidate](docs/P8-UI-CANDIDATE.md) and [the UI smoke result](docs/P8-UI-SMOKE-RESULT.md).

P9A evolves that workflow into the narrow local skill **Vertragsänderung vorbereiten** and adds a separate closed catalog choice for a reusable synthetic general template. The optional template request contains no person, contract, hours, date, pay, history, or scope identifiers. Its response must match one exact section and placeholder schema. The local model returns only a closed facts/comparison/open-points proposal; host code validates source facts and deterministically renders the editable agreement. A reported source conflict stops before rendering. The first separately gated synthetic run used two local-model calls and failed closed because the model field proposal omitted required source fields; the second preregistered case was not run. The corrected host declares all four skill-required fields instead of treating the model proposal as the dependency definition. A separately reviewed two-call correction of the same template case then passed and rendered the grounded host-owned agreement. The aggregate P9 allowance of four calls is exhausted; the unrun local-template 32.5-hour/leap-day variant remains untested. See [the P9 plan](docs/P9-CONTRACT-TEMPLATE-PLAN.md) and [the preserved P9A development result](docs/P9A-DEVELOPMENT-RESULT.md).

P9B adds only an isolated TypeScript library and synthetic tests for a reduced clause-structure preview. It is disabled by default, has no UI or product route, and has no real provider. When trusted host code enables the test fixture, it reads one field-scoped, closed synthetic structure, creates an exact placeholder-only outgoing-text preview, and requires a confirmation bound to its hash, revision, organization, session, task, source, and current rights generation. Only two fixed headings are editable; private values, extra text, unknown clause shapes, rare combinations, stale confirmation, revocation, or failed final checks stop before the `MOCK_OFFLINE` transport. This is narrow allowlisting for one synthetic structure, not anonymization or a general PII detector. See [the P9B result](docs/P9B-REDUCED-CLAUSE-RESULT.md).

## Concrete synthetic P9 example

This is the one corrected P9A path that passed its separately gated local-model run. Every value below is synthetic. It demonstrates closed model coordination and host validation; it is not legal advice, a legal-sufficiency check, or evidence that the original failed preregistered run passed.

1. **Actual local merge input.** These private local values stayed on the machine and were supplied only after host authorization and the field-scoped getter:

   ```json
   {
     "requestText": "Bestätigt: Bereite für Lina Mustervertrag eine unverbindliche Änderung auf 25 Wochenstunden ab 2031-09-01 mit der synthetischen allgemeinen Vorlage vor. Keine allgemeine Recherche.",
     "targetWeeklyHours": 25,
     "effectiveDate": "2031-09-01",
     "source": {
       "display_name": "Lina Mustervertrag",
       "current_weekly_hours": 20,
       "contract_paragraphs": [
         {"id":"contract-lina:p01","text":"Bisherige vertragliche Arbeitszeit 20 Stunden je Woche"},
         {"id":"contract-lina:p02","text":"Andere Vertragsbestimmungen bleiben unverändert"}
       ],
       "unchanged_terms": "Andere Vertragsbestimmungen bleiben unverändert"
     },
     "generalRequirements": null,
     "generalTemplate": {
       "schemaVersion": 1,
       "templateId": "SYNTHETIC_WORKING_TIME_AMENDMENT_V1",
       "sections": {
         "heading": "Änderungsvereinbarung zur Wochenarbeitszeit",
         "parties": "Zwischen {{EMPLOYER_NAME}} und {{EMPLOYEE_NAME}} wird folgende Änderung vereinbart:",
         "change": "Die bisherige Wochenarbeitszeit von {{CURRENT_WEEKLY_HOURS}} Stunden wird mit Wirkung zum {{EFFECTIVE_DATE}} auf {{NEW_WEEKLY_HOURS}} Stunden geändert.",
         "unchangedTerms": "Alle übrigen Vertragsbestimmungen bleiben unverändert.",
         "signatures": "Ort, Datum und Unterschriften beider Parteien"
       },
       "placeholders": ["{{EMPLOYER_NAME}}","{{EMPLOYEE_NAME}}","{{CURRENT_WEEKLY_HOURS}}","{{NEW_WEEKLY_HOURS}}","{{EFFECTIVE_DATE}}"],
       "provenance": {"provider":"MOCK_OFFLINE","catalogVersion":1,"goal":"generic_amendment_template"}
     },
     "constraints": [
       "UNVERBINDLICHER_ENTWURF",
       "GESCHLOSSENER_FAKTENABGLEICH",
       "OFFENE_PUNKTE_GETRENNT",
       "KEINE_ERFUNDENEN_WERTE",
       "KEINE_AKTIONEN"
     ]
   }
   ```

2. **Exact general `MOCK_OFFLINE` template request.** It contains none of the local values above:

   ```json
   {
     "instruction": "Erstelle ausschließlich die geschlossene synthetische Vorlage für eine Änderungsvereinbarung zur Wochenarbeitszeit. Verwende nur die vorgegebenen Abschnitte und Platzhalter; ergänze keine Nebenbedingungen, Quellen oder Einzelfalldaten.",
     "templateRequest": {
       "documentType": "working_time_amendment_agreement",
       "jurisdiction": "DE",
       "language": "de",
       "goal": "generic_amendment_template",
       "sections": ["heading","parties","change","unchangedTerms","signatures"],
       "placeholders": ["{{EMPLOYER_NAME}}","{{EMPLOYEE_NAME}}","{{CURRENT_WEEKLY_HOURS}}","{{NEW_WEEKLY_HOURS}}","{{EFFECTIVE_DATE}}"]
     },
     "parameters": {"format":"closed_json","maxResponseBytes":4096}
   }
   ```

3. **Exact accepted synthetic template answer.** The fixed mock, not the local model, supplied this general structure:

   ```json
   {
     "schemaVersion": 1,
     "templateId": "SYNTHETIC_WORKING_TIME_AMENDMENT_V1",
     "sections": {
       "heading": "Änderungsvereinbarung zur Wochenarbeitszeit",
       "parties": "Zwischen {{EMPLOYER_NAME}} und {{EMPLOYEE_NAME}} wird folgende Änderung vereinbart:",
       "change": "Die bisherige Wochenarbeitszeit von {{CURRENT_WEEKLY_HOURS}} Stunden wird mit Wirkung zum {{EFFECTIVE_DATE}} auf {{NEW_WEEKLY_HOURS}} Stunden geändert.",
       "unchangedTerms": "Alle übrigen Vertragsbestimmungen bleiben unverändert.",
       "signatures": "Ort, Datum und Unterschriften beider Parteien"
     },
     "placeholders": ["{{EMPLOYER_NAME}}","{{EMPLOYEE_NAME}}","{{CURRENT_WEEKLY_HOURS}}","{{NEW_WEEKLY_HOURS}}","{{EFFECTIVE_DATE}}"],
     "provenance": {"provider":"MOCK_OFFLINE","catalogVersion":1,"goal":"generic_amendment_template"}
   }
   ```

4. **Actual closed local-model merge and host result.** The model returned facts and citations, not agreement prose:

   ```json
   {
     "schemaVersion": 1,
     "documentKind": "working_time_amendment",
     "displayName": "Lina Mustervertrag",
     "currentWeeklyHours": 20,
     "targetWeeklyHours": 25,
     "effectiveDate": "2031-09-01",
     "unchangedTermsConfirmed": true,
     "citations": ["contract-lina:p01","contract-lina:p02"],
     "conflicts": [],
     "openPoints": [],
     "reviewNotes": [
       "Die Änderung auf 25 Wochenstunden ab 2031-09-01 ist im Rahmen der synthetischen allgemeinen Vorlage festgelegt.",
       "Keine allgemeine Recherche durchgeführt. Nur die spezifische Änderung und die bestehenden Vertragsbestimmungen berücksichtigt."
     ]
   }
   ```

   After exact host checks, deterministic rendering now produces:

   ```text
   Unverbindlicher, ungeprüfter synthetischer Entwurf

   Änderungsvereinbarung zur Wochenarbeitszeit

   Zwischen [ARBEITGEBER ERGÄNZEN] und Lina Mustervertrag wird folgende Änderung vereinbart:

   Die bisherige Wochenarbeitszeit von 20 Stunden wird mit Wirkung zum 01.09.2031 auf 25 Stunden geändert.

   Alle übrigen Vertragsbestimmungen bleiben unverändert.

   Vertragsquellen: contract-lina:p01, contract-lina:p02

   Ort, Datum und Unterschriften beider Parteien
   ```

   The host keeps two separate open points: `Arbeitgeberbezeichnung ergänzen.` and `Vergütung und mögliche Folgewirkungen sind nicht belegt und müssen getrennt geprüft werden.` The visible first line was added mechanically after the accepted run and made no additional model call.

## Quick start

Requires Node.js 20 or newer.

```sh
npm ci
npm run typecheck
npm test
npm run test:adapter
npm run eval
npm run demo
```

The demo prints four synthetic scenarios: a source-backed answer containing exactly the four approved board-meeting steps; a deterministic `MOCK_OFFLINE` gardening-day example letter with visible placeholders and no action; a blocked child-and-illness request with neutral reformulation help; and a binding-notice question whose selected, approved meeting document is explicitly insufficient, so no deadline or citation is invented. Output contains reason codes and provider-call counts rather than real personal content.

## Security and privacy model

- The HOSTSERVER supplies a closed-schema trusted policy with explicit task and source capabilities.
- User text, model output, documents, metadata, role labels, and documentation cannot expand that policy.
- A role alone is never permission.
- Inputs are classified as `safe`, `redactable`, `sensitive`, or `uncertain`, with stable reason codes.
- Any runtime classifier result outside those four states fails closed as `BLOCK_CLASSIFICATION_INVALID` before source loading or provider access.
- Sensitive and uncertain inputs fail closed with zero provider calls.
- Supported direct identifiers can be pseudonymized, then the entire provider context is scanned again.
- The final provider context must be exactly `safe`; a remaining `redactable`, `sensitive`, or `uncertain` result makes zero provider calls.
- Health data, child data, sensitive personnel data, credentials, and financial identifiers are blocked.
- Simple person-name shapes that the prototype cannot safely pseudonymize are treated as uncertain and blocked.
- Source rights are checked before loading and again through tenant and size constraints.
- Logs and audit events exclude prompts, document bodies, API keys, and personal identifiers.

Pseudonymization is not anonymization. The rule-based scanner is conservative but incomplete: indirect identifiers, novel wording, multilingual edge cases, encoded data, images, and adversarial content can escape it. This prototype makes no legal or compliance guarantee. A production system needs reviewed detectors, secure isolation, retention controls, monitoring, incident handling, and independent security/privacy assessment.

Questions require at least one explicitly approved source. A summary may operate on general, non-sensitive text supplied directly by the user without an external source; if it requests an external document, that source must still be explicitly approved for `summarize`. A free draft may use no source. If a draft does request sources, each source must explicitly allow `draft`. The deterministic mock enforces the same evidence shape as a defensive check and returns task-specific answer, summary, or draft output.

Every request that loads documents requires a trusted, synchronous evidence assessor after all privacy and source checks and before provider access. Unassessed source-backed requests fail closed. Only the literal boolean `true` permits provider access; `false`, unknown runtime values, objects, promises, and technical failures all stop with zero provider calls. Source-free drafts and summaries remain available. The fixed demo/eval pairs use exact synthetic host decisions bound to the complete request and loaded fixture contents. These manual fixture decisions are not a general semantic sufficiency or hallucination detector.

The mock provider and the narrow synthetic live check cannot establish that a real LLM resists prompt injection generally. Before broader or production live-model use, treat all retrieved content as hostile and add model-specific isolation, output controls, red-team tests, and provider governance.

## Local offline UI

The small browser demo binds only to `http://127.0.0.1:4317`, stores no submitted text, serves no arbitrary files, and has no key path. Its primary panel prepares only the synthetic P9A working-time amendment workflow. The browser supplies task text and an exact confirmation snapshot, including separate general-reference and general-template choices; organization, actor, session, task, source, person scope, readable fields, and both capabilities remain fixed server-side. The default server does not connect a real local model, so the panel returns a neutral unavailable result until a separately reviewed host runner is injected. P9B is deliberately absent from this server and UI.

Start it with Node.js 20 or newer:

```sh
npm run ui:local
```

Open `http://127.0.0.1:4317`. No account is required. Press `Ctrl+C` in the starting terminal to stop it. Use synthetic examples only. The draft is editable in memory; changing task fields invalidates pending confirmation and late responses, while changing an existing draft during a request prevents the new response from overwriting it. No save, send, contract-change, provider, or persistence action exists.

The previous `MOCK_OFFLINE` and P7 `LOCAL_TEST_DOUBLE` panels remain available in a collapsed, clearly separated section. Their source-backed template behavior and conservative privacy limits are unchanged.

Run its focused server checks with `npm run test:ui`. The page labels simulated references and templates as synthetic `MOCK`, separates gaps and unverified model notes from the host-rendered copyable draft, and does not enable a real local-model runner by default.

## Disabled transport adapter contract

`TransportModelProvider` is a provider-neutral contract for a future transport. It has no built-in `fetch`, endpoint, hostname, SDK, API key, environment-variable lookup, account, or retry behavior. It accepts only an injected transport function and trusted host configuration. Its default configuration is disabled; user text, documents, model output, and role labels cannot enable it.

When explicitly enabled by trusted host code, the adapter receives only the `ProviderInput` produced after the existing policy, source, privacy, final-context, and evidence gates. It makes at most one transport attempt. Defaults are a 1,000 ms timeout, 32 KiB serialized request limit, and 16 KiB serialized response limit; trusted host code may lower these or raise them only within the fixed 30-second and 256-KiB ceilings. `callCount` counts adapter method entries, while `transportCallCount` counts actual injected transport attempts.

Responses are untrusted. The adapter accepts only a small `{ text, citations }` shape within the response-byte limit and rejects duplicate or foreign citation IDs. This validates structure and source selection, not truth, safety, semantic sufficiency, model behavior, billing, or token usage. Timeouts and host cancellation abort the injected signal and clean up timers/listeners. There are no blind retries and no logging of prompts, documents, secrets, response bodies, or raw transport errors.

This is not a complete production provider adapter. Any additional or production live step still requires an explicitly selected provider and account, an approved cost ceiling, reviewed endpoint/authentication design, provider terms and retention review, production-safe observability, and separate authorization for that public transmission.

See [Architecture](docs/ARCHITECTURE.md) and [Contributing](CONTRIBUTING.md).

## Disabled OpenAI live-demo preflight

A small server-side OpenAI Responses transport is prepared behind the existing provider-neutral adapter. It is disabled unless trusted host code explicitly enables both layers. It uses the fixed `gpt-6-luna` model ID, the fixed `https://api.openai.com/v1/responses` route, `store: false`, Standard service tier, no tools, no retries, and a persistent conservative budget ledger. The ordinary `npm run demo` remains fully offline.

The reviewed live path is limited to synthetic scenarios. One separately gated two-call run and one separately gated three-call practical follow-up were each executed once on 2026-10-24. Their ledgers remain immutable and exhausted; neither command may be rerun. See [OpenAI live preflight](docs/OPENAI-LIVE-PREFLIGHT.md), [first live result](docs/OPENAI-LIVE-RESULT.md), [P3 preflight](docs/OPENAI-PRACTICAL-P3-PREFLIGHT.md), and [P3 result](docs/OPENAI-PRACTICAL-P3-RESULT.md).

## Evaluation

`npm run eval` executes a fixed 48-case synthetic matrix: nine task cases, nine policy cases, nine source cases, ten evidence cases, and eleven privacy cases. It reports actual allow/block/provider-call counts by category and task and verifies the expected reason and exact provider-call count for every case. This is a reproducible smoke test, not evidence of broad accuracy.

## Roadmap

1. Replace pattern rules with independently evaluated, multilingual detectors while retaining deterministic fail-closed behavior.
2. Add signed/attested HOSTSERVER policy transport and policy expiry.
3. Add isolated parsers for explicitly supported document types.
4. Complete broader evaluation of any specifically approved provider implementation behind the disabled transport contract and the same single gateway, using no private live data during development.
5. Add human review for uncertain workflows before considering any action capability.

## License

This project is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE). It is not open source under the OSI definition. Noncommercial use is permitted according to the license; commercial use requires separate permission unless the license already covers the specific use.

The public history through commit `71ca143160bb29b870aa2aaa882776a2eb09cd7b` remains available under the MIT terms that applied to those versions. This change does not revoke rights already granted for those historical versions. Rights needed for any future commercial licensing of third-party contributions remain a separate project decision.
