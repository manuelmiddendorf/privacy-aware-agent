# Local validation report

Date: 2026-10-24

This report covers the local v0.1 prototype only. The automated and offline validation used no remote repository, live provider, API key, deployment, external action, or private application data. The later, separately gated synthetic live result is documented in its own section below.

## Commands and results

- `npm run typecheck`: passed with the required local Node.js 20 runtime.
- `npm test`: 34 of 34 tests passed.
- `npm run test:adapter`: 9 of 9 focused adapter tests passed.
- `npm run eval`: 48 of 48 fixed synthetic cases passed. Actual totals: 18 allowed, 30 blocked, 18 provider calls, and 30 blocked cases with zero provider calls.
- Eval distribution: task, policy, and source contain nine cases each; evidence contains ten and privacy eleven. By task there are 19 `ask`, 21 `draft`, and 8 `summarize` cases. The machine-readable console result also reports actual reason-code counts.
- `npm run demo`: all four confirmed offline scenarios behaved as specified. The source-backed board-meeting result reproduced exactly “Collect topics and the meeting goal; Create the agenda; Link the relevant documents; Send the invitation” and cited only `meeting-preparation`; this describes sending but performs no action. The gardening-day case returned a friendly, clearly labelled `MOCK_OFFLINE` example letter containing `[Date]`, `[Time]`, and `[Location]`, rather than echoing the instruction. The child-and-illness request returned the neutral reformulation help text without echoing its input and with zero provider calls. The binding-notice question selected the approved `meeting-preparation` document, was explicitly classified as evidentially insufficient, returned no deadline or citation, and made zero provider calls. Total provider calls: 2.

The test suite covers closed policy and request schemas, explicit source rights, role/capability separation, task-specific evidence, source-free general summaries and drafts, default-denied source-backed evidence, exact synthetic host decisions bound to request and document contents, the assessor's strict synchronous literal-`true` contract, the mock's task contract, conservative name-context/child/health cases, pseudonymization, invalid classifier output, a final-context `safe` requirement, document/metadata scanning, input limits, gate errors with zero provider calls, provider errors, the four CLI scenarios, prompt-free audit events, and the disabled transport boundary.

The nine focused adapter tests cover default-disabled behavior and separate method/transport counters; a gated synthetic success; zero transport calls for policy, source, evidence, and privacy blocks; timeout when the double ignores abort; cancellation before and during a call, including the exact ordering where a directly returned, externally held transport promise resolves before cancellation is queued as a microtask; stable transport/5xx/429/quota/rejection reasons without retries or raw logs; request/response limits; one-time plain response snapshots that reject accessors and ignore non-enumerable `toJSON` hooks for byte accounting; malformed output; duplicate/foreign citations; and rejected untrusted configuration fields. All transports were in-memory test doubles. No socket, HTTP server, DNS lookup, provider SDK, endpoint, account, or credential was used.

## Limits and open decisions

- The pattern-based classifier is intentionally small and cannot establish real-world detection accuracy. Its simple-name detection is deliberately conservative, language-limited, and may both miss names and block harmless title-cased phrases.
- The evaluation is a synthetic smoke set and is not a benchmark or compliance assessment.
- Pseudonymization is not anonymization and supports only a few direct identifier formats.
- The deterministic mock does not prove a real model's resistance to prompt injection.
- The demo's explicit evidence predicate covers only its named synthetic source and question. It does not establish general semantic sufficiency or prevent hallucinations for arbitrary requests.
- `TransportModelProvider` remains a default-disabled, provider-neutral contract. The narrow optional OpenAI mapping documented below adds its own fixed endpoint, authentication, usage accounting, and budget ledger, but it does not add streaming, general semantic validation, safe UI rendering, or production telemetry.
- Before any further or production live transport use, the specific provider and account, cost ceiling, provider terms/retention review, payload scope, and separate authorization for public transmission must be reviewed again.
- Before broader or production live-provider use, the project still needs an approved threat model, multilingual detector evaluation, signed or otherwise attested HOSTSERVER policy transport, retention rules, provider governance, and independent review.
- Actions remain disabled. Enabling any action requires a separate design and authorization decision.

## License note

