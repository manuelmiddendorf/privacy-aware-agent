# P2 targeted privacy and evidence result

Date: 2026-10-24

## Scope

P2 corrects only the reproduced P09–P11 privacy gaps and the P06 default evidence-relevance gap. The frozen P1 catalog and original result remain unchanged with their original hashes.

The post-fix raw result is [PRACTICAL-P2-RESULT.json](PRACTICAL-P2-RESULT.json), SHA-256 `9ecdc1db4dd56fbadfcb1e02b9d1a5f63971f4e8e672c54ac16da8061e223403`.

## Privacy correction

The guard now recognizes the narrowly observed phrases for acute breathing difficulty, explicit medical treatment, and preschool-child compounds. P09 and P10 return `BLOCK_HEALTH_DATA`; P11 returns `BLOCK_CHILD_DATA`. Each stops with zero provider calls.

Adjacent benign German examples remain `SAFE_GENERIC`: a workshop treating a topic, instructions about breathing while singing, complaints about a timetable, a preschool planning a public market, and an adult group member bringing reusable cups. These examples limit obvious overreach but do not establish general named-entity recognition, medical detection, multilingual coverage, or anonymity.

## Evidence correction

Any request that loads documents now requires a trusted synchronous assessor to return the literal boolean `true`. The default confirms only source-free drafts and summaries. It does not infer that evidence is false or irrelevant; it records that sufficiency has not been affirmatively confirmed.

The synthetic demo/eval success cases use a named exact fixture assessor. Its decision binds the exact task, full text, source order, tenant-bearing loaded document IDs, titles, bodies, and classifications. A changed question or changed expected document body receives `BLOCK_EVIDENCE_INSUFFICIENT` with zero calls. This is a manually encoded host decision for fixed fixtures, not a semantic relevance engine or a source-ID allowlist for arbitrary questions.

- P06 now returns `BLOCK_EVIDENCE_INSUFFICIENT` with zero calls.
- P01, P04, and P07 also return `BLOCK_EVIDENCE_INSUFFICIENT` by default, making the tightened contract visible.
- Separate tests bind each of P01, P04, and P07 to its exact synthetic request/document pair; each then makes exactly one offline mock call.
- A P01 decision does not approve P06.
- Source-free draft and summary cases continue to make one call.
- Privacy blocks still run before an explicitly positive host assessor.
- Promise, unknown, false, and thrown assessor results retain fail-closed behavior.

The neutral user-facing text for `BLOCK_EVIDENCE_INSUFFICIENT` is: “The information needed for this answer has not been sufficiently confirmed.” It does not claim general contradiction or relevance detection.

## Remaining P1 boundaries

- P08 and P14 still stop at `BLOCK_SOURCE_DENIED` because no isolated fixture injection seam exists. They remain semantically untested.
- P02/P03/P04/P15 deterministic mock quality observations remain visible; no mock templates were changed.
- No general semantic evidence engine, NER system, loader redesign, prompt-injection proof, or broad privacy guarantee was added.

## Verification

- Directly affected Privacy/Evidence/Orchestrator/Transport/OpenAI groups: 39/39 passed.
- Focused privacy, evidence, and demo group: 9/9 passed.
- Exact practical evidence regression: 2/2 passed.
- Full local suite: 53/53 passed.
- Fixed offline evaluation: 48/48 passed; 18 allowed, 30 blocked, and all 30 expected blocks made zero provider calls.
- Post-fix P1 catalog replay: 16 cases, zero network calls, four offline mock calls. Its remaining target differences are the deliberate default blocks P01/P04/P07 and the unexecuted loader cases P08/P14.

No API call, key access, ledger read/reset, commit, push, pull request, tag, release, UI work, Amsel change, Netlify change, or deployment occurred.
