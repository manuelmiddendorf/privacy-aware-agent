# P8 local UI candidate

Date: 2026-10-25
Status: historical reviewed candidate used for one bounded real UI smoke. The default server remains disabled; the post-smoke source and result are recorded in `P8-UI-SMOKE-RESULT.md`.

## Scope and evidence boundary

This candidate exposes only the synthetic working-time-contract draft workflow in the existing loopback Node UI. It does not add a general skill router, personnel search, real personnel data, persistence, contract mutation, send action, provider tool, or current legal research. The older P5/P7 `MOCK_OFFLINE` and `LOCAL_TEST_DOUBLE` panels remain technically separate and are collapsed by default.

The completed P8 workflow evidence remains historical and bounded. The original three-case run did not pass as a whole. Separately gated follow-up evidence covered the corrected complete path, the deliberately new confirmed follow-up, and the fixed offline-mock research path. The P8 workflow allowance is exhausted at eight model POSTs. The protected ledger contains 19 campaign reservations and has SHA-256 `16ff119ec7305cb9bb98f5367f6a6298ea1b5c1c6fc5865272edb452913d4f6e`. The final fixed-mock result is stored outside Git with mode `0600` at `.local/p8/final-mock-result-2026-10-25.json`, SHA-256 `8f15a4a53adda64e7cac5b0ea16322ed2833a4df83ad58cd4c6dfa7f972b4f6f`.

## Browser and server contract

- The task starts from free text. The browser chooses no skill.
- An unconfirmed request carries four literal `null` intent fields. Missing person, hours, date, or reference choice produces neutral questions and no source read or draft.
- A draft requires a separate confirmation containing the exact current text, field values, and UI revision. Any task or field edit invalidates it.
- Browser input cannot set actor, organization, session, task, source, readable fields, or authorized people. Those values are fixed in the host runner.
- The UI shows `Lina Mustervertrag`; the internal `person-lina` identifier is not presented as the person name.
- A confirmed follow-up is a new public workflow action. It is neither a replay nor authority derived from a previous model response.
- The draft is an editable in-memory textarea. Gaps, unverified model notes, citations, and the synthetic mock-reference label are shown separately.
- Input edits abort an in-flight request and suppress stale responses. Editing an existing draft during a request prevents the late response from replacing that text.
- The server aborts workflow work if the browser disconnects after sending the body. Timeout, same-origin, loopback, strict-schema, body-size, nonce, global-busy, and neutral-error controls remain active.
- The default UI server injects no real working-time model and returns a neutral unavailable response. There is no autosave or browser persistence.

## Reviewed source set

The ordered path-plus-NUL-plus-exact-bytes SHA-256 for the following files is `8291c449c12eea88197f4ee2186243cc1850ebe92d12e835d6999b8e68cc7b7c`:

1. `src/localUiServer.ts`
2. `ui/index.html`
3. `ui/app.js`
4. `ui/styles.css`
5. `src/workingTimeContractWorkflow.ts`
6. `src/workingTimeResearchCatalog.ts`
7. `src/ollamaWorkingTimeWorkflowAdapter.ts`
8. `src/p7LocalCallBudget.ts`
9. `tests/localUiServer.test.ts`
10. `tests/workingTimeContractWorkflow.test.ts`
11. `tests/workingTimeResearchCatalog.test.ts`
12. `tests/ollamaWorkingTimeWorkflowAdapter.test.ts`

Any change to one of these files invalidates the hash and requires a new source review before a real UI run.

The private smoke bootstrap separately binds the runtime and readiness support files with ordered SHA-256 `a126328f2010c84614435acd3106a60ec927b2ead3716802f8f7fa1399018432`:

1. `src/ollamaResearchAdapter.ts`
2. `src/p8WorkflowReadiness.ts`
3. `scripts/p7-ollama-existing-identity.sb`
4. `scripts/p7-verify-ollama-sandbox.sh`
5. `scripts/p7-ollama-serve.sh`
6. `scripts/p8-ollama-serve.sh`
7. `scripts/p8-observe-runtime.sh`

The full sandbox, executable, manifest, model, PID, and loopback-listener readiness check runs once before the UI server starts. Each later POST cheaply verifies that the same PID still has the exact expected executable command and owns the loopback listener; it does not rerun the multi-gigabyte model hash inside the model-call timeout.

The private runner accepts only the expected neutral initial clarification with the still-missing person, hours, and date, followed by the exact confirmed no-research action and a cited draft. Any transport, workflow, cancellation, or outcome mismatch latches the run closed for all later model transports. Signal handlers are installed before build and runtime observation; a setup stop prevents listening and model access, while cleanup terminates only the runtime PID that completed the exact readiness check.

## Model-free verification

Using a fresh Node.js 20+ TypeScript build in a temporary output directory:

- TypeScript typecheck: passed.
- UI HTTP, working-time workflow, fixed research catalog, and working-time adapter tests: 31 passed, 0 failed.
- The UI HTTP suite includes strict browser schema checks, separate confirmation, neutral missing-person handling, source citations, same-origin/loopback protections, global busy behavior, and browser-disconnect cancellation before follow-up work.
- Static UI checks confirm three fixed same-origin routes, no `localStorage` or `indexedDB`, confirmation/input invalidation, request abort, draft-edit generation protection, editable draft controls, and browser-valid weekly-hour inputs including 25 and 25.5 within the unchanged server range.
- `git diff --check`: passed after the candidate changes.

No local-model runtime was started and no model call was made for this UI preparation.

## Separately gated real UI smoke plan

The later smoke test may run only after independent review of the exact source hash above and a separate explicit start gate. It must use a fresh observed loopback runtime and an unused `ui-smoke` allowance. The helper must reserve every POST before transport and stop on the first mismatch, timeout, cancellation, unexpected result, or budget error.

The sole planned desktop flow is:

1. Submit the free task with all intent fields unset: one plan POST, expecting the neutral missing-values clarification and zero source reads.
2. Enter and explicitly confirm `Lina Mustervertrag`, 25 weekly hours, `2031-09-01`, and no general reference for the current text/revision.
3. Submit that new confirmed action: one plan POST plus one draft POST, expecting the cited non-binding draft.

That is three expected POSTs. The `ui-smoke` ceiling is four only as a fail-closed stop allowance; it does not authorize a retry, warmup, parallel request, second scenario, or tuning. Mobile layout at 390 CSS pixels, cancellation, edit invalidation, error retention, and the collapsed legacy panels are checked without extra model calls. The runtime must be stopped immediately afterward. A successful smoke proves only this single synthetic UI path, not a generic assistant, production readiness, legal correctness, or exactly-once behavior.