The current project is source-available under the PolyForm Noncommercial License 1.0.0 and is not OSI open source. Noncommercial use is governed by that unmodified license; commercial use requires separate permission unless the license already covers the specific use. The public history through commit `71ca143160bb29b870aa2aaa882776a2eb09cd7b` remains under the MIT terms that applied to those versions. Neither license is a privacy or compliance assurance.

## OpenAI transport preflight

The OpenAI-specific path is locally testable with injected fetch doubles and remains disabled by default. Its focused suite checks the fixed Responses URL and model, stateless/tool-free request, Standard tier, exact two-call demo contract, zero network calls for blocked C/D scenarios, one-at-a-time execution, persistent budget locking, duplicate/restart blocking, authentication rejection redaction, abort after reservation, rejected ledger persistence without an unhandled promise, abort during a held confirmation with a persistently blocked restart, streaming response caps without trusting `Content-Length`, timeouts, unknown usage, and conservative full-context worst-case cost.

Executed locally with Node.js 20.20.1:

- `npm run typecheck`: passed.
- `npm run test:openai`: 11/11 passed.
- `npm test`: 53/53 passed, including the OpenAI, practical-baseline, targeted privacy, and exact-evidence cases.
- `npm run test:adapter`: 9/9 passed.
- `npm run eval`: unchanged 48/48; 18 allowed and 30 blocked, with zero provider calls for every expected block.
- `npm run demo`: unchanged offline A–D behavior; A/B one `MOCK_OFFLINE` call each and C/D zero.
- `git diff --check`: passed.

The automated validation did not use an API key or network request. After that validation passed and an independent review plus separate human authorization were recorded, the fixed runner was executed once on 2026-10-24. Its two synthetic requests and measured usage are documented in [OPENAI-LIVE-RESULT.md](OPENAI-LIVE-RESULT.md). No account probe, model-list request, retry, or fallback was made.

The local `.env.openai.local` path and budget ledger remain Git-ignored. The runner read the key into memory without printing it; the key was not manually inspected or copied into logs or documentation. The official documentation reviewed for the contract is linked in [OPENAI-LIVE-PREFLIGHT.md](OPENAI-LIVE-PREFLIGHT.md).


## P1/P2 practical follow-up

The frozen sixteen-case catalog, unchanged original result, targeted P2 result, provider-call evidence, quality observations, and loader limits are recorded in [PRACTICAL-BASELINE-RESULT-P1.md](PRACTICAL-BASELINE-RESULT-P1.md) and [PRACTICAL-P2-RESULT.md](PRACTICAL-P2-RESULT.md). P2 closes the reproduced P09–P11 phrase gaps and makes all unassessed source-backed requests fail closed. P08/P14 remain loader-boundary cases and provide no semantic conflict or prompt-injection evidence.


## P3 practical live contract preflight

The still-disabled P3 runner contains only the exact P01–P03 synthetic scenarios and reuses the existing agent and OpenAI transport. Its separate three-entry ledger validates the immutable completed two-entry ledger before every operation and includes its full reservation in the cumulative USD 5 boundary. Focused tests cover the three-request limit, restart, parallel access, missing/unfinished/uncertain/changed/locked prior state, cumulative exposure, sequential scenario execution, quality-check instrumentation, the existing O1–O4 transport cases, and the shared protected-key loader using only synthetic temporary files. See [OPENAI-PRACTICAL-P3-PREFLIGHT.md](OPENAI-PRACTICAL-P3-PREFLIGHT.md).

After the P3 changes, the complete local suite passed 59/59 with Node.js 20.20.1. The fixed offline evaluation remained 48/48, including zero provider calls for all 30 expected blocks, and `git diff --check` passed. The first attempted suite invocation used the host's obsolete Node.js 12.14.0 and stopped while parsing the TypeScript compiler before any test or application code ran; it was repeated successfully with the project-required Node.js 20 runtime. No API, key, or real ledger access occurred.

After independent review and a separate technical live gate, the fixed P3 runner was executed exactly once. Its three allowed synthetic outputs, manual P1-criteria assessment, per-case latency and usage, cost, and the literal-regex indicator limit are recorded in [OPENAI-PRACTICAL-P3-RESULT.md](OPENAI-PRACTICAL-P3-RESULT.md). No retry, fallback, probe, or prompt adjustment was made.
