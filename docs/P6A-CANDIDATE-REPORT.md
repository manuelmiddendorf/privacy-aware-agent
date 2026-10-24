# P6A synthetic implementation candidate

Date: 2026-10-24

Status: core candidate independently accepted. The pinned local runtime and model were subsequently installed and verified as documented in `P6-RUNTIME-PREPARATION.md`. No OpenAI API, key, ledger, private source, or Amsel system was accessed.

## Frozen candidate source hash

Current corrected candidate:

`754391021dfa974659c4903367f9b8b2fd8c9c2690238e87c100cc0019b9af9d`

The independently reviewed earlier candidates remain recorded as:

- first holdout candidate: `3422b377a55b47bf176a7604434d4bc075c4f85046827858840066cac5e252c3`
- first mechanical-fix candidate: `1d57b96cd1dca2f42c08f7a7c2518cda70381947488eb4fcdcbde46fd4e637a5`

This is SHA-256 over the ordered concatenation of each UTF-8 path, a NUL byte, and the exact file bytes:

1. `src/index.ts`
2. `src/localResearchAuthority.ts`
3. `src/localResearchLane.ts`
4. `src/localResearchTypes.ts`
5. `src/scopeBoundIdentifierRegister.ts`
6. `tests/localResearchLane.test.ts`
7. `tests/scopeBoundIdentifierRegister.test.ts`

Any change to those files invalidates the current hash. The withheld cases were first executed independently against the first hash; their original evidence remains in mode-0600 files `/private/tmp/paa-p6-review-3422-first.json` and `/private/tmp/paa-p6-review-3422-deltas.json`. This implementation did not read those files.

## Corrections after the independent first run

1. An exact registered identifier can no longer hide another unresolved short alias, fuzzy person, unknown email, or other direct identifier. Exact ranges are recorded and masked, the remaining text is scanned again, and unresolved matches take precedence unless they cover the same span as the exact match.
2. Request validation now returns a private plain-data snapshot including a copied source-ID list. Caller mutation while the local model is pending cannot change the checked organization, text, or sources later returned or used.
3. The authority deep-copies source organizations and identifier records at construction. External object mutation cannot change authorization state; only explicit session-switch and revocation methods advance the authorization epoch.
4. Exact person matching now accepts only whitespace and defined name punctuation between registered tokens. It cannot jump over and mask an inserted phone number or other foreign span. `Talea +49 30 12345678 Fantasie` is a negative regression and makes zero local-model and mock calls.

The independent first run also found that one health paraphrase (Q11) and one unsupported input language (Q13) reached the generalizing test double and mock once. Those are retained as original suitability failures; they are not relabeled as passes and were not patched with case-specific regex words. Q12 remained 0/0, all five Q15 schema variants made zero mock calls, Q16 established explicit caller cancellation only, and Q14 was not tested because this narrow candidate has no source-body seam.

The guaranteed contract is deliberately smaller than the desired empirical suitability: authorization and generation freshness, closed enums, a deterministic outgoing sentence containing no original text or registered identifiers, and `MOCK_OFFLINE` only. `request.language` means requested output language; it does not prove the input language. Whether the advisory model usefully recognizes arbitrary health meaning or unsupported language is an empirical model result, not a deterministic privacy guarantee. No second universal classifier is claimed or introduced.

## Known development fixtures

| Case | Candidate result | Local model calls | Mock calls | Outbound privacy result |
| --- | --- | ---: | ---: | --- |
| Q01 exact name | fixed generalization | 1 | 1 | exact fixed sentence only |
| Q02 exact email and address | fixed generalization | 1 | 1 | email, address and numbers absent |
| Q03 NFKC exact name | fixed generalization | 1 | 1 | exact fixed sentence only |
| Q04 unique one-edit candidate | uncertain, blocked | 0 | 0 | no outbound data |
| Q05 one edit from two people | ambiguous, blocked | 0 | 0 | no outbound data |
| Q06 general request | fixed generalization | 1 | 1 | no short-alias substring match |
| Q07 contextual short alias | uncertain, blocked | 0 | 0 | no outbound data |
| Q08 foreign source | source denied | 0 | 0 | zero register-content reads |
| Q09 A-to-B switch while held | stale generation, blocked | 1 | 0 | no result displayed |
| Q10 revoked rights and A-to-B-to-A | stale generation, blocked | 1 | 0 | no result displayed |

The current regex-only baseline remains separately recorded in `P6-REGEX-BASELINE.json`. The candidate does not modify that classifier or relax the existing external-agent path. Health, child, unregistered detected names, and unregistered direct identifiers were also verified to stop before the local adapter.

## Verification

- Fresh TypeScript 5.9.3 compilation with Node 20.20.1 into `/tmp/paa-p6a-build`: passed.
- Corrected research-lane, identifier-register, existing privacy-gate, and existing orchestrator tests: 38 passed, 0 failed.
- Runtime pin JSON parsing and wrapper shell syntax: passed.
- Wrapper missing-runtime path: exited 64 before home resolution or process start, as designed.
- `git diff --check`: passed.

The separate Ollama adapter is outside the frozen seven-file core hash. Its reviewed candidate hash is `d6ef85281731b73b79393b615943563956a5b7ddd1906cb6da8494796d164401`, calculated over path, NUL, and bytes for `src/ollamaResearchAdapter.ts` followed by `tests/ollamaResearchAdapter.test.ts`. A fresh Node 20.20.1 compilation and nine adapter tests passed. They cover fixed loopback/model/schema settings, explicit enablement and manifest verification, input and byte caps, timeout and caller cancellation, no retries, strict complete-response envelope checks, synchronous transport failure cleanup, non-blocking stream cancellation, and immutable input snapshotting.

The standard macOS `sandbox-exec` profile could not be nested inside the current already-managed execution environment (`sandbox_apply: Operation not permitted`, exit 71). The coordinator therefore verified the profile outside that nested layer and later accepted the corrected canonical-path test. The authorized real first start then succeeded under the same profile with exactly the two permitted identity files, cloud disabled, and a loopback-only listener. There was no unguarded fallback.

## Limits

This evidence covers a small synthetic contract and known fixtures. It does not prove universal identifier detection, privacy safety, model quality, or general network isolation. The later independent frozen-model run is reported separately in `P6-LOCAL-MODEL-RESULT.md`; it accepted the transport path but rejected the model's research utility because all reached cases stopped.
