# P9A local-model development result

Date: 2026-10-25
Status: first gated run failed closed; separate two-call host-required-fields correction passed its one registered case and was accepted within its narrow boundary.

The independently reviewed P9A candidate was tested once with the first preregistered synthetic template case. The pinned local runtime passed the existing full readiness observer without an inference request. The runner then reserved and made exactly two POSTs: one plan and one merge. It stopped before the second preregistered case and the operator cleanup verified that no listener remained on `127.0.0.1:11435`.

The plan correctly selected the synthetic person, 25 weekly hours, 2031-09-01, no general research, and the generic template. Its requested source fields were `contract_paragraphs` plus `current_weekly_hours` three times. It omitted `display_name` and `unchanged_terms`. The authorized getter normalized the request to the named subset. The merge response nevertheless asserted the correct synthetic display name, current 20 hours, target 25 hours, date, both paragraph citations, and unchanged terms. Host validation rejected it as `DRAFT_INVALID` because those facts had not all been read through the authorized field getter. No agreement was rendered. The generic template MOCK was called once with the exact context-free fixed payload.

This remains a failed empirical run. It is not reclassified as a pass. The second original case was not executed, the P9 ledger was not reset, and no warmup, retry, or manual continuation occurred.

Evidence:

- protected report: `.local/p9/report-2026-10-25T07-01-09-451Z.json`, mode `0600`, SHA-256 `8c33eadac95f483d2346df97d20368aec64d6c51ef44f28a9ff4dda1a0de1cc0`;
- P9 ledger after the stop: 2 reservations, mode `0600`, SHA-256 `5014e5f30699319dddbe627303c8f9dcd7bd63a1d3603452fccab5318eb42ae7`;
- historical P7/P8 ledger: unchanged at 22 reservations, SHA-256 `587620cab9b67114f77b983086140e058870a972f918db8abb9cf5140c4206c0`;
- runtime after operator cleanup: no loopback listener.

The narrow correction makes the four already approved source fields a host-declared dependency of **Vertragsänderung vorbereiten**. A model field proposal cannot remove them through omission or duplication. Authority still checks every required field, source, person, organization, task, session, and generation before the getter. Missing access to any required field denies the run before getter, MOCK, or merge. No salary or additional source category was added.

The corrected source manifest `1fc698f0286fa209361c9c4d8065cfcae51c37fdf81a265b7735339500264a29` was independently reviewed and exercised under a separate immutable correction protocol. That one registered case used exactly two additional POSTs, bringing the aggregate P9 total to four. It reused the same first template request and the model returned the same incomplete, duplicate field proposal. The host nevertheless requested exactly the four declared fields through Authority, made one source read and one exact context-free template MOCK call, validated the closed merge, and rendered the deterministic agreement:

- Lina Mustervertrag;
- current 20 and target 25 weekly hours;
- effective date 2031-09-01;
- unchanged terms confirmed by citations `contract-lina:p01` and `contract-lina:p02`;
- employer plus pay and possible consequences retained as separate open points;
- template provenance `MOCK_OFFLINE`, general research disabled.

Correction evidence:

- protected report: `.local/p9/correction-report-2026-10-25T07-07-30-595Z.json`, mode `0600`, SHA-256 `b3ebddee793c116e3366e2ac78c34051b8e0dd5c19e72fc073a42fa69c701ca7`;
- separate correction ledger: 2 reservations, mode `0600`, SHA-256 `48691753457c185a2f8aa1c756552bcf5bac5ceafac6726e063056c10194acf2`;
- correction protocol: SHA-256 `d1329ca2eb55e06a113e75b8b6adef306feeedd9b3ecf15e3a1a66aa8da55f0c`;
- correction report recorded `stopped: null`, one getter, one template MOCK call, and two transport calls;
- operator cleanup again left no listener on `127.0.0.1:11435`.

The original failed report and ledger remain unchanged. The original second case was not resumed, so this result demonstrates only the corrected confirmed MOCK-template path. It does not establish the unrun local-template 32.5-hour/leap-day variant or broad model accuracy. No further P9A inference is authorized. The later P9B library and host-only visible status prefix made no inference and are documented separately.
