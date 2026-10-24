# OpenAI practical P3 preflight

Date: 2026-10-24

## Status

This document records the preflight contract that preceded the separately reviewed one-time run. That run is now complete; see [OpenAI practical P3 live result](OPENAI-PRACTICAL-P3-RESULT.md). The completed ledger must not be reset or rerun.

## Compiled run contract

- Run ID: `paa-practical-p3-2026-10-24-v1`
- Endpoint/model contract: the existing fixed OpenAI Responses transport with `gpt-6-luna`, `service_tier: default`, `store: false`, `reasoning.effort: none`, no tools, and 256 maximum output tokens.
- Exactly three compiled synthetic scenarios, sequentially and without retries:
  - L1/P01: the frozen meeting-preparation question with its exact manually confirmed request and complete `meeting-preparation` fixture contents;
  - L2/P02: the frozen source-free two-sentence reusable-cups reminder;
  - L3/P03: the frozen source-free two-bullet workshop checklist summary.
- No privacy-blocked, evidence-blocked, loader-boundary, private, or production payload is part of the runner.
- P06 and P09–P11 remain verified only through their offline zero-call regression tests. P08/P14 remain semantically unexecuted loader-boundary cases.

The runner reports per-scenario end-to-end latency around the complete agent call, provider-call count, structured output, citations, P1 quality checks, usage, reasoning tokens, and calculated token cost. It does not print prompts, the key, raw provider errors, or arbitrary response metadata.

## Cumulative budget and ledgers

The completed first run remains immutable at `.local/openai-live-demo-budget.json`. Its two exact confirmed entries must continue to match their request digests, usage, actual calculated costs, pricing contract, USD 0.4202816 reservation, and USD 0.0001069 calculated actual cost.

The P3 runner uses the separate stable path `.local/openai-practical-p3-budget.json`. Before every access, it validates the first ledger read-only. Missing, unfinished, uncertain, changed, locked, or otherwise unaccounted prior state blocks P3. The old ledger is never reset, migrated, or reused.

Each of the three possible P3 requests conservatively reserves USD 0.2101408. The cumulative maximum exposure is:

`USD 0.4202816 + 3 × USD 0.2101408 = USD 1.050704`

This remains within the already authorized cumulative USD 5 ceiling; it is not a new budget. Reservations are never refunded. Duplicate requests, a fourth request, parallel starts, restart after any P3 entry, timeout, unknown usage, or uncertain state stop further execution. A process restart does not continue a partial P3 run.

## Local key boundary

Both runners share only `.env.openai.local`. The server-side loader accepts one regular non-symlink file with mode 0600 and exactly one `OPENAI_API_KEY=...` line. The key is loaded only after both ledgers pass preflight validation and is never sent to browser code. Tests use synthetic temporary key files only.

## Disabled command

The separately gated one-time command was:

```sh
PAA_OPENAI_PRACTICAL_P3_ENABLED=1 npm run demo:openai:practical
```

The independent review and explicit technical live gate were recorded before the single execution. Do not run it again and do not delete, edit, or reset either ledger.

## Local verification

- `npm run typecheck`: passed after the P3 changes.
- P3 contract and ledger tests: 5/5 passed.
- Existing OpenAI transport/O1–O4 regression tests: 11/11 passed alongside P3, 16/16 combined.
- Shared protected-key loader with synthetic temporary files: 1/1 passed.
- Complete local suite with Node.js 20.20.1: 59/59 passed.
- Fixed offline evaluation: 48/48 passed; all 30 expected blocks made zero provider calls.
- `git diff --check`: passed.
- These local preflight checks made no API call, model probe, key read, real ledger read, or cost. The later one-time execution is documented separately in the result report.

This contract does not authorize UI, public deployment, Amsel integration, npm publication, hosting, tags, releases, or production use.
