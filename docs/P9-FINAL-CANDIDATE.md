# P9 final review candidate

Date: 2026-10-25
Status: source and model-free evidence complete; no commit, push, publication, or further inference authorized.

P9A is accepted only for the one corrected synthetic MOCK-template case recorded in `docs/P9A-DEVELOPMENT-RESULT.md`. The earlier two-call failure remains preserved, the other originally planned model variant remains unrun, and the four-call aggregate P9 allowance is exhausted. The later visible synthetic-status prefix is deterministic host rendering and made no model call.

P9B is an isolated, default-disabled library and synthetic test surface. It reads no variable contract clause and claims neither pseudonymization nor anonymization. It has no UI, server route, real provider, persistence, or product activation. Its exact boundary, test evidence, manual `MOCK_UI_MECHANICS` browser check, local screenshot hashes, and remaining limits are in `docs/P9B-REDUCED-CLAUSE-RESULT.md`.

The fresh Node 20 model-free build passed 175/175 tests. TypeScript typecheck, 48/48 offline evaluation, offline demo, and `git diff --check` passed. No listener remains on ports 4317 or 11435. The protected ledgers remain at P9 2 + correction 2 and historical P7/P8 22 reservations.

## Review file manifest

This non-self-referential manifest covers the public source, tests, UI assets, README, and preceding P9 evidence documents needed to review P9. It is SHA-256 over the exact 19-line `shasum -a 256` output represented below, including paths and newline endings:

`2b3689a0a594aee75896b6d1fa2b4bca8bf7222515d0824e2d36a21376777859`

| File | SHA-256 |
| --- | --- |
| `README.md` | `9410bb5ae19d9e1de8e38146e4780de42c8ff6f0bb788dfee3b9d1ef70f8be65` |
| `docs/P9-CONTRACT-TEMPLATE-PLAN.md` | `5b484ccbca604c34460a3b73a9b68b205286fc88c7170caad23ea1eea8153675` |
| `docs/P9A-CONTRACT-TEMPLATE-CANDIDATE.md` | `852c06e00feec94f7f1b6f26b7db97d8519f5c3c25bd86d805375955dc79d19b` |
| `docs/P9A-DEVELOPMENT-RESULT.md` | `01ea490338c772e31f66aff95bbbf4d83b7fb7593c04525232319f9e6f413ac4` |
| `docs/P9B-REDUCED-CLAUSE-RESULT.md` | `4d5482c415d74abb95dab8e881a15098536de1d2d488813191f0681597a20853` |
| `src/workingTimeResearchCatalog.ts` | `a6e72fed62b955766a24dc854a38741822e203f6ec17daf5696a34ba18033c38` |
| `src/workingTimeContractWorkflow.ts` | `ba88a7d754ff491aedecc653d915a1d10302bd24b5a00a0a1412a70dbdd26955` |
| `src/ollamaWorkingTimeWorkflowAdapter.ts` | `80bb3b5ebdbad26d294434384569d8a1ca2d4ce3261633932298bfe52cb769b8` |
| `src/localUiServer.ts` | `c01b82b17950c6be9be7061fb2a445956ec094a09b43ff5c1797c0adad241ab7` |
| `src/reducedClauseExcerptPrototype.ts` | `571c6a98141405e20cde2f317416d840d732c7045ecdef7383e15a730b536245` |
| `tests/workingTimeResearchCatalog.test.ts` | `4c3aaeda2ad3a5dea772947af4006e5fd2f9fd0e70065292e782f5cbdee457c7` |
| `tests/workingTimeContractWorkflow.test.ts` | `f1184e300bfe008337715f23e5a7805b66d5b42461382eb5d352d678cb6170ef` |
| `tests/ollamaWorkingTimeWorkflowAdapter.test.ts` | `c4c5e0e7ad0770bfd17bbb0317ec95394185eac8d2c04d780f3d26bd58a20a1c` |
| `tests/localUiServer.test.ts` | `dc241d4aa6c6982d3c8ff1a96388306650d92e4c32a3b2c51e60f6a23ecfbdfb` |
| `tests/reducedClauseExcerptPrototype.test.ts` | `8b2b77e538d84d00e0bf8295b32350d67750f0415db99a1d056b774b3d7b4d3a` |
| `tests/p7CorrectionRunner.test.ts` | `07f6f9bb8f3dbd79755b68a6a1da249c14c029068c7695c52a40903d7399a444` |
| `ui/index.html` | `14ff20c48de8fb03c11fe7de71f7da9ea376d50e8e1d00e3a00b3ab02db55b5b` |
| `ui/app.js` | `0ade279278dc9e5d81a4a9cf059d7aac4c6b5a942f3185cd5f43555558501bc9` |
| `ui/styles.css` | `825dc3e16c7acf6abc066f01f7864bc0eef5508162aac30d95819c8e4b33acfa` |

The private UI helper, protected reports, call ledgers, screenshots, and temporary builds are excluded from Git and from this public-file manifest. They remain local evidence only.

## Complete publishing lineage

The coherent public candidate starts at published `origin/main` commit `0299223560b0cb85faea89714973cea56f005b65`, then includes two existing local predecessor commits:

1. `4148a02064f7b44dd17a5a04ce3b6dcc12b6676c` — local offline demo UI, 9 changed or added public files relative to `0299223`;
2. `d2d7a18504408ed20ed9b7f7f821da80ba5befd1` — preserved P6 and initial P7 evidence, 50 changed or added public files relative to `4148a02`.

The current uncommitted P7/P8/P9 candidate contains 56 changed or untracked public files, including the final machine manifest. Because some of those modify files from the two predecessor commits, the complete candidate differs from `0299223` in 90 unique public paths: 89 hashed payload paths plus `docs/P9-PUBLIC-SNAPSHOT.sha256` itself. The exact sorted path-and-SHA-256 payload list is stored in that machine manifest. It excludes only itself, as a hash manifest cannot contain its own stable hash. Its own checksum is reported with the review handoff.

The candidate intentionally excludes every ignored or private runtime artifact, including `.env*`, `.local/`, keys, model blobs or manifests, protected runtime reports and ledgers, screenshots, temporary builds, and Amsel-App files. `LICENSE` and the historical MIT notice remain byte-identical to `0299223`; no dependency or lockfile change was introduced after the checked-in `package.json` scripts from the predecessor commits.
