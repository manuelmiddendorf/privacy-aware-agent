# P7B development comparison result

Date: 2026-10-25  
Decision: failed development gate; no holdout run, prompt selection, real-model UI wiring, retry, or additional inference.

## Frozen inputs

- P7 22-file mechanical candidate: `4f848263aa4bf03558da4efee7e284e9a1ac623455ab85b636d620988ad67152`
- P7 runner and guarded-start candidate: `79f7e4939e3641697fd0bb05422491a1064334de916be9b1a17e44e2ebf1467a`
- Prompt A: `aecd1de45873952ab932c7591de9cf40b416277ae161b7b52159d38d2199012e`
- Prompt B: `086f03498699736663a2f5c0874bcf7e2d6ebe41893eb1b3441adab9d9d4adca`
- P6 core: `754391021dfa974659c4903367f9b8b2fd8c9c2690238e87c100cc0019b9af9d`
- P6 adapter: `d6ef85281731b73b79393b615943563956a5b7ddd1906cb6da8494796d164401`
- Runtime: Ollama 0.40.4, `OLLAMA_NO_CLOUD=1`, loopback `127.0.0.1:11435`
- Model: `qwen3:4b-instruct-2507-q4_K_M`, manifest `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`

The guarded preflight verified the archived runtime, binary, registry manifest, six cached model files, exact existing identity-file metadata, read-only identity sandbox, context setting, loopback listener, version, tag, and manifest. It did not read or hash identity-file contents. No download, alias change, cloud call, OpenAI call, or external provider call occurred.

## Counted execution

The one-time development claim was persisted before the first POST. The run used 10 local POSTs: five proposals for A and five for B. No generation call occurred. The hard campaign ledger remains at 10 of 40 and the development claim remains set, so the comparison cannot be repeated automatically or by using a new report name.

| Case | Expected | A | B | Source/host boundary |
| --- | --- | --- | --- | --- |
| P7-01 | understand | unsupported; 1 proposal | invalid proposal schema; 1 proposal | one authorized source read each |
| P7-02 | understand | unsupported; 1 proposal | invalid proposal schema; 1 proposal | one authorized source read each |
| P7-05 | compose | unsupported; 1 proposal | invalid proposal schema; 1 proposal | one authorized source read each |
| P7-06 | compose | unsupported; 1 proposal | unsupported; 1 proposal | no document and no source read |
| P7-09 | clarify | unsupported; 1 proposal | unsupported; 1 proposal | no document and no source read |
| P7-11 | deny before read | source denied; 0 POST | source denied; 0 POST | 0 source reads and 0 POSTs for both |

Both configurations therefore achieved 0 of 4 positive development cases and 0 of 1 clarification case. The critical source-rights denial passed for both configurations before content access and before model transport. No host authorization, source, action, persistence, citation-membership, or external-network boundary was observed to be bypassed. A safely rejected malformed or unsupported model reply is a model-utility failure, not a host-boundary violation.

Because there was no accepted positive route, no generation text was produced. Citation quality, factual usefulness, draft quality, and no-action wording therefore received no real-model evidence in this run. Even four perfect positive holdout results would produce only 4 of 8 positives overall, below the preregistered 7-of-8 acceptance threshold. The private holdouts must remain unopened.

## Evidence and limits

The protected local report is `.local/p7/development-2026-10-24T23-32-18-592Z.json`, mode 0600, 10,502 bytes, SHA-256 `901d2d61d574581e513f118584dc7c063b7a3f71dad594a9dad86b04cb4aaa07`. The protected call ledger is `.local/p7/call-budget.json`, mode 0600, 2,189 bytes, SHA-256 `44c4c2226566c28308aa6094b12e27df76bfd496429ab2b852e10e8cd59b75d2`.

The report preserves every validated lane result, criterion, call count, and source-read count. It does not preserve the raw model proposal JSON behind A's `unsupported` decisions or B's rejected schemas. Those raw proposals cannot be reconstructed and must not be invented. The one-time claim deliberately prevents rerunning the comparison to fill that evidence gap.

The fixture-to-model mapping has only been checked offline from the runner source and injected-transport tests: each case request becomes `requestText`, selected document paragraphs become the bounded document snapshot, and the denied source stops before its accessor. This is not evidence of why the model chose or formatted its replies. No causal explanation is claimed without raw proposal evidence.

## Result

Neither prompt configuration qualifies for selection. P7 does not establish that these skills are ready with the pinned real local model. The UI remains `LOCAL_TEST_DOUBLE`; real-model UI wiring and the held-out evaluation are stopped. The local model service was shut down immediately after the run and the loopback listener was absent afterward.
