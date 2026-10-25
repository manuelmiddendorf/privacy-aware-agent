# P8 synthetic working-time workflow candidate

Date: 2026-10-25
Status: model-free candidate ready for independent source review; zero P8 inference calls, zero external calls, zero UI wiring.

## Preserved history

The original P7 A/B failure and its ten reservations remain unchanged. The single authorized route-v2 attempt added reservation 11 and stopped in P7-01 before any model proposal or generation because orchestration started the runner before the separately launched server had completed its preflight and begun listening. The runner itself had host loopback permission. This is a technical startup race, not a model rejection. There was no retry, probe, warmup, holdout, or UI call.

The durable ledger remains at 11 reservations, SHA-256 `89a68afcc9aa2360de4b577d93afbe0c5eac60ef99d65292b63627f8a23c04d5`. The P8 workflow claim is unset. The generic P7 holdout remains closed.

## Frozen contracts

- Independent protocol amendment: `d721b00c0334c8cdc7bd85ee98aee4bc0bdb734e0159405c2f83fcdc9fccb9fe`
- P8 core: `0e081d98d7cee178317d42add983f2bf403971d7fda38620cbf0f652ea08999a`
- Preregistered three-case fixture: `84d126eb3ae5ea0132c59ae64fd894280b0a081a52441ada89c5afc381ded264`
- Canonical understand/draft prompts: `55dce156b0ce725c54d491f7eba8efb83e1c1b140dcd2411d00d48545506e4ce`
- Readiness module/test support hash: `de30cdb06ec6ba7f2d4aebd3171d3c12b5a696c80f77b24595a289876162194b`

The core hash uses UTF-8 path, NUL, exact bytes in this order:

1. `docs/P8-WORKING-TIME-WORKFLOW-CONTRACT.md`
2. `docs/P8-WORKFLOW-CASES.json`
3. `src/researchOutboundBoundary.ts`
4. `src/localResearchLane.ts`
5. `src/workingTimeContractWorkflow.ts`
6. `src/workingTimeResearchCatalog.ts`
7. `src/ollamaWorkingTimeWorkflowAdapter.ts`
8. `src/p7LocalCallBudget.ts`
9. `src/p8WorkflowRunner.ts`
10. `tests/localResearchLane.test.ts`
11. `tests/workingTimeContractWorkflow.test.ts`
12. `tests/workingTimeResearchCatalog.test.ts`
13. `tests/ollamaWorkingTimeWorkflowAdapter.test.ts`
14. `tests/p7LocalCallBudget.test.ts`
15. `tests/p8WorkflowRunner.test.ts`
16. `scripts/p8-ollama-serve.sh`
17. `scripts/p8-observe-runtime.sh`

`src/p8WorkflowReadiness.ts` and its test are intentionally outside that core to avoid a self-referential embedded core hash. Their exact ordered support hash is separately bound above.

## Security and product boundary

The free request is interpreted locally against a host-provided list of authorized synthetic people. The model can propose one allowed person ID, hours, a calendar date, a research flag, and closed source fields. The host requires a separate four-field confirmed intent. Missing values produce targeted questions; contradictions require reconfirmation. Actor, organization, session, task, source, person, and every field are checked before the field-scoped getter. Getter failures, malformed nested/scalar values, aborts, permanent revocation, and generation changes fail closed before research or drafting.

Research requires a separate trusted capability. User-controlled catalog intent has exactly four fields; catalog version 1 is trusted host configuration. The renderer produces the one exact generic German question. The entire fixed mock payload passes the shared outbound privacy boundary. No original request, person, hours, date, organization, actor, source, trace, history, header, or private quotation is sent to the mock.

The model has no tool or action channel. Drafts are non-binding, use only filtered fields, permit only supplied paragraph citations, retain gaps and review notes, and reject URL/tool/save/send output. There is no persistence, real personnel source, Amsel integration, external provider, or current legal research.

## Call plan and evidence

The preregistered useful paths require seven expected local POSTs:

- complete without research: understand + draft = 2;
- missing values, then deliberate confirmed follow-up: understand + understand + draft = 3;
- complete with generic offline mock research: understand + draft = 2.

The phase ceiling is eight only to record one observed stopped attempt; it is not retry or tuning permission. The single-use claim requires the exact preserved eleven-call history. Every POST is reserved before transport. The protected benchmark report records each bounded synthetic model request body with fixed headers/system prompt/parameters, each closed model output, the exact complete mock payload, filtered read count, results, and counts. It records no application traffic, key, real data, or chain of thought.

The deliberate follow-up is permitted only after the first result is exactly the preregistered clarification with the expected ordered questions. A model-schema, transport, denial, stale-generation, or draft error stops immediately without a follow-up. An unexpected first draft also stops. Final acceptance requires a draft result, not merely any successful result.

## Readiness and verification

The new runtime path starts the pinned server as its own process and records its PID. A separate model-free observer reruns sandbox/runtime hash checks, verifies that the same executable PID is the listener on `127.0.0.1:11435`, and writes fresh mode-0600 metadata. The runner verifies protocol/core/support inputs and the 11-call unclaimed ledger before runtime use, then verifies listener metadata before the one-use claim. It performs no inference probe or warmup.

- Fresh Node.js 20 TypeScript build to `/private/tmp`: passed.
- Focused workflow, catalog, shared research boundary, adapter, budget, runner, follow-up suppression, restart/revocation, malformed-field, and readiness tests: 41 passed, 0 failed.
- Synthetic runner simulation: exactly 7 reserved POSTs, 11 to 18, no retry, report evidence present, single-use enforced.
- Model-free real-ledger preflight: passed, zero POSTs.
- Shell syntax for both runtime scripts: passed.
- `git diff --check`: passed.

Independent review and an explicit start gate are required before starting the runtime, claiming P8, or making any P8 model call. No usefulness claim is made from test doubles.
