# privacy-aware-agent

A small TypeScript/Node reference implementation of a policy-bound assistant. Its defining rule is **privacy gate before model access**: missing or explicitly insufficient evidence, sensitive content, uncertain content, denied sources, and technical gate failures stop before a provider call.

The ordinary version 0.1 workflow is offline and intentionally limited. It uses a deterministic provider named `MOCK_OFFLINE`, synthetic help documents, and no API keys, live model, external actions, arbitrary URLs, or file access. A separate, default-disabled synthetic OpenAI preflight is documented below.

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

The small browser demo uses the same `PrivacyAwareAgent`, `DEMO_POLICY`, `MockProvider`, privacy gate, source checks, and evidence contract as the command-line examples. It binds only to `http://127.0.0.1:4317`, stores no submitted text, serves no arbitrary files, and has no live-provider or key path.

Start it with Node.js 20 or newer:

```sh
npm run ui:local
```

Open `http://127.0.0.1:4317`. No account is required. Press `Ctrl+C` in the starting terminal to stop it. The two source-backed template buttons are fixed, previously reviewed synthetic request/document pairs. Other source-backed questions fail closed; source-free drafts and summaries remain available. Use synthetic examples only: the rule-based privacy detection is conservative and incomplete.

Run its focused server checks with `npm run test:ui`. The page displays `MOCK_OFFLINE` and does not enable either completed live runner.

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
