# Local validation report

Date: 2026-10-24

This report covers the local v0.1 prototype only. No remote repository, live provider, API key, deployment, external action, or private application data was used.

## Commands and results

- `npm run typecheck`: passed with the required local Node.js 20 runtime.
- `npm test`: 34 of 34 tests passed.
- `npm run test:adapter`: 9 of 9 focused adapter tests passed.
- `npm run eval`: 48 of 48 fixed synthetic cases passed. Actual totals: 18 allowed, 30 blocked, 18 provider calls, and 30 blocked cases with zero provider calls.
- Eval distribution: task, policy, and source contain nine cases each; evidence contains ten and privacy eleven. By task there are 19 `ask`, 21 `draft`, and 8 `summarize` cases. The machine-readable console result also reports actual reason-code counts.
- `npm run demo`: all four confirmed offline scenarios behaved as specified. The source-backed board-meeting result reproduced exactly “Collect topics and the meeting goal; Create the agenda; Link the relevant documents; Send the invitation” and cited only `meeting-preparation`; this describes sending but performs no action. The gardening-day case returned a friendly, clearly labelled `MOCK_OFFLINE` example letter containing `[Date]`, `[Time]`, and `[Location]`, rather than echoing the instruction. The child-and-illness request returned the neutral reformulation help text without echoing its input and with zero provider calls. The binding-notice question selected the approved `meeting-preparation` document, was explicitly classified as evidentially insufficient, returned no deadline or citation, and made zero provider calls. Total provider calls: 2.

The test suite covers closed policy and request schemas, explicit source rights, role/capability separation, task-specific evidence, general-text summaries without external documents, a narrow trusted evidence-insufficiency decision after privacy scanning, the assessor's strict synchronous literal-`true` contract, the mock's task contract, conservative name-context/child/health cases, pseudonymization, invalid classifier output, a final-context `safe` requirement, document/metadata scanning, input limits, gate errors with zero provider calls, provider errors, the four CLI scenarios, prompt-free audit events, and the disabled transport boundary.

The nine focused adapter tests cover default-disabled behavior and separate method/transport counters; a gated synthetic success; zero transport calls for policy, source, evidence, and privacy blocks; timeout when the double ignores abort; cancellation before and during a call, including the exact ordering where a directly returned, externally held transport promise resolves before cancellation is queued as a microtask; stable transport/5xx/429/quota/rejection reasons without retries or raw logs; request/response limits; one-time plain response snapshots that reject accessors and ignore non-enumerable `toJSON` hooks for byte accounting; malformed output; duplicate/foreign citations; and rejected untrusted configuration fields. All transports were in-memory test doubles. No socket, HTTP server, DNS lookup, provider SDK, endpoint, account, or credential was used.

## Limits and open decisions

- The pattern-based classifier is intentionally small and cannot establish real-world detection accuracy. Its simple-name detection is deliberately conservative, language-limited, and may both miss names and block harmless title-cased phrases.
- The evaluation is a synthetic smoke set and is not a benchmark or compliance assessment.
- Pseudonymization is not anonymization and supports only a few direct identifier formats.
- The deterministic mock does not prove a real model's resistance to prompt injection.
- The demo's explicit evidence predicate covers only its named synthetic source and question. It does not establish general semantic sufficiency or prevent hallucinations for arbitrary requests.
- `TransportModelProvider` is only a disabled, provider-neutral contract. It does not include a real provider mapping, endpoint, authentication, streaming, semantic output validation, safe UI rendering, production telemetry, billing, or token accounting.
- Before any live transport test, an explicit provider and account, a cost ceiling, provider terms/retention review, and separate authorization for public transmission are still required.
- Before a live provider is considered, the project needs an approved threat model, multilingual detector evaluation, signed or otherwise attested HOSTSERVER policy transport, retention rules, provider governance, and independent review.
- Actions remain disabled. Enabling any action requires a separate design and authorization decision.

## License note

The project uses the MIT License. Reuse, modification, and distribution are permitted when the copyright and permission notice are retained. The license includes its standard warranty and liability disclaimer; it does not provide a privacy or compliance assurance.
