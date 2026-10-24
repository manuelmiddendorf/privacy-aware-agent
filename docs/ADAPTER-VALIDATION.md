# Local validation: disabled provider-neutral transport contract

Date: 2026-10-24

## Scope

This result covers only the local TypeScript transport boundary in `TransportModelProvider`. It remains disabled by default and contains no real network client, provider SDK, endpoint, hostname, account, API key, environment lookup, or retry loop. `MOCK_OFFLINE` remains the runnable demonstration provider.

The trusted host is the only party that can construct the adapter with `enabled: true` and inject a transport function. Untrusted requests, source documents, model output, and role labels cannot enable it or choose a destination.

## Enforced contract

- The adapter is reached only through the central `ModelProvider` call after policy, capability, source, privacy, final-context, and evidence checks.
- Cancellation is a trusted host option outside the untrusted request schema.
- At most one injected transport attempt occurs per provider call; there are no automatic retries.
- Defaults: 1,000 ms timeout, 32 KiB serialized request, and 16 KiB serialized response. Hard configuration ceilings are 30 seconds and 256 KiB.
- Timers and external abort listeners are cleaned up even when the injected double ignores abort.
- A cancellation or timeout observed immediately after the transport race, or before the final return, wins over an already resolved transport response.
- Successful output must be exactly shaped as text plus unique citations drawn only from the selected source IDs.
- The successful response is copied once from enumerable own data descriptors into a plain snapshot. Accessors are rejected without evaluation; non-enumerable `toJSON` hooks cannot change byte accounting. The size limit and returned value use that same snapshot.
- Raw transport errors, bodies, prompts, documents, and secrets are not logged or returned.

## Local evidence

- `npm run typecheck`: passed.
- `npm test`: 34/34 passed.
- `npm run test:adapter`: 9/9 passed using only in-memory injected doubles and short timers.
- `npm run eval`: 48/48 passed; 18 allowed and 30 blocked, with zero provider calls for all 30 expected blocks.
- `npm run demo`: unchanged offline A–D behavior; A/B each call `MOCK_OFFLINE` once, C/D make zero provider calls.

The focused tests prove default-disabled behavior; one safe synthetic success; zero transport calls for earlier policy/privacy/source/evidence blocks; pre-start and in-flight cancellation; the microtask race in which a directly returned, externally held transport promise resolves before external cancellation is queued; timeout despite an abort-ignoring double; stable transport, 5xx, rate, quota, and rejection codes; no blind retry; request/response size limits; rejection of response-envelope and body accessors without evaluating them; resistance to a non-enumerable `toJSON` size bypass; malformed output rejection; citation scope; generic error exposure; and trusted-config validation.

## Remaining decisions

This is not a complete provider adapter and is not approved for live or public transmission. A later step must select the provider and account, define an explicit cost ceiling, design endpoint authentication and secret handling, review provider terms and retention, define production observability without raw content, and separately authorize a controlled live test. No claims are made about universal privacy detection, semantic correctness, hallucination prevention, token usage, billing accuracy, or production readiness.

No live API, API key, network request, cost, remote repository change, commit, push, pull request, merge, or deployment occurred.
