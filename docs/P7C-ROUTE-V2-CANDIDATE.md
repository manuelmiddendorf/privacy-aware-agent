# P7 route-v2 correction candidate

Date: 2026-10-25
Status: ready for independent source review; no route-v2 model inference, holdout access, real-model UI wiring, push, or publication.

## Preserved history

The exact pre-correction state is recoverable from local commit `d2d7a18` (`checkpoint: preserve P6 and initial P7 evidence`). That checkpoint contains the P6 work, the P7 mechanical candidate, runner/guard, and failed A/B development report. Ignored `.local` runtime files, identity files, call ledger, environment files, and secrets are not in the commit.

The original A/B comparison remains ten persisted POSTs under its original durable development claim. Its report and hashes are not rewritten. The independent route-v2 protocol amendment was recorded after that failure and before this implementation, SHA-256 `48a0f4cbece22c424057d9613ea4b6ce90a13e0c57e928d2d51d43eed4c9c689`.

## Route-v2 core hash

`a356c8a2cdbe52b2ac69645370030cd025c27b680e5aee948560e4d69f1bb9fd`

This is SHA-256 over UTF-8 path, NUL, and exact file bytes in order:

1. `config/p7-prompt-configs.json`
2. `docs/P7-LOCAL-SKILLS-CONTRACT.md`
3. `docs/P7-ROUTE-V2-AMENDMENT.md`
4. `src/localSkillLane.ts`
5. `src/localSkillModel.ts`
6. `src/ollamaLocalSkillAdapter.ts`
7. `tests/localSkillLane.test.ts`
8. `tests/ollamaLocalSkillAdapter.test.ts`

The single correction prompt ID is `P7_ROUTE_V2`, canonical prompt SHA-256 `078c9691deaf0662b3df39187647a473d48a0c451a8f68f9df3ce4944d727474`. Historical A/B text and hashes remain recorded but are rejected by current adapter configuration validation.

## Runner and budget hash

`1f45b0373de93458592543650be85eeaf862efc98570db27c4010ee52bcacc11`

Calculated with the same path/NUL/bytes method:

1. `src/p7LocalCallBudget.ts`
2. `src/p7DevelopmentRunner.ts`
3. `src/p7CorrectionRunner.ts`
4. `tests/p7LocalCallBudget.test.ts`
5. `tests/p7DevelopmentRunner.test.ts`
6. `tests/p7CorrectionRunner.test.ts`
7. `scripts/p7-ollama-existing-identity.sb`
8. `scripts/p7-verify-ollama-sandbox.sh`
9. `scripts/p7-ollama-serve.sh`

The original runner now refuses the corrected working tree before transport. The correction runner binds the route-v2 core, prompt, P6 core, and P6 adapter hashes. Before any claim or inference it also verifies the exact disclosed development-case file SHA-256 `584d63ad25658334c0fa3035b7e5ea4d810db0e33659ad86a266d471d6ba3a14`. It accepts only the original six disclosed development cases and one `P7_ROUTE_V2` configuration. It atomically claims the correction phase against the same legacy ledger, requires the preserved ten-call history, allows at most nine correction-development POSTs, reserves before transport, and never resets or retries.

The ledger keeps the hard 40 ceiling and adds the amendment's narrower cumulative authorization limit of 32. The final eight calls below 40 cannot be used by these runners. Existing ten-call ledgers are upgraded in place only when the correction claim is written; their reservations and original claim remain unchanged.

## Proposal and evidence contract

The model can return only `{schemaVersion: 1, route}` with one of five literal routes. Host code maps those routes to understanding, composition, their exact order, fixed clarification, or fixed unsupported handling. Extra keys and unknown routes fail closed. Every existing source, organization, session, revocation, context, generation, citation, no-action, and persistence boundary remains in force before generation.

Only the synthetic benchmark runner captures proposal evidence. It stores the exact two-field proposal only when the route is one of the five allowed literals. Unknown routes are not stored. Invalid output stores only a bounded structural reason and the fixed key markers `schemaVersion`, `route`, or `unknown`, never arbitrary model-provided keys or values. It does not log request text, attachment text, real application traffic, or user data. Application UI traffic remains in memory only.

## Verification

- Fresh Node.js 20.20.1 TypeScript build: passed.
- Focused catalog, source, lane, adapter, historical-runner lock, correction-runner, proposal-capture, call-budget, restart, concurrency, and legacy-ledger tests: 37 passed, 0 failed.
- Local UI/server boundary tests after standard build: 6 passed, 0 failed; UI remains `LOCAL_TEST_DOUBLE`.
- Correction runner preflight: passed with six known cases and zero POSTs.
- `git diff --check`: passed.
- No listener exists on the model port and no route-v2 claim or reservation has been made.

Independent source review and a separate start gate are required before the single correction-development run. Holdout cases remain unread and unavailable. The two known UI presentation fixes remain a later, separately hashed change after model evaluation.
