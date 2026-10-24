# privacy-aware-agent

A small TypeScript/Node reference implementation of a policy-bound assistant. Its defining rule is **privacy gate before model access**: missing or explicitly insufficient evidence, sensitive content, uncertain content, denied sources, and technical gate failures stop before a provider call.

Version 0.1 is local and intentionally limited. It uses a deterministic provider named `MOCK_OFFLINE`, synthetic help documents, and no API keys, live model, external actions, arbitrary URLs, or file access.

## Quick start

Requires Node.js 20 or newer.

```sh
npm install
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

The orchestrator also accepts an optional trusted, synchronous evidence assessor after all privacy scans and before provider access. Only the literal boolean `true` permits provider access; `false`, unknown runtime values, objects, promises, and technical failures all fail closed with zero provider calls. The included demo uses the assessor only for one explicit synthetic decision: `meeting-preparation` does not contain binding-notice-period evidence. This is a narrow test fixture, not a general semantic sufficiency or hallucination detector.

The mock provider cannot establish that a real LLM resists prompt injection. Before a live model is introduced, treat all retrieved content as hostile and add model-specific isolation, output controls, red-team tests, and provider governance.

## Disabled transport adapter contract

`TransportModelProvider` is a provider-neutral contract for a future transport. It has no built-in `fetch`, endpoint, hostname, SDK, API key, environment-variable lookup, account, or retry behavior. It accepts only an injected transport function and trusted host configuration. Its default configuration is disabled; user text, documents, model output, and role labels cannot enable it.

When explicitly enabled by trusted host code, the adapter receives only the `ProviderInput` produced after the existing policy, source, privacy, final-context, and evidence gates. It makes at most one transport attempt. Defaults are a 1,000 ms timeout, 32 KiB serialized request limit, and 16 KiB serialized response limit; trusted host code may lower these or raise them only within the fixed 30-second and 256-KiB ceilings. `callCount` counts adapter method entries, while `transportCallCount` counts actual injected transport attempts.

Responses are untrusted. The adapter accepts only a small `{ text, citations }` shape within the response-byte limit and rejects duplicate or foreign citation IDs. This validates structure and source selection, not truth, safety, semantic sufficiency, model behavior, billing, or token usage. Timeouts and host cancellation abort the injected signal and clean up timers/listeners. There are no blind retries and no logging of prompts, documents, secrets, response bodies, or raw transport errors.

This is not a complete provider adapter. A later live step still requires an explicitly selected provider and account, an approved cost ceiling, endpoint/authentication design, provider terms and retention review, production-safe observability, and separate authorization for any public transmission.

See [Architecture](docs/ARCHITECTURE.md) and [Contributing](CONTRIBUTING.md).

## Evaluation

`npm run eval` executes a fixed 48-case synthetic matrix: nine task cases, nine policy cases, nine source cases, ten evidence cases, and eleven privacy cases. It reports actual allow/block/provider-call counts by category and task and verifies the expected reason and exact provider-call count for every case. This is a reproducible smoke test, not evidence of broad accuracy.

## Roadmap

1. Replace pattern rules with independently evaluated, multilingual detectors while retaining deterministic fail-closed behavior.
2. Add signed/attested HOSTSERVER policy transport and policy expiry.
3. Add isolated parsers for explicitly supported document types.
4. Complete and evaluate a specifically approved provider implementation behind the disabled transport contract and the same single gateway, with no live data during development.
5. Add human review for uncertain workflows before considering any action capability.

## License

MIT. See [LICENSE](LICENSE).
