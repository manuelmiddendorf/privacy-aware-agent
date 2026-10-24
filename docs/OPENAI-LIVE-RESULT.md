# OpenAI live-demo result

Date: 2026-10-24

## Gate and scope

The fixed live runner was executed once after local validation, independent review, and a separate human authorization. It used only the four synthetic demo scenarios and the reviewed fixed contract from [OPENAI-LIVE-PREFLIGHT.md](OPENAI-LIVE-PREFLIGHT.md). There were no retries, probes, model fallbacks, tools, files, actions, private payloads, or additional runs.

The protected local key was read only by the runner into process memory. It was not printed, passed in an argument, copied into this report, or manually inspected.

## Result

- Scenario A: allowed, one transport request. It returned the expected concise board-meeting preparation steps and cited only `meeting-preparation`.
- Scenario B: allowed, one transport request. It returned a usable general gardening-day invitation and no citations, as required for a source-free draft.
- Scenario C: blocked as `BLOCK_HEALTH_DATA` before transport, zero requests.
- Scenario D: blocked as `BLOCK_EVIDENCE_INSUFFICIENT` before transport, zero requests.
- Total provider/transport requests: two, sequentially.
- Retries and fallback calls: zero.

The complete command took 5.73 seconds wall-clock time, including the TypeScript build and both requests. Per-request latency was not instrumented, so it cannot be reported separately.

## Usage and calculated cost

| Scenario | Input tokens | Output tokens | Reasoning tokens | Calculated Standard cost |
| --- | ---: | ---: | ---: | ---: |
| A | 224 | 53 | 0 | USD 0.0000489 |
| B | 180 | 80 | 0 | USD 0.0000580 |
| Total | 404 | 133 | 0 | USD 0.0001069 |

The persistent ledger retained the conservative USD 0.4202816 reservation for the two-request maximum and recorded both entries as confirmed. Although the ledger snapshot was not halted, the fixed maximum of two entries prevents another request without changing or resetting state. The recorded calculation uses the published Standard token rates; actual account billing should be verified in the provider dashboard if needed.

## Boundaries

This run confirms the narrow transport contract and the A–D control flow with synthetic inputs. It does not establish general answer quality, broad privacy detection, production readiness, Zero Data Retention, EU-only processing, legal compliance, or exact-once network delivery. `store: false` remains a request setting, not a complete data-governance assurance.

No commit, push, tag, release, deployment, Amsel change, or production action was performed.
