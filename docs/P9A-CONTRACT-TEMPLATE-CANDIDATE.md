# P9A contract-template candidate

Date: 2026-10-25
Status: corrected source independently reviewed and accepted; separate one-case correction run passed. Later host-only status-prefix delta is recorded under P9B.

## Implemented boundary

The existing synthetic working-time workflow is now presented as **Vertragsänderung vorbereiten**. It keeps `general_requirements` and adds the separate closed catalog goal `generic_amendment_template`. The template choice is explicit, separate from the general-reference choice, and bound to the current UI text and field revision.

The generic MOCK request is deterministic and contains only the fixed document type, section identifiers, approved placeholders, language, format, and size limit. It carries no person, source or scope ID, name, hours, date, pay, original contract text, or history. The returned template must exactly match the approved sections, placeholder order, and `MOCK_OFFLINE` provenance. Extra clauses, unknown placeholders, additional keys, foreign provenance, and injected instructions fail closed.

The local model is constrained to a closed merge proposal. Host code verifies the person label, old and new hours, date, source citations, and unchanged-term evidence, then renders the agreement deterministically. The employer remains `[ARBEITGEBER ERGÄNZEN]`; pay and possible consequences remain separate open points. A reported source conflict returns a controlled clarification before rendering. Incomplete evidence for an unchanged-term claim fails closed. This is a narrow structured prototype, not semantic review of arbitrary contracts and not legal validation.

Confirmation, input invalidation, cancellation, revocation, stale-response protection, editable in-memory results, and protection against overwriting a manually edited draft remain. There is no save, send, persistence, tool, external URL, or provider route.

## Candidate manifest

This frozen manifest identifies the source used for the accepted empirical P9A correction run. It is the SHA-256 of the following newline-delimited SHA-256 listing. A later deterministic host-only status-prefix change does not alter the preserved run; its new source scope is recorded in `docs/P9B-REDUCED-CLAUSE-RESULT.md`.

`1fc698f0286fa209361c9c4d8065cfcae51c37fdf81a265b7735339500264a29`

| File | SHA-256 |
| --- | --- |
| `src/workingTimeResearchCatalog.ts` | `a6e72fed62b955766a24dc854a38741822e203f6ec17daf5696a34ba18033c38` |
| `src/workingTimeContractWorkflow.ts` | `afbbd828aa99e94fed02dd9772b1d9cea1e89e5c22aa851ac64542b1101cab4d` |
| `src/ollamaWorkingTimeWorkflowAdapter.ts` | `80bb3b5ebdbad26d294434384569d8a1ca2d4ce3261633932298bfe52cb769b8` |
| `src/localUiServer.ts` | `c01b82b17950c6be9be7061fb2a445956ec094a09b43ff5c1797c0adad241ab7` |
| `ui/index.html` | `14ff20c48de8fb03c11fe7de71f7da9ea376d50e8e1d00e3a00b3ab02db55b5b` |
| `ui/app.js` | `0ade279278dc9e5d81a4a9cf059d7aac4c6b5a942f3185cd5f43555558501bc9` |
| `tests/workingTimeResearchCatalog.test.ts` | `4c3aaeda2ad3a5dea772947af4006e5fd2f9fd0e70065292e782f5cbdee457c7` |
| `tests/workingTimeContractWorkflow.test.ts` | `680e7a15bc916f49942eae7a02fc096cabce048467365839e92b9dbcefe25919` |
| `tests/ollamaWorkingTimeWorkflowAdapter.test.ts` | `c4c5e0e7ad0770bfd17bbb0317ec95394185eac8d2c04d780f3d26bd58a20a1c` |
| `tests/localUiServer.test.ts` | `dc241d4aa6c6982d3c8ff1a96388306650d92e4c32a3b2c51e60f6a23ecfbdfb` |
| `docs/P9-CONTRACT-TEMPLATE-PLAN.md` | `eecfa3f8c015b679b3943ea9ff675e11b1243b897bcf8b9a636d8ff5e3be651d` |

## Verification performed

- TypeScript `--noEmit`: passed.
- Temporary clean compilation with Node 20 and the repository TypeScript configuration: passed. The ordinary `dist` directory was not overwritten because this session has no write grant for that path.
- Catalog, workflow, and Ollama-adapter tests: 21/21 passed after the host-required-fields correction; five related historical P8 lock/readiness tests also passed.
- Local HTTP/UI boundary tests on `127.0.0.1`: 9/9 passed after rerunning with local-listener permission and the static assets copied into the temporary compiler layout.
- `git diff --check`: passed before this report and must be rerun after final documentation.
- The first gated P9A run made exactly two local-model POSTs for its first case and then failed closed because its field proposal omitted host-required source fields. The second case was not run. Exact evidence and immutable ledger hashes are recorded in `docs/P9A-DEVELOPMENT-RESULT.md`. The P7/P8 ledger remains at 22 reservations with SHA-256 `587620cab9b67114f77b983086140e058870a972f918db8abb9cf5140c4206c0`.
- The separate two-POST correction of that same first case passed: one authorized four-field getter, one exact generic template MOCK, one validated closed merge, and one deterministic host-rendered agreement. The aggregate P9 total is four.
- No server or model runtime remains running. No commit, push, deployment, cloud call, key use, real contract, or Amsel-App change was made.

## Remaining boundary

The separate correction gate has been consumed. The aggregate P9 total is four POSTs and no further P9A inference is authorized. The original failed report and ledger remain unchanged, the correction evidence is recorded in `docs/P9A-DEVELOPMENT-RESULT.md`, and the original second case was not resumed. Current hours remain 20; employer, pay, and consequences remain open. The empirical claim is limited to the corrected confirmed MOCK-template case. P9B remains disabled and separate from the accepted P9A path.
