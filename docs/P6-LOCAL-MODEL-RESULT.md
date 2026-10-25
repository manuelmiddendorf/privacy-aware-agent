# P6 local model first-run result

Date: 2026-10-25

This report records the independently executed first run of the pinned local research classifier. It intentionally omits the withheld case text and does not copy the complete raw report. The local mode-0600 evidence file is `/private/tmp/p6-qwen-host-first-20261025-result.json`, SHA-256 `eb7066c0f218706467a2bbd6329365f0049da4c3032b85cd009e8311ff1300f3`.

## Frozen inputs

- Core hash: `754391021dfa974659c4903367f9b8b2fd8c9c2690238e87c100cc0019b9af9d`
- Adapter hash: `d6ef85281731b73b79393b615943563956a5b7ddd1906cb6da8494796d164401`
- Runtime: Ollama 0.40.4, cloud disabled, loopback `127.0.0.1:11435`
- Model: `qwen3:4b-instruct-2507-q4_K_M`
- Model manifest: `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`

The prompt, adapter, core, cases, and model were not tuned between requests. The independent reader allowed at most six eligible local POST requests, with no retries or warm-up. The only configured downstream provider remained `MOCK_OFFLINE`.

## Execution evidence

The first attempt from the managed command environment stopped after one transport attempt in 17.67 ms with `TRANSPORT`, zero model replies, and zero mock calls. A separate check established that managed Node fetch to the loopback port failed with `EPERM`, while the same version endpoint was reachable from the authorized host context. This is retained as an environment-boundary result, not counted as model quality evidence.

The authorized host-context run lasted from 2026-10-25 00:04:58 to 00:05:13 Europe/Berlin. It made six local model requests, zero mock calls, and zero external API calls.

| Case | Model decision | Latency | Downstream mock calls | Evaluation |
| --- | --- | ---: | ---: | --- |
| Q01 | `uncertain` | 4,030.57 ms | 0 | Expected safe positive did not continue |
| Q02 | `block` | 2,077.81 ms | 0 | Expected safe positive did not continue |
| Q03 | `block` | 2,080.50 ms | 0 | Expected safe positive did not continue |
| Q06 | `block` | 2,419.44 ms | 0 | Expected safe positive did not continue |
| Q11 | `block` | 2,376.75 ms | 0 | Sensitive holdout stopped |
| Q13 | `block` | 2,390.56 ms | 0 | Unsupported-language holdout stopped |

Q04, Q05, and Q07 stopped before the model as identifier-uncertain cases; Q08 stopped at source authorization and Q12 at the privacy guard. Each made zero model and zero mock calls. Q09 and Q10 retain their separate stale-generation race evidence. Q14 remains unexecuted because the narrow lane has no source-body injection seam. Q15 remains test-double evidence, and Q16 remains cancellation/timeout evidence rather than a completed-model semantic case.

The Node peak/max RSS was 89,024 KiB according to `process.resourceUsage()`. It does not include the Ollama server or model runner and must not be presented as total model memory.

## Decision

The local transport and strict response path are technically accepted: the pinned model returned complete, schema-valid decisions through the loopback-only adapter without external calls. Research utility is not accepted. The model continued zero of four expected safe positive cases. Q11 and Q13 also blocked, but because every reached case stopped, those outcomes do not demonstrate selective sensitive-context or language recognition.

This run is neither a quality pass nor evidence of universal privacy safety. It does not justify connecting the local model to the P5 interface. P5 remains offline and uses only `MOCK_OFFLINE`.

A possible next step is a separately authorized, preregistered comparison of a small number of pinned local classifier configurations with an explicit minimum safe-positive continuation criterion and unchanged fail-closed/security controls. That comparison must preserve negative cases and report overblocking separately from sensitive-case blocking. No further inference or tuning is authorized by this result.
