# P8 working-time workflow development result

Date: 2026-10-25
Outcome: stopped fail-closed in WF01 after one local model POST; no retry and no usefulness acceptance.

## Bound candidate

- Core: `0e081d98d7cee178317d42add983f2bf403971d7fda38620cbf0f652ea08999a`
- Readiness support: `de30cdb06ec6ba7f2d4aebd3171d3c12b5a696c80f77b24595a289876162194b`
- Cases: `84d126eb3ae5ea0132c59ae64fd894280b0a081a52441ada89c5afc381ded264`
- Prompt: `55dce156b0ce725c54d491f7eba8efb83e1c1b140dcd2411d00d48545506e4ce`
- Protocol: `d721b00c0334c8cdc7bd85ee98aee4bc0bdb734e0159405c2f83fcdc9fccb9fe`

The fresh Node.js 20 build and model-free preflight passed before runtime start. The pinned runtime ran as a separate process. Sandbox, runtime, manifest, executable PID, and the listener on `127.0.0.1:11435` were confirmed before the one-use claim. There was no inference probe or warmup.

## Actual run

The durable P8 claim was written against the preserved eleven-call history. WF01 reserved ordinal 12 before the local transport and made one `understand` POST. The actual bounded synthetic request used the pinned Qwen model, `think: false`, temperature 0, seed 41, 16,384 context tokens, 256 output tokens, the closed JSON schema, the fixed P8 system prompt, the synthetic request, and only the authorized synthetic person label.

The model returned:

```json
{
  "effectiveDate": "2031-09-01",
  "personId": "person-lina",
  "requiredSourceFields": [
    "contract_paragraphs",
    "display_name",
    "contract_paragraphs"
  ],
  "researchRequested": false,
  "schemaVersion": 1,
  "targetWeeklyHours": 25,
  "task": "employment_contract_change"
}
```

The repeated `contract_paragraphs` violates the closed unique field-list contract. Host validation returned `MODEL_SCHEMA` before any source getter, mock research, or drafting call. The runner stopped immediately. It did not run a confirmed follow-up, WF02, or WF03.

## Evidence and counters

- Protected local report: `.local/p8/workflow-development-2026-10-25T00-21-11-069Z.json`
- Report SHA-256: `fcdb0e869bf7689ce823bebdf9af9436a0052318be04269383538c2a074ce255`
- Report mode: `0600`
- Reserved posts: 11 to 12
- Run posts: 1
- Source reads: 0
- Mock calls: 0
- Draft calls: 0
- Follow-up calls: 0
- Ledger SHA-256 after the run: `5aee7da562b7143d1bf01f2f5876e5941d60d0a69963f6ca67d0e4d62ab3bc76`
- P8 workflow claim: consumed and single-use

The runtime was stopped immediately after the result and no listener remains on the model port. The recorded request body and closed output are synthetic benchmark evidence; no application traffic, real personnel data, credentials, or chain of thought were stored.

This is a model-schema failure in a correctly ready local runtime, unlike the earlier P7 startup race. It does not establish workflow usefulness. The candidate and failure must remain available for independent review. No rerun, prompt change, relaxed validation, UI connection, holdout, commit, push, or publication is authorized by this result.
