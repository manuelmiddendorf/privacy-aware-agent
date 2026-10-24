# Architecture

The HOSTSERVER constructs a trusted, versioned policy context. `policy.ts` validates it with a closed schema. A role is descriptive input only; effective capabilities and readable source IDs must be present explicitly in that trusted context.

`PrivacyAwareAgent.run` is the only orchestration path:

1. Validate trusted policy and authorize the task and every requested source.
2. Require approved evidence for `ask`. Permit `summarize` without a source only for the general text carried in the request; every requested external source still needs explicit task authorization. Permit an evidence-free `draft` only when the policy allows drafting.
3. Classify the user text before loading documents.
4. Block sensitive or uncertain input, and fail closed if the classifier returns any state outside its four-state contract.
5. Pseudonymize narrowly supported direct identifiers.
6. Load only allowlisted, tenant-matching synthetic sources.
7. Scan document content and metadata, then scan the complete resulting provider context again.
8. Continue only when that final scan is exactly `safe`.
9. For every request with loaded documents, require an affirmative trusted, synchronous, task-specific evidence-sufficiency decision. The default confirms only source-free drafts and summaries. Only a literal `true` continues; every other runtime value blocks as insufficient, while a thrown error follows the technical fail-closed path. Neither case calls the provider.
10. Make exactly one call through the central `ModelProvider` interface.

Actions are unavailable in v0.1. Documents are data, never policy, and cannot add permissions. Arbitrary paths and URLs have no loader. Audit events contain stable reason codes and counts, but no prompt or document content.

The included provider is deliberately labelled `MOCK_OFFLINE`. It is deterministic and performs no network access. Its task contract requires documents for questions, permits summaries of general request text and source-free drafts, and returns citations only for supplied documents. This is defense in depth; the orchestrator must reject invalid evidence before calling it. The mock does not prove prompt-injection resistance for a real language model.

Evidence sufficiency is separate from privacy classification and source authorization. The fixed demo/eval successes use explicit synthetic host decisions bound to the exact request and complete loaded fixture documents. The binding-notice example has no positive decision and therefore blocks. These narrow fixture decisions do not infer meaning generally and are not presented as a hallucination-prevention engine.

## Provider-neutral transport boundary

`TransportModelProvider` implements the same single `ModelProvider` interface as `MOCK_OFFLINE`. The orchestrator passes it data only after every existing input and document gate. Cancellation is supplied separately by trusted host code through `AgentRunOptions`; it is not part of the untrusted request schema.

The adapter is disabled by default and has no native network implementation. Trusted host code must inject both the transport function and `enabled: true`; no request, document, provider response, role, environment variable, or model instruction can change that configuration. One provider method call can produce zero or one transport attempt and never an automatic retry.

The transport request contains the already-gated task, user text, and selected documents with their IDs, tenant IDs, titles, and bodies. The serialized request is checked against a small host-bounded byte limit before the transport is called. The response is treated as untrusted: status, byte size, exact object shape, text type, unique citations, and citation membership in the selected source IDs are validated before returning it. These checks do not establish factual correctness or safe rendering.

Timeout and external cancellation share an internal abort signal. The adapter races that signal against the injected transport, so it returns even if a test double ignores abort; the timeout and external listener are removed in `finally`. Stable adapter reason codes distinguish disabled, cancelled, timeout, transport/5xx, rate limit, quota, rejection, request size, malformed response, response size, and invalid citation failures. The orchestrator records only those codes and counts, not raw errors or content.

The provider-neutral adapter itself deliberately contains no endpoint selection, authentication, secret lookup, provider SDK, built-in `fetch`, billing integration, token accounting, streaming, tool invocation, or live telemetry. The optional provider-specific preflight below supplies only the reviewed fixed OpenAI transport behind that unchanged boundary.

## Fixed OpenAI Responses transport preflight

The optional OpenAI transport is a narrow implementation of the existing injected transport boundary, not a second orchestration engine. The central agent still performs policy, source, privacy, final-context, and evidence checks before the transport sees a request. The OpenAI transport cannot select another endpoint, model, processing tier, tool, file, or action. It is disabled by default and requires trusted server-side enablement plus an injected key.

Each permitted request is reserved in a persistent budget ledger before network access. The ledger uses a request digest, a fixed run contract, exclusive file locking, and a conservative worst-case token reservation. The completed first run retains its two-request legacy contract. A separately reviewed follow-up may use its own fixed run ID and cap while validating and counting the immutable prior ledger before every access. A duplicate, concurrent start, unresolved previous attempt, timeout, unknown usage record, changed pricing contract, prior-ledger mismatch, or exhausted allowance stops further requests. Confirmed usage is parsed from the response, but reservations are never refunded.

The transport sends `store: false`, Standard service tier, `reasoning.effort: none`, no tools, disabled truncation, and a strict structured-output schema to the fixed Responses route. It rejects redirects, oversized bodies, an unexpected model or service tier, refusals/tool output, malformed structured output, foreign citations, and missing or contradictory usage. These checks do not establish account availability, data residency, Zero Data Retention, semantic accuracy, universal privacy detection, or regulatory compliance.
