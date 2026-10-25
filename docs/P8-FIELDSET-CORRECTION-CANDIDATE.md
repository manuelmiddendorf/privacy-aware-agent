# P8 field-set correction candidate

Date: 2026-10-25
Status: model-free correction candidate ready for independent source review; zero correction inference calls, zero external calls, zero UI wiring.

## Preserved failed attempt

The first P8 development run remains a stopped, unsuccessful attempt. It reserved exactly one workflow POST, for `WF01_COMPLETE_LOCAL` at the `understand` stage, and stopped before any source read, mock research, or draft because the model returned the known source field `contract_paragraphs` twice. The strict host schema rejected that duplicate. There was no retry or follow-up.

- Failed protected report SHA-256: `fcdb0e869bf7689ce823bebdf9af9436a0052318be04269383538c2a074ce255`
- Failed candidate core SHA-256: `0e081d98d7cee178317d42add983f2bf403971d7fda38620cbf0f652ea08999a`
- Failed candidate support SHA-256: `de30cdb06ec6ba7f2d4aebd3171d3c12b5a696c80f77b24595a289876162194b`
- Protected failed-source archive SHA-256: `5aa484b7aa7e0d7ccf7bd55a54b9e9f7aa6f5209e0a5def48954514e68f2f6b6`
- Preserved ledger SHA-256: `5aee7da562b7143d1bf01f2f5876e5941d60d0a69963f6ca67d0e4d62ab3bc76`
- Preserved reservations: 12; the separate correction claim is unset.

## Monotone host-only correction

`requiredSourceFields` is now treated as a semantic set while retaining strict host control. The raw model array must contain between one and four entries. Before normalization, the host validates every raw entry as an exact known field name and checks field authorization. It then removes duplicate known entries in first-occurrence order and invokes the field-scoped getter exactly once with that normalized set.

Unknown, denied, nested, coerced, whitespace-modified, empty, or more-than-four raw entries still fail before the getter. The external research catalog, outbound privacy boundary, four-field confirmed intent, actor/organization/session/task/source/person checks, generation and revocation checks, prompt text, model, parameters, fixed fixture, and semantic acceptance criteria are unchanged.

This change broadens only the harmless representation of an already authorized field set. It does not broaden the set of readable fields or add a fallback.

## Frozen correction inputs

- Independent field-set correction protocol SHA-256: `65e5a8e5bf045fb8cc6c0b7fa5146316dcecbcdeabceb5f83433b646854d6c63`
- Corrected P8 core SHA-256: `966a953ef8a00e2a0fd4acca2772e924e94fb49c5acece5452ca263dbd4d8ce0`
- Corrected readiness module/test support SHA-256: `760c6e4eb25e6120a2ec583fa4aa9f086fa9ca0d959fdca21f1994bcf9ffae8c`
- Preregistered three-case fixture SHA-256: `84d126eb3ae5ea0132c59ae64fd894280b0a081a52441ada89c5afc381ded264`
- Unchanged canonical understand/draft prompts SHA-256: `55dce156b0ce725c54d491f7eba8efb83e1c1b140dcd2411d00d48545506e4ce`

The corrected core uses the same ordered path-plus-NUL-plus-exact-bytes construction and file order recorded in `P8-WORKFLOW-CANDIDATE.md`. `src/p8WorkflowReadiness.ts` and `tests/p8WorkflowReadiness.test.ts` remain outside the core to avoid a self-reference and are bound by the separate support hash above.

## Durable correction gate and call plan

The correction uses a new single-use claim. It requires the exact protected failed report, protected failed-source archive, corrected core, fresh runtime metadata, and preserved ledger history. It does not reset or reuse the first P8 claim.

After independent review and a separate explicit start gate, the correction run must execute the entire unchanged three-case fixture from the start. It may reserve exactly the seven preregistered POSTs required by the useful paths: two for the complete local case, three for the clarification case, and two for the offline-mock research case. Together with the one historical stopped P8 POST, the cumulative P8 workflow ceiling remains eight. Every POST is reserved before transport. Any error stops without retry.

## Model-free verification

- Fresh Node.js 20 TypeScript build and focused tests: 44 passed, 0 failed.
- Duplicate-known-field test: stable first-occurrence normalization and exactly one getter call with the normalized set.
- Invalid-field tests: unknown, denied, nested, coerced, whitespace-modified, and more-than-four entries all produce zero getter calls.
- Correction claim tests: exact historical binding and single-use behavior passed.
- Model-free correction preflight against the real protected artifacts and ledger: passed with zero POSTs.
- Shell syntax and `git diff --check`: passed.
- Runtime state after verification: no listener on `127.0.0.1:11435`.

No usefulness claim is made from test doubles. Runtime start, correction claim, and local model calls remain blocked pending independent source review and a separate explicit start gate.
