# P8 remaining-path evidence candidate

Date: 2026-10-25
Status: model-free preparation ready for independent source review; zero remaining-path model calls, claim unset, runtime stopped.

## Preserved result and narrow host correction

The failed original three-case validation and the protected field-set correction report remain unchanged. In the stopped WF02 result, the model proposed the only authorized synthetic person although the request named no person. The host asked for confirmation and read no source data, but the proposal did not meet the preregistered neutral-question expectation.

The host now retains an unconfirmed model person proposal only when the request contains that authorized person's exact host-known display label. When the request names no person, the host asks the existing neutral question and clears the proposed person ID. An already confirmed host selection remains authoritative, subject to the existing contradiction, authorization, generation, and revocation checks. This is a closed exact-label check, not general person extraction or an automatic selection.

Offline regression coverage uses the exact stored WF02 plan shape, including its repeated known field. It confirms the neutral question, a null proposed person, zero getter calls, zero research, and zero draft calls. Separate tests cover an exact named authorized label, a normal explicitly confirmed follow-up through the public `Workflow.run` API, contradictions, aborts, and revocation. No new app state or replay API is required: the confirmed follow-up and the research action are ordinary new requests with fresh authority checks.

## Explicitly bounded remaining evidence

The independent dated amendment authorizes preparation only for two previously unexecuted normal user actions:

1. `WF02_EXPLICIT_CONFIRMED_ACTION`: a new, complete, explicitly confirmed request, expected to use one plan and one draft POST, one getter call, and no research call.
2. `WF03_COMPLETE_MOCK_RESEARCH`: the unchanged complete synthetic research fixture, expected to use one plan and one draft POST, one getter call, and the one fixed offline mock call.

The old initial clarification remains failed. This is not a replay, resume, or full three-case rerun. A private evidence helper calls the existing public workflow normally for each action, creates fresh authority state, records the exact synthetic request, closed model requests and outputs, getter count, exact mock payload, result, and counters, and stops permanently on the first mismatch.

## Frozen inputs

- Remaining-path protocol SHA-256: `a7ea3adee40c2b38024f2819acd95012763b9a67c75326b10688d7f9f34734ff`
- Preserved field-set report SHA-256: `640d4c5b86915f44d10dbde39fcdba4a40e37c9c71566c788ac5f595f4a67bd2`
- Preserved ledger-before SHA-256: `e6e42cc9a800833dd4f99471fe7843cd3f6d75cd0a03f196dcccc612cc827771`
- Fixed fixture SHA-256: `84d126eb3ae5ea0132c59ae64fd894280b0a081a52441ada89c5afc381ded264`
- Reviewed source core SHA-256: `3b1c14a5b1fea75d73fb58d7bf367fd53bd9402ab3acac3b5655254798b3c261`
- Private evidence helper SHA-256: `111c0b138c4bcfa977ceb355219c0c2d5784e19983af366ec69f2a5a9d6228cb`

The source core binds the workflow, catalog, shared outbound boundary, local adapters and transport constants, budget/claim logic, runtime verifier, focused tests, and pinned runtime scripts. The helper hash binds only `src/p8RemainingPathsRunner.ts` and `tests/p8RemainingPathsRunner.test.ts`. Readiness constants are outside both hashes to avoid self-reference and require independent review with the hashes above.

## Durable gate and call ceiling

The new correction-independent claim is atomically single-use. Before it can be written, the private helper verifies the exact protocol, preserved report, fixture, raw 15-reservation ledger, reviewed source, helper, sandbox, and fresh pinned runtime metadata. The claim repeats the exact raw ledger hash check while holding the ledger lock and stores all evidence bindings plus the fresh runtime metadata hash.

Remaining-path reservations use the existing `working-time-workflow` phase and are rejected until this separate claim exists. Every POST is reserved before transport. Only four new POSTs are available, moving the campaign from 15 to at most 19 and the cumulative P8 workflow count from four to its existing ceiling of eight. No probe, warmup, retry, reset, continuation after an error, or further workflow round is available.

## Model-free verification

- Fresh Node.js build: passed.
- Focused workflow, research boundary/catalog, adapter, ledger, historical lock, runtime-readiness, and private-helper tests: 49 passed, 0 failed.
- Exact stored WF02 proposal regression and normal confirmed-follow-up API test: passed.
- Model-free remaining-path preflight against the real protected artifacts and 15-reservation ledger: passed with zero POSTs.
- `git diff --check`: passed.
- Runtime state: no listener on `127.0.0.1:11435`.

Independent review and a separate explicit start gate are required before starting the runtime, consuming the claim, or making any of the four local model POSTs. Even a successful run would demonstrate only the explicitly confirmed action-to-draft path and the fixed offline-mock-research-to-draft path. It would not retroactively pass the failed initial clarification or establish a complete UI flow.
