# P8 remaining-path evidence result

Date: 2026-10-25
Status: stopped after the first bound action; no retry, no resume, no research action, no UI wiring.

## Bound execution

Independent review accepted the neutral-person host correction, source core, private helper, and readiness file, then issued a separate start gate for exactly two remaining normal user actions. The runner rebuilt from the reviewed source, passed the model-free preflight with zero POSTs, started the pinned runtime separately, verified the exact loopback listener PID, and atomically consumed the remaining-path claim against the raw 15-reservation ledger.

- Protocol SHA-256: `a7ea3adee40c2b38024f2819acd95012763b9a67c75326b10688d7f9f34734ff`
- Reviewed source core SHA-256: `3b1c14a5b1fea75d73fb58d7bf367fd53bd9402ab3acac3b5655254798b3c261`
- Private helper SHA-256: `111c0b138c4bcfa977ceb355219c0c2d5784e19983af366ec69f2a5a9d6228cb`
- Protected report SHA-256: `498988cfbbc65ce8e4b5a37053043d72625b8afded3ade9665cb60962c35d035`
- Final ledger SHA-256: `3c08a5874a94ed63c3c2773b807e314641e97df37e886cf788e2c717f439a003`

The report and ledger are mode `0600`. The runtime was stopped immediately after the runner returned, and no process remained listening on `127.0.0.1:11435`.

## Observed action

The run began with 15 preserved reservations and ended with 17. It used only:

1. `WF02_EXPLICIT_CONFIRMED_ACTION` understand;
2. `WF02_EXPLICIT_CONFIRMED_ACTION` draft.

The request was a new, complete, explicitly confirmed action with a fresh authority, session, and task. It did not reuse the earlier model proposal as authority. The plan matched the authorized synthetic person, 25 weekly hours, the confirmed effective date, no research, and closed source fields. The getter ran exactly once; no mock research ran. The resulting cited, non-binding draft changed 20 to 25 weekly hours, expressed the confirmed date as `01. September 2031`, and retained all other contract terms.

The public workflow accepted the result as a valid draft. The private evidence helper nevertheless stopped because its additional mechanical acceptance predicate recognized only the numeric date forms `2031-09-01` and `01.09.2031` and required the exact substring `andere Vertragsbestimmungen bleiben unverändert`; the draft used the equivalent human-readable date and `Alle anderen Vertragsbestimmungen bleiben unverändert`. Under the reviewed first-mismatch rule this helper mismatch ended the run permanently.

Independent manual review subsequently confirmed that this was a helper false negative: the draft does contain the grounded 20-to-25-hour change, the equivalent confirmed effective date, the unchanged remaining contract terms, and both required paragraph citations. This manual finding does not alter the stopped run or authorize a replay.

The draft also retained the previously observed quality boundary: its review notes contain broad legal caveats that need human editing and are not evidence of current legal research or correctness.

## Unexecuted path and conclusion

`WF03_COMPLETE_MOCK_RESEARCH` was not started, so no mock request or research-grounded draft was produced. No probe, retry, resume, reset, or further workflow action occurred.

The result provides evidence that an explicitly confirmed new action can pass fresh authorization, read only its closed fields, and produce a grounded non-binding draft. It does not complete the two-action evidence plan, validate the offline mock research path, repair the failed original clarification validation, or establish UI or production readiness. Any further action requires a newly reviewed scope and explicit gate.
