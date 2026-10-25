# P8 local UI smoke result

Date: 2026-10-25
Outcome: the single reviewed synthetic clarification-to-draft browser path completed; no retry, warmup, probe, external call, persistence, send action, or fourth model POST occurred.

## Bound source and operation

The real browser smoke ran against UI candidate SHA-256 `8291c449c12eea88197f4ee2186243cc1850ebe92d12e835d6999b8e68cc7b7c`, runtime-support SHA-256 `a126328f2010c84614435acd3106a60ec927b2ead3716802f8f7fa1399018432`, and private helper SHA-256 `148680f897a1c08ba0240a53ab9c06f00beccd9d66e96ee46cf5951803a0f68c`. An independently created mode-`0600` start gate bound those hashes, the exact 19-reservation starting ledger, and the four-POST hard ceiling.

The old loopback UI process was first verified by PID, command, Node executable, working directory, and listener ownership, then stopped. The pinned local runtime was started separately and passed the full sandbox, executable, model-manifest, PID, and listener readiness check. Startup consumed zero model calls.

The browser then performed exactly this one sequence:

1. A free synthetic request with no person, hours, date, or research choice made one `understand` POST.
2. The UI returned a neutral clarification. Person, hours, and date remained unset; four questions requested the missing person, weekly hours, effective date, and research choice. No source data had been assumed or read.
3. The user explicitly selected `Lina Mustervertrag`, entered 25 weekly hours and `2031-09-01`, chose no general reference, and confirmed those values for the current text and revision. Native browser validity for 25 hours was true.
4. The separately submitted confirmed action made one further `understand` POST and one `draft` POST. It returned a cited, explicitly non-binding draft without mock research.

The durable ledger ended at 22 reservations. Its three and only three `ui-smoke` entries are ordinals 20, 21, and 22 with stages `understand`, `understand`, and `draft`. Final ledger SHA-256 is `587620cab9b67114f77b983086140e058870a972f918db8abb9cf5140c4206c0`.

Both the UI and model runtime stopped cleanly. Ports `127.0.0.1:4317` and `127.0.0.1:11435` had no listener afterward, and the one-run lock was absent. No additional serve or model run is authorized by this result.

## Observed output and browser behavior

The rendered draft stated, in substance:

1. the existing synthetic weekly working time is 20 hours, citing `contract-lina:p01`;
2. the proposed new weekly working time is 25 hours;
3. the change applies from `01.09.2031`;
4. the other contractual provisions remain unchanged, citing `contract-lina:p02`.

The output also displayed `contract-lina:p01` and `contract-lina:p02` in the separate citation list, kept gaps and unverified model notes separate, and showed no mock-research label. The text was editable. At a 390 CSS-pixel viewport, the document width remained 390 pixels; manually added draft text stayed in place and focus remained in the draft. The protected screenshot is outside Git at `/private/tmp/P8-ui-smoke-mobile.jpg`, mode `0600`, SHA-256 `c8f2fa541288a8fcfeaa093493d715496cfcc377ed980c4fa51b73b616a06111`.

## Limits and post-smoke correction

This result is not a complete pass of the original P8 preregistration. It covers only the one synthetic UI path above. It establishes neither legal quality nor a production-ready personnel workflow. The draft contained additional evaluative/meta wording, including a source-field-style `effectiveDate` reference, and the review notes repeated some cautionary language. Those are output-quality limits, not accepted legal text.

The successful screen initially retained the old clarification box under “Bitte noch bestätigen”. After the smoke, the UI was changed to clear and hide that obsolete question block when a draft is shown, and to show it again for a later clarification. No new model call was made. The targeted UI HTTP/source suite passed 9 of 9 tests, and TypeScript typecheck and the temporary build passed. The resulting post-smoke source SHA-256 is `99ab359b339682f7eaa9e7fadea25de11c867cb7b1cf8689738fd257d0c121e5`; it has not been rerun against the model.

The person, hours, date, research, request, and draft controls all have matching HTML `label for` and control `id` values. One browser automation label query returned no match for the dynamically revealed person select even though its accessibility name was present and ID-based interaction worked. This is not enough evidence of an accessibility defect; it remains a focused browser-tool compatibility question.

The default `startLocalUiServer()` path continues to inject no real working-time model. Running the ordinary local UI therefore cannot repeat this smoke or consume model calls. No commit, push, release, deployment, or Amsel-App change was made.
