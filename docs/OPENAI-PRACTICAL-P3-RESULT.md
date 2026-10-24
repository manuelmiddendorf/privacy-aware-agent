# OpenAI practical P3 live result

Date: 2026-10-24

## Execution status

The separately reviewed run `paa-practical-p3-2026-10-24-v1` was executed exactly once with the fixed P01–P03 synthetic scenarios. It made three sequential provider calls and no probes, retries, fallback calls, or additional requests. The completed ledger must not be deleted, reset, edited, or rerun.

No private or production data was used. The local key remained in the protected server-side loader and was not printed. This report contains only the permitted synthetic outputs and bounded operational measurements.

## Per-case evidence

### P01 / L1

- Result: allowed, `SAFE_GENERIC`, one provider call.
- End-to-end latency: 2877.63 ms.
- Output: “After creating the agenda, link the relevant documents. The final step is to send the invitation.”
- Citation: only `meeting-preparation`.
- Usage: 235 input, 41 output, 0 reasoning tokens.
- Calculated cost: USD 0.000044.
- Manual assessment: correct and complete against the preregistered P1 criteria. It identifies the step after the agenda, gives the final step, cites only the approved page, and invents no deadline.

### P02 / L2

- Result: allowed, `SAFE_GENERIC`, one provider call.
- End-to-end latency: 1597.61 ms.
- Output: “Don’t forget to bring your reusable cups to our community picnic at [Location] on [Date]! We’re looking forward to a fun day together—see you there.”
- Citations: none.
- Usage: 189 input, 52 output, 0 reasoning tokens.
- Calculated cost: USD 0.0000449.
- Manual assessment: correct and complete against the preregistered P1 criteria. It is a warm two-sentence reminder, retains both placeholders, makes no sending claim, and adds no citation.

### P03 / L3

- Result: allowed, `SAFE_GENERIC`, one provider call.
- End-to-end latency: 1633.39 ms.
- Output: “- Arrange the chairs before the workshop and return them afterwards.\n- Place reusable cups near the entrance.”
- Citations: none.
- Usage: 187 input, 39 output, 0 reasoning tokens.
- Calculated cost: USD 0.0000382.
- Manual assessment: correct and complete against the preregistered P1 criteria. It uses exactly two bullets and preserves all three requested actions. “Return them afterwards” unambiguously refers to the chairs.
- Indicator limit: the literal `returnChairs` regex reported `false` because it looked for the repeated noun “chairs”. This is a correct paraphrase, so the indicator result is not treated as a content failure. No prompt adjustment or second run was made.

## Aggregate accounting

- P3 calls: 3 provider calls and 3 transport calls.
- P3 usage: 611 input, 132 output, 0 reasoning tokens.
- P3 measured latency: 6108.63 ms summed across the three end-to-end case measurements.
- P3 calculated actual cost: USD 0.0001271.
- Prior calculated actual cost: USD 0.0001069.
- Cumulative calculated actual cost: USD 0.000234.
- Prior conservative reservation: USD 0.4202816.
- P3 conservative reservation: USD 0.6304224.
- Cumulative reserved exposure: USD 1.050704 of the existing USD 5 ceiling.

The reservation remains deliberately conservative and is not refunded from measured usage. These figures do not authorize another call.

## Conclusion and limits

All three preregistered synthetic cases passed manual review. The run confirms this narrow configuration only. It does not establish general semantic accuracy, privacy detection, prompt-injection resistance, production suitability, or authorization for UI, Amsel integration, deployment, publication, tags, releases, or another live run. P4 requires a separate review and gate.
