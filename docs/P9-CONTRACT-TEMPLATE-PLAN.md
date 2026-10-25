# P9 contract-template plan

Date: 2026-10-25
Status: P9A accepted narrow candidate; P9B isolated model-free library implemented. No further runtime or model-call authorization.

## P9A — “Vertragsänderung vorbereiten”

The existing synthetic working-time workflow becomes the narrow local skill **Vertragsänderung vorbereiten**. It may prepare one editable, non-binding working-time amendment only after the host has bound the current organization, actor, session, task, source, authorized synthetic person, readable fields, and an exact user-confirmed person/hours/date/template choice.

The reusable catalog skill **Allgemeine Vorlage erstellen** adds exactly one closed catalog goal:

```json
{"type":"employment_contract_change","jurisdiction":"DE","topic":"weekly_working_hours","goal":"generic_amendment_template"}
```

The catalog renderer creates one deterministic German mock request containing only the fixed document kind, fixed approved placeholder names, fixed section identifiers, fixed language/format limits, and provenance requirements. It must contain no request text, name, person or source ID, hours, date, pay, original contract text, history, organization, actor, session, task, headers, or fallback text. There is no free-text or unknown-catalog fallback. `MOCK_OFFLINE` is a frozen synthetic stand-in, not current legal research.

The mock response is untrusted. The host accepts only the exact closed template ID, exact section keys and approved literal section patterns, exact ordered placeholder set, and exact mock provenance. Unknown placeholders, additional clauses, side terms, URLs, tools, instructions, source claims, or extra keys fail before local drafting. Host rights cannot be expanded by a template response.

After full confirmation, the host declares the complete data dependency for this skill: `display_name`, `current_weekly_hours`, `contract_paragraphs`, and `unchanged_terms`. Model-suggested fields remain a closed known-field proposal but cannot remove a required field through omission or duplication. The field-scoped getter receives the four-field set only after actor/organization/session/task/source/person and membership checks for every field; any missing field right denies the run before getter, template MOCK, or merge. The local model returns a closed merge proposal containing the exact supplied person label, old and new hours, effective date, unchanged-term status, citations, conflicts, open points, and review notes. The host validates all fact fields against the confirmed intent and source. A claimed unchanged-term fact also requires a citation to the structured source paragraph that exactly carries that authorized value; field presence alone is insufficient. Any reported source conflict stops with a controlled clarification before host rendering, so no unconditional continuation clause can hide it. The host renders the editable agreement only after these checks. The model does not write arbitrary clauses into the agreement.

The rendered result distinguishes:

- confirmed amendment facts: person, existing hours, new hours, and effective date;
- original cited contract clauses;
- unchanged terms only when supported by an authorized source field;
- unresolved conflicts and missing pay or consequential terms as separate open points;
- template provenance (`LOCAL_FIXED` or clearly labelled synthetic `MOCK_OFFLINE`).

It cannot conclude a contract, save, send, persist, call tools, open URLs, access another source, infer unknown pay, or claim legal correctness. Existing UI confirmation snapshots, dirty-input invalidation, abort behavior, single busy gate, editable in-memory draft, and late-response protection remain.

This is deliberately a strict prototype. It recognizes one closed working-time amendment shape and one structured synthetic source convention. It does not semantically review arbitrary contracts or establish that a clause is legally sufficient. Unmatched evidence, incomplete citations, or reported contradictions fail closed or require clarification instead of being interpreted broadly.

## P9A acceptance matrix

Model-free tests must cover:

1. exact generic-template catalog intent, outbound payload, approved placeholders, provenance, and zero private literals;
2. a valid mock template merged with confirmed synthetic person, 20-to-25-hour change, date, cited original clauses, and unchanged terms;
3. missing person, hours, or date: clarification, zero getter, zero template/mock call, zero draft;
4. unknown pay or consequences remain separate open points and never become agreement clauses;
5. unknown placeholder, extra side term, injection, foreign source/provenance, extra response key, and mutated catalog entry fail closed;
6. foreign organization/actor/session/task/source/person, denied field, revocation, abort, and stale generation prevent downstream work;
7. request or UI edits invalidate confirmation and pending results; a manually edited draft is not overwritten;
8. no save, send, autosave, browser persistence, provider tool, or external network route;
9. one readable example records the local model input, exact mock request, validated mock response, and host-rendered final agreement without real data.
10. duplicate or incomplete model field suggestions cannot displace any of the four host-required fields; missing authority for either `display_name` or `unchanged_terms` denies before the getter and all downstream work.

Tests should validate closed structure and equality to trusted facts instead of fragile prose matching. Before any real local-model run, freeze a bounded source manifest and hash, register a new durable P9-only call allowance without changing the existing 22-reservation P7/P8 history, obtain independent source review, and receive a separate explicit start gate.

## Implementation sequence

1. Extend the existing catalog with the single generic-template goal and strict request/response types.
2. Replace arbitrary model-authored agreement prose with a closed merge proposal and deterministic host rendering.
3. Integrate optional `MOCK_OFFLINE` template use into the existing workflow and UI while keeping the default real-model runner disabled.
4. Add focused catalog, workflow, adapter, HTTP/UI, revocation, abort, and stale-edit tests.
5. Record the exact model-free candidate manifest/hash and request independent review.
6. Only after a separate gate, run the smallest preregistered synthetic local-model check. No P7/P8 allowance may be reused.

This is a narrow extension of the existing workflow and catalog, not a new session, consent, persistence, provider, or agent framework. The durable maintenance surface stays in the existing catalog, workflow, adapter, and UI boundary.

## P9B — reduced clause excerpt, isolated implementation

P9B remains disabled by default and is not imported by the P9A workflow, local server, or UI. Its library accepts only one host-authorized source field, `reduced_clause_structure`, with one exact synthetic weekly-hours shape. It never accepts a whole document or free text from that source. The resulting exact outgoing text contains approved labels and placeholders only; it contains no names, hours, dates, pay, health information, original clauses, source content, request history, organization, actor, session, task, or source ID.

The prototype exposes four explicit host operations: prepare the visible preview, edit it within a two-heading closed allowlist, confirm the exact payload, or keep it local. Only an immutable preview object issued by the same prototype instance is accepted. Every edit attempt invalidates the earlier preview; a safe edit additionally produces a new generation, revision, and payload hash. Keeping a preview local consumes it. Confirmation is bound to payload hash, revision, organization, actor, session, task, source, authorization version, authority epoch, and request generation, and is consumed before the single mock call so repeat or parallel confirmation cannot duplicate transport. Rights, the complete host-rebuilt payload, privacy, and byte limits are checked again immediately before the dedicated `MOCK_OFFLINE` transport. Confirmation cannot turn an unsafe source or edit into an allowed request.

Unknown shapes, original personal values, dates, pay, health fields, rare combinations, additional text, foreign scope, missing field rights, revoked rights, context races, and stale or aborted confirmation remain local with zero transport calls. Missing minimization evidence also blocks. This is a narrow allowlist for a synthetic test structure. It neither anonymizes arbitrary clauses nor provides a universal PII detector. A future controlled free-text path must reuse the shared research/outbound boundary rather than add another consent or provider framework.

The small P9A presentation correction prepends the copied host-rendered agreement with `Unverbindlicher, ungeprüfter synthetischer Entwurf`. It is a deterministic post-run host change; it did not modify or rerun the accepted P9A model evidence.
