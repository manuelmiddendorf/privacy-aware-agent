# P9B reduced-clause prototype result

Date: 2026-10-25
Status: isolated model-free candidate implemented; default disabled; independent review pending.

## Implemented boundary

`src/reducedClauseExcerptPrototype.ts` is a library-only prototype. Nothing imports it from the active P9A workflow, HTTP server, or browser UI. Its trusted-host configuration defaults to `enabled: false`; in that state a request performs zero source getter and zero transport calls.

When explicitly enabled only in a synthetic test fixture, the host first checks organization, actor, session, task, source, authorization version, and the single field right `reduced_clause_structure`. Only then may the getter return this exact structure class: weekly-working-time change, structure version 1, and the five known placeholder field names in fixed order. The library rejects extra keys or unknown shapes. This means an original name, concrete date, pay, health information, rare combination, or extra clause text blocks locally. This narrow proof is not anonymization and is not a general detector for personal data.

The visible outgoing text is exact and placeholder-only:

```text
Reduzierter synthetischer Klauselauszug
Klauselart: Änderung der Wochenarbeitszeit
Person: {{EMPLOYEE_NAME}}
Bisherige Wochenstunden: {{CURRENT_WEEKLY_HOURS}}
Neue Wochenstunden: {{NEW_WEEKLY_HOURS}}
Wirksam ab: {{EFFECTIVE_DATE}}
Übrige Vertragsbestimmungen: {{UNCHANGED_TERMS_STATUS}}
Hinweis: Allgemeine Strukturprüfung
```

The only safe edit is replacing the first heading with `Synthetische Arbeitszeitklausel`; the rest of the text must remain byte-for-byte equal. Only immutable preview objects issued by the same prototype instance are accepted. Every edit attempt consumes the prior preview; a safe edit produces a new generation, revision, and payload hash. Keeping the result local consumes the preview and does not call the mock. The confirmation binds the visible payload SHA-256, revision, organization, actor, session, task, source, authorization version, authority epoch, and request generation. The prototype rebuilds and compares the complete expected payload, reruns current rights, the central privacy scan, and the 1,024-byte limit, then consumes the confirmation before its one mock call. Fabricated previews, extended payloads, repeats, and concurrent second confirmations make no transport call.

The exact mock request is:

```json
{
  "schemaVersion": 1,
  "purpose": "GENERIC_CLAUSE_STRUCTURE_REVIEW",
  "language": "de",
  "text": "Reduzierter synthetischer Klauselauszug\nKlauselart: Änderung der Wochenarbeitszeit\nPerson: {{EMPLOYEE_NAME}}\nBisherige Wochenstunden: {{CURRENT_WEEKLY_HOURS}}\nNeue Wochenstunden: {{NEW_WEEKLY_HOURS}}\nWirksam ab: {{EFFECTIVE_DATE}}\nÜbrige Vertragsbestimmungen: {{UNCHANGED_TERMS_STATUS}}\nHinweis: Allgemeine Strukturprüfung",
  "provenance": {
    "provider": "MOCK_OFFLINE",
    "sourceKind": "HOST_MINIMIZED_SYNTHETIC_CLAUSE"
  }
}
```

The only accepted mock answer is:

```json
{"schemaVersion":1,"decision":"accepted_structure","notes":["Synthetische Struktur akzeptiert."]}
```

No original request, complete document, private metadata, source ID, or history is present in either object. There is no external URL, key path, real API, model inference, persistence, action, retry, or UI activation.

## Preserved P9A evidence and mechanical status prefix

The accepted P9A correction evidence remains unchanged. Its actual synthetic input confirmed Lina Mustervertrag, current 20 and target 25 hours, effective date 2031-09-01, the generic MOCK template, and no general research. The exact template MOCK request remains the fixed `generic_amendment_template` request recorded in `docs/P9A-DEVELOPMENT-RESULT.md`. The exact template answer was the closed `SYNTHETIC_WORKING_TIME_AMENDMENT_V1` object with five sections, five placeholders, and `MOCK_OFFLINE` provenance.

The local model's closed merge proposal contained current 20, target 25, date 2031-09-01, unchanged terms `true`, citations `contract-lina:p01` and `contract-lina:p02`, no conflicts, and no open points. Host validation then rendered the agreement and kept employer, pay, and possible consequences open. P9B did not rerun this evidence. A mechanical host-only presentation change now makes the copied text begin:

```text
Unverbindlicher, ungeprüfter synthetischer Entwurf

Änderungsvereinbarung zur Wochenarbeitszeit
```

