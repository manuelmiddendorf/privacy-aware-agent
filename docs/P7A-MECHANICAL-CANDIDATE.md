# P7A mechanical candidate

Date: 2026-10-25  
Status: ready for independent mechanical review; no P7 model inference, real-model UI wiring, commit, push, or publication.

## Scope

This candidate implements the local synthetic-text boundary described in `P7-LOCAL-SKILLS-CONTRACT.md`:

- five stable catalog IDs, with only `DOCUMENT_UNDERSTANDING` and `TEXT_COMPOSITION` executable;
- the exact ordered combination `DOCUMENT_UNDERSTANDING`, then `TEXT_COMPOSITION` in one generation call;
- trusted host authorization before source reads, explicit synthetic-sensitive capability, bounded in-memory sources, host paragraph IDs, durable revocation, generation fences, and citation-membership checks;
- a separate local UI panel labelled `LOCAL_TEST_DOUBLE`, with no persistent browser storage;
- a prepared Ollama adapter that reuses the P6 transport boundary and pins the reviewed loopback model, manifest, schemas, byte limits, timeout, no-retry behavior, and two fixed prompt configurations;
- the six disclosed development cases and their frozen criteria.

The adapter is preparation for P7B only. It is not connected to the UI and has not made a model call. The six private holdout cases remain unread by the implementation. The existing external `PrivacyAwareAgent`, privacy gate, OpenAI paths, and P6 research lane are unchanged by P7.

## Frozen candidate hash

The P7 mechanical candidate hash is:

`4f848263aa4bf03558da4efee7e284e9a1ac623455ab85b636d620988ad67152`

This is SHA-256 over the ordered concatenation of each UTF-8 path, a NUL byte, and the exact file bytes:

1. `README.md`
2. `config/p7-prompt-configs.json`
3. `config/p7-skill-catalog.json`
4. `docs/ARCHITECTURE.md`
5. `docs/P7-DEVELOPMENT-CASES.json`
6. `docs/P7-LOCAL-SKILLS-CONTRACT.md`
7. `src/localSkillAuthority.ts`
8. `src/localSkillCatalog.ts`
9. `src/localSkillLane.ts`
10. `src/localSkillModel.ts`
11. `src/localSkillSources.ts`
12. `src/localSkillTypes.ts`
13. `src/ollamaLocalSkillAdapter.ts`
14. `src/localUiServer.ts`
15. `tests/localSkillCatalog.test.ts`
16. `tests/localSkillLane.test.ts`
17. `tests/localSkillSources.test.ts`
18. `tests/ollamaLocalSkillAdapter.test.ts`
19. `tests/localUiServer.test.ts`
20. `ui/app.js`
21. `ui/index.html`
22. `ui/styles.css`

This report is excluded so that recording the hash does not change it. Any change to one of the listed files invalidates the candidate hash.

## Prompt configurations

Both configurations use the same model and runtime budgets: 16,384 model-context tokens, a 12 KiB final serialized model-prompt cap, 128 proposal tokens, 768 generation tokens, and a separate 24 KiB HTTP request cap. Their checked-in canonical SHA-256 values are:

- `P7_SKILLS_A`: `aecd1de45873952ab932c7591de9cf40b416277ae161b7b52159d38d2199012e`
- `P7_SKILLS_B`: `086f03498699736663a2f5c0874bcf7e2d6ebe41893eb1b3441adab9d9d4adca`

No configuration has been selected. Selection is permitted only after the two development runs and before the single holdout run.

## Mechanical verification

Using Node.js 20.20.1:

- TypeScript typecheck: passed.
- Catalog, source, authority, lane, race, Ollama adapter, and prompt-hash tests: 24 passed, 0 failed from a fresh build in `/private/tmp`.
- Local UI/server boundary tests: 6 passed, 0 failed after the standard project build in the authorized host context; the managed sandbox cannot bind loopback ports (`EPERM`).
- `git diff --check`: passed.
- P6 core hash: `754391021dfa974659c4903367f9b8b2fd8c9c2690238e87c100cc0019b9af9d` (unchanged).
- P6 adapter hash: `d6ef85281731b73b79393b615943563956a5b7ddd1906cb6da8494796d164401` (unchanged).

The focused adapter tests prove zero transport calls for disabled, manifest-mismatched, oversized-model-context, or oversized-HTTP requests; rejection of inherited object keys as prompt configuration IDs; exact pinned loopback requests for both configurations; fixed pair schema; timeout and caller-abort handling even when a transport ignores cancellation; complete-envelope rejection; no retry; input snapshots; and absence of a second fetch engine.

## Remaining gates

Independent review must confirm the mechanical boundary and the candidate hash before any inference. P7B may then use only the six disclosed development cases, count both proposal and generation POSTs, and stay within the hard total ceiling of 40 local POSTs. One prompt configuration must be selected and hash-frozen before the private holdout run. Real-model UI wiring remains a later gate after the usefulness and security review.
