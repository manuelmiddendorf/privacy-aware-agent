# Practical follow-up plan

Date: 2026-10-24

## Baseline

This follow-up starts from branch `codex/openai-live-demo-preflight` at base commit `727c2497b6cf58faa622e699ccf02da623f25ee1`, plus the reviewed local worktree recorded in [PRACTICAL-BASELINE-SHA256.txt](PRACTICAL-BASELINE-SHA256.txt). The completed synthetic OpenAI run and its limits remain recorded in [OPENAI-LIVE-RESULT.md](OPENAI-LIVE-RESULT.md).

The baseline must remain recoverable until the practical cases have been recorded and evaluated. The protected `.env.openai.local` file and `.local/openai-live-demo-budget.json` ledger are ignored local state and are deliberately excluded from the manifest. They must not be read, reset, copied, committed, or sent to a browser during the offline practical test.

## P1 — New offline practical cases

The technical coordinator defines 12–16 new synthetic cases and their expected outcomes before any fix is made. The catalog must cover useful allowed behavior as well as privacy, evidence, source, and capability blocks without reusing the four demonstration prompts as the principal evidence.

The implementation chat then runs the frozen cases once against this baseline using only the offline provider and records actual reason codes, provider-call counts, citations, and concise quality observations. Findings are classified as reproduced defects, expected limitations, test defects, or open product decisions. No core, privacy, or evidence logic changes are permitted during this phase.

Completion criterion: the full catalog, expectations, baseline hashes, raw machine-readable results, and a short discrepancy table exist before any corrective diff.

## P2 — Targeted fixes and independent review

Only defects reproduced by P1 may be corrected. Each correction receives a focused regression test while preserving fail-closed behavior, the single provider gateway, source authorization, zero-call blocks, and the existing OpenAI transport boundaries. Broad architecture changes and parallel implementations are out of scope.

After focused tests, the complete local suite and evaluation run once. An independent review compares the corrective diff with the frozen P1 results and baseline manifest.

Completion criterion: every code change maps to a reproduced P1 finding, every accepted safety target and regression check passes, unrelated behavior remains unchanged, and the independent reviewer records no unresolved high-severity finding. P08/P14 loader limits, deliberately deferred output-quality limits, and any rejected product assumption remain explicit rather than being counted as passing semantics.

## P3 — Narrow follow-up live contract

A further live check is optional and requires a new explicit technical gate after P2 review. It may use only selected synthetic cases needed to verify changed transport-visible behavior. The request count, exact prompts, model, endpoint, output limit, price basis, worst-case reservation, and stop conditions must be frozen before execution.

The existing ledger and its two confirmed entries remain immutable and are never reset or reused. Any separately reviewed follow-up ledger must account for the prior calculated cost of USD 0.0001069 and keep total authorized exposure within the existing cumulative USD 5 ceiling. There are no retries, probes, model fallbacks, private payloads, browser keys, or inference that a live UI is authorized.

Completion criterion: either no follow-up call is needed, or one separately gated run produces a sanitized usage/cost report and stops within its frozen request and cumulative budget limits.

## P4 — Public GitHub review and merge

After P1–P3 are complete, create a reviewable commit from the approved files, push the designated branch, open a public pull request, and complete independent review before merge. Preserve the unmodified PolyForm Noncommercial License 1.0.0 for the current version and the historical MIT grant for earlier public commits. Exclude local keys, ledgers, generated output, and test artifacts.

Completion criterion: the public pull request identifies the exact baseline, tests, practical findings, live status, licensing boundary, and remaining limits; required review is complete and the merged commit is identified. No npm publication, hosting, Amsel integration, Netlify change, tag, or release is part of this phase.

## P5 — Small offline local UI

Only after the reviewed GitHub state is established, prepare a small local-only interface over the existing offline orchestration path. It must default to `MOCK_OFFLINE`, expose no API key or live switch to browser code, perform no action, and make privacy/evidence blocks and citations understandable. Reuse the existing engine rather than duplicating policy logic.

Review it in a local browser at desktop and narrow mobile widths. Browser checks cover the allowed offline task, privacy block, insufficient-evidence block, loading/error states, keyboard access, and absence of secret or live-network traffic.

Completion criterion: browser review confirms the offline scenarios and security boundary, focused UI tests pass, and the result remains local until a separate publication decision.

## Standing boundaries

- Wait for the coordinator's frozen P1 catalog before changing application code.
- Do not run another API call, inspect the key, or modify/reset the completed live ledger without a later explicit gate.
- Do not begin Amsel integration, deployment, hosting, npm publication, Netlify work, or production use.
- A `v0.1` tag or release may be considered only when it accurately describes the merged public state and receives a separate decision.