The previously recorded failed first P9A run remains failed and unchanged. Its two-call report and ledger hashes remain in `docs/P9A-DEVELOPMENT-RESULT.md`. The separate two-call corrected run remains the only passed empirical P9A case. Aggregate P9 calls remain four; no P9B or post-prefix inference was made.

## Source-scope manifest

The manifest is SHA-256 over the exact four-line `shasum -a 256` output below, including its paths and newline endings:

`5bb1f4062bdda71489749f77c891bee3288e35df2e358d1fac48b8be89b90f69`

| File | SHA-256 |
| --- | --- |
| `src/reducedClauseExcerptPrototype.ts` | `571c6a98141405e20cde2f317416d840d732c7045ecdef7383e15a730b536245` |
| `tests/reducedClauseExcerptPrototype.test.ts` | `8b2b77e538d84d00e0bf8295b32350d67750f0415db99a1d056b774b3d7b4d3a` |
| `src/workingTimeContractWorkflow.ts` | `ba88a7d754ff491aedecc653d915a1d10302bd24b5a00a0a1412a70dbdd26955` |
| `tests/workingTimeContractWorkflow.test.ts` | `f1184e300bfe008337715f23e5a7805b66d5b42461382eb5d352d678cb6170ef` |

## Verification

- Node 20 TypeScript `--noEmit`: passed.
- Fresh temporary Node 20 compile: passed; the repository `dist` tree was not reused.
- P9B plus P9A workflow tests: 27/27 passed (13 P9B, 14 P9A).
- Full model-free temporary Node 20 build: 175/175 passed. The historical P7 correction-runner tests now assert the current intended behavior: the evolved working tree is rejected at the frozen-input guard before a claim, report, reservation, or transport call. No frozen hash was updated and no guard was bypassed.
- Offline evaluation: 48/48 passed; all 30 expected blocks made zero provider calls.
- Offline demo: four synthetic scenarios behaved as expected; two mock calls total.
- `git diff --check`: passed before this report and is rerun after documentation.
- No model call, real provider, external API, key, commit, push, deployment, or Amsel-App change occurred.

## Local browser mechanics check

After the source review and the 175-test pass, the existing local UI was started once from a fresh temporary Node 20 build with an injected fake model named `MOCK_UI_MECHANICS`. The fake plan returned only null proposed choices plus the closed four-field list; its draft method returned the closed merge from the authorized synthetic source and confirmed target/date. It made no Ollama, OpenAI, key, or real-model call and is not a product path.

The coordinator manually verified at desktop width 1280 and mobile width 390:

- a generic request produced five neutral questions with no preselected choices;
- separate confirmation of Lina, 25 hours, 2031-09-01, no research, and the MOCK template produced the host-rendered draft;
- the copied draft visibly began with `Unverbindlicher, ungeprüfter synthetischer Entwurf`, included both citations, two open gaps, and the MOCK template label;
- earlier questions were hidden after the result;
- the 390-pixel view had no horizontal document overflow;
- native decimal input accepted 25.5;
- changing hours invalidated the confirmation and made no further request;
- an already edited draft, manually entered text, and cursor position at the actual insertion point remained intact.

A first cursor assertion used an unsuitable end-of-field predicate and returned false. Rechecking the actual inserted substring and insertion-end cursor position passed; no code defect or source change resulted. The protected screenshots remain outside the repository at `/private/tmp/P9-ui-mechanical-desktop.jpg` and `/private/tmp/P9-ui-mechanical-mobile.jpg`, both mode `0600`, with SHA-256 `a22728edad82fbc12a4d8d82a9edee6478da996aadf3cf6b729ec362d38b7d69` and `be603029c2587ff1eb3ff8bcbf58fcf56bdfed24f3238bd2331b7827d8e48944` respectively.

The helper process (PID 66778) was then stopped cleanly. No listener remained on `127.0.0.1:4317` or `127.0.0.1:11435`. The original P9 ledger remained at two reservations with SHA-256 `5014e5f30699319dddbe627303c8f9dcd7bd63a1d3603452fccab5318eb42ae7`; the P9 correction ledger remained at two with SHA-256 `48691753457c185a2f8aa1c756552bcf5bac5ceafac6726e063056c10194acf2`; the historical P7/P8 ledger remained at 22 with SHA-256 `587620cab9b67114f77b983086140e058870a972f918db8abb9cf5140c4206c0`.

## Remaining limits

P9B has no active product path and must remain off. It recognizes only one exact synthetic clause descriptor and two exact outgoing headings. It cannot safely reduce arbitrary contract prose, establish anonymity, detect all personal or indirect information, assess legal sufficiency, or support a real provider.
