# Local offline UI validation

Date: 2026-10-24

## Scope

The local browser interface uses the existing `PrivacyAwareAgent`, `DEMO_POLICY`, `MockProvider`, privacy gate, source authorization, and evidence contract. It serves only fixed local assets from `127.0.0.1:4317`; it has no live-provider, key-loader, arbitrary-file, upload, external-URL, action, or persistent user-text path.

The only positive source-backed requests are the previously reviewed synthetic `demo-a` and P01 request/document pairs. They are selected by a fixed template ID and reconstructed on the server. Free incoming source-backed requests receive no evidence approval and fail closed. Source-free drafts and summaries remain available.

## Automated checks

`npm run typecheck` passed with Node.js 20.20.1. `npm run test:ui` passed 4/4 focused checks:

1. fixed static assets, defensive response headers, absent CORS permission, and inaccessible key/ledger paths;
2. loopback Host and same-origin enforcement, supported methods, closed JSON schema, and request-size limits;
3. the real offline pipeline for a draft, summary, exact P01 template and citation, privacy block, and unconfirmed-evidence block;
4. single-runner behavior for two staggered held request bodies, plus a neutral injected-runner error.

`git diff --check` passed. The tests use only loopback servers, synthetic content, and local doubles. They do not read a key or real ledger and make no provider request.

## Browser checks

The interface was exercised in the in-app browser at 1280 × 900 desktop size and 390 × 844 mobile size.

- A source-free draft completed through `MOCK_OFFLINE` using the documented Ctrl/Command+Enter shortcut.
- A source-free summary completed without citations.
- The fixed P01 and meeting templates completed with only the `meeting-preparation` citation.
- A health/child example was blocked with neutral text and did not echo the sensitive input in the result.
- An arbitrary meeting-source question was blocked as unconfirmed evidence.
- Input remained in the text field after success, block, and a deliberately induced local connection error.
- Loading, completed, blocked, and error states were visible; the action became available again after an error.
- The mobile page had `scrollWidth === clientWidth === 390`, with no horizontal overflow. A source-help spacing issue found during review was corrected and rechecked with an 8 px heading-to-help gap.
- The browser page referenced only `/styles.css` and `/app.js`. No external asset or request target is present in the page code.
- `MOCK_OFFLINE` and `Live provider: not enabled` remained visible at both sizes.

Desktop and mobile screenshots were captured during the local browser review using synthetic content only.

## Known limit

The server supplies a five-second `AbortSignal` to the injected runner. This is useful cancellation signalling, but it cannot guarantee termination of an arbitrary runner that deliberately ignores abort. The P5 product path uses only the short local `MockProvider`; this validation does not claim a universal hard five-second execution limit.

The rule-based privacy detector is intentionally conservative and incomplete. The UI and these checks do not establish general semantic accuracy, universal privacy detection, prompt-injection resistance, authentication, production readiness, or authorization for a live provider.
