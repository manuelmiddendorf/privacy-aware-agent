# P8 synthetic working-time workflow contract

Date: 2026-10-25
Status: implementation candidate; zero workflow inference calls; zero external calls.

## Fixed scope

The workflow accepts a free local request for one synthetic employment-contract working-time change. It can ask for the synthetic person, target weekly hours, or effective date, then prepare a non-binding local draft. It cannot read a personnel file, alter a contract, persist, send, call tools, follow URLs, or claim legal correctness.

The host owns actor, organization, session, task, person, source, and field authorization. A model may propose only the closed field identifiers needed for this task. The host validates every identifier before invoking a field-scoped getter and returns only those fields. Source-wide P7 readability is insufficient.

## Phases and data flow

1. **Begin:** validate an exact request snapshot and bind it to the current actor, organization, session, task, source, purpose, and generation.
2. **Plan locally:** one pinned local-model call may propose only an authorized synthetic person ID, target hours, a real calendar date, the research flag, and required source fields. Person resolution is limited to the host-provided authorized synthetic scope; there is no open personnel lookup.
3. **Bind or clarify:** the user-controlled confirmation object has exactly four fields: `personId`, `targetWeeklyHours`, `effectiveDate`, and `researchRequested`. Missing values receive targeted questions. An unconfirmed model person proposal is retained only when the free request contains the exact host-known display label for that authorized person; otherwise the host asks the neutral person question and clears the proposed person ID. This is a closed label check, not general entity recognition. Model proposals never silently replace confirmed values; contradictions require a new confirmation. No source getter, research mock, or draft call occurs before all four values are confirmed.
4. **Authorize and read:** validate person membership plus every requested source field. Only then call the field-scoped getter. Unknown, extra, or denied fields fail closed.
5. **Optional research:** requires a separate trusted actor/organization/task capability. The host holds catalog version 1 separately from the user-controlled four-field catalog intent. A trusted renderer creates the exact generic German question. The complete mock payload contains only a fixed instruction, that question, and fixed technical parameters. It contains no original request, person, hours, date, organization, actor, source, trace, history, headers, or private quotation.
6. **Draft locally:** one pinned local-model call receives the authorized filtered values, fixed research answer if requested, and fixed drafting constraints. Its closed output is a non-binding draft with citations, gaps, and review notes.
7. **Revalidate:** after every await, current generation and rights must still match. Stale results are discarded without a follow-up call.

## Closed research entry

```json
{"type":"employment_contract_change","jurisdiction":"DE","topic":"weekly_working_hours","goal":"general_requirements"}
```

It renders exactly:

`Welche allgemeinen Anforderungen gelten bei einer Änderung der vertraglichen Wochenarbeitszeit in Deutschland?`

Unknown versions, keys, types, jurisdictions, topics, goals, combinations, mutations, or injection text never reach the mock provider. Frozen mock references are synthetic and are not current legal research or individual legal advice.

Catalog version `1` is trusted host configuration, not a fifth user-controlled intent field. Dates must be real calendar dates. The hours range is only a technical serialization bound and makes no legal statement.

`requiredSourceFields` is a read-only field set represented by an array of one to four items. Every raw item must first be an exact known string and authorized for the current actor, organization, task, person, and source. Only after all those checks may the host collapse exact duplicates in first-occurrence order and invoke the getter once with that set. Unknown or denied values, nested values, coercion, trimming, silent dropping, and arrays over four items are forbidden. This set rule does not apply to the strict external research catalog.

## Preregistered synthetic matrix

- WF01: OrgWF-A / ActorWF-A / Lina Mustervertrag; 20 to 25 hours from 2031-09-01; paragraphs state the current 20 hours and that other terms remain unchanged. Produce a useful, clearly non-binding draft.
- WF02: missing or ambiguous person asks exactly for the person; no person search or getter.
- WF03: missing hours/date asks only for the missing value; the answer starts a newly authorized request.
- WF04: the model may request only needed typed fields; the getter runs after all rights checks and returns only those fields.
- WF05: foreign actor, organization, task, or source causes zero getter, domain-model, and mock calls.
- WF06: salary, bank, health, or another person is denied; no default profile or broad record read.
- WF07: scope, intent, or revocation changes during an await discard the old result with no follow-up call.
- WF08: contract or model injection cannot create a tool, URL, save, send, getter, or extra-schema path.
- WF09: the valid four-part catalog intent produces the exact question and privacy-minimal mock payload. Sufficient local sources also allow a draft without research.
- WF10: extra keys, enum/version changes, mutation, and timeout cause zero invalid mock calls, no fallback, and no retry.

Protection cases are model-free where possible. A later gated utility check may use exactly the preregistered semantic plan of at most seven expected local-model calls: complete without research (understand + draft = 2), missing information followed by a newly authorized confirmed answer (understand + understand + draft = 3), and complete with mock research (understand + draft = 2). The eighth-call ceiling is only a stop allowance for an observed failed attempt and never authorizes retry or tuning. This allocation must be reconciled with the existing durable ledger, whose historical technical V2 failure remains reservation 11. No call has been made for this workflow.

Before the first reserved workflow POST, a model-free readiness barrier must verify exact source and protocol hashes, the immutable ledger history and single-use workflow claim, the pinned sandbox/runtime/model metadata, and a separately started runtime whose PID is the PID actually listening on `127.0.0.1:11435`. A one-second process yield, inference probe, or warmup is not readiness evidence.

The first P8 candidate stopped after one POST because the model repeated one known field name. That report, its eleven-to-twelve ledger transition, and a protected source archive remain historical evidence. A separate field-set correction may run only once after independent hash review: it requires the exact failed report and ledger hashes, the correction protocol, a fresh runtime observation, and a separate correction claim. It performs a fresh full three-case run with at most seven new POSTs. Together with the historical one, this exhausts the cumulative P8 cap of eight. It is validation of a changed host contract, not a retry or success claim for the original candidate.

## Later backlog: controlled free-text research

After the local workflow and closed catalog work reliably, a separate, default-disabled path may be evaluated only when no catalog entry fits. It must show the exact outbound text for **Edit**, **Start**, or **Keep local**; bind approval to that final text revision plus session, organization, and current rights; and invalidate approval after every edit. Identifier, privacy, and policy checks must run before preview, after editing, and immediately before transport. A click cannot override a block. The complete payload and fixed system/technical parameters must be transparent and contain no hidden private context. This path has weaker guarantees than the literal catalog and is not consent or a legal basis for third-party or special-category data. Its first evaluation remains offline with a dedicated mock. It is not implemented or activated in this milestone and grants no API, web, or cost permission.
