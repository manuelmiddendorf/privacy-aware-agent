# P8 field-set correction development result

Date: 2026-10-25
Status: stopped after the second case's first clarification; no retry, no follow-up, no remaining case, no UI wiring.

## Bound run

Independent review accepted the corrected core and issued a separate one-run start gate. The runner then rebuilt from the frozen source, passed the model-free correction preflight with zero POSTs, started the pinned runtime as its own process, verified the exact loopback listener PID, and atomically consumed the separate correction claim.

- Corrected core SHA-256: `966a953ef8a00e2a0fd4acca2772e924e94fb49c5acece5452ca263dbd4d8ce0`
- Corrected support SHA-256: `760c6e4eb25e6120a2ec583fa4aa9f086fa9ca0d959fdca21f1994bcf9ffae8c`
- Correction protocol SHA-256: `65e5a8e5bf045fb8cc6c0b7fa5146316dcecbcdeabceb5f83433b646854d6c63`
- Fixed fixture SHA-256: `84d126eb3ae5ea0132c59ae64fd894280b0a081a52441ada89c5afc381ded264`
- Protected correction report SHA-256: `640d4c5b86915f44d10dbde39fcdba4a40e37c9c71566c788ac5f595f4a67bd2`
- Final ledger SHA-256: `e6e42cc9a800833dd4f99471fe7843cd3f6d75cd0a03f196dcccc612cc827771`

The report and ledger are mode `0600`. The runtime was stopped immediately after the runner returned, and no process remained listening on `127.0.0.1:11435`.

## Results

The run began with 12 preserved reservations and ended with 15. It used three new POSTs rather than the authorized maximum of seven:

1. `WF01_COMPLETE_LOCAL` understand;
2. `WF01_COMPLETE_LOCAL` draft;
3. `WF02_MISSING_THEN_CONFIRMED` understand.

`WF01_COMPLETE_LOCAL` succeeded through the full host workflow. The duplicate known source field was normalized after exact authorization; the field-scoped getter ran once, no mock research ran, and the model returned a cited, explicitly non-binding draft that preserved the change from 20 to 25 weekly hours, the confirmed date, and the unchanged remaining terms. The draft is substantively useful, but contains more meta and review text than a finished user-facing contract draft should. This confirms that the narrow field-set correction addresses the original schema stop without opening additional fields; it does not establish production-ready output quality.

`WF02_MISSING_THEN_CONFIRMED` returned a valid clarification result, made no source read and no research call, but its first question did not exactly match the preregistered question. Although the user request did not name a person, the model proposed the only known authorized synthetic person and the host asked the user to confirm that proposal instead of asking the preregistered open person question. The strict follow-up gate therefore suppressed the confirmed follow-up and stopped the run. This is a usefulness and preregistration mismatch, not an unauthorized foreign-data read: the proposed person was inside the closed authorized list, and the host read no contract data.

`WF03_COMPLETE_MOCK_RESEARCH` was not run. No attempt was replayed or retried.

## Conclusion

The field-set bug is corrected on the observed complete local path, and the fail-closed clarification gate worked as designed. The complete three-case usefulness validation did not pass, because the second case inferred a known authorized person and therefore differed from the exact preregistered open clarification. This result neither demonstrates an unauthorized data access nor establishes general model incapability. The WF02 follow-up draft and all of WF03 remain untested. This result does not authorize UI integration, a holdout, cloud use, publication, or another workflow attempt. Any further change or model run requires a new independently reviewed scope and explicit gate.
