# v0.1.0 local release-candidate evidence

Date: 2026-10-24

## Candidate scope

The candidate starts from public `main` commit `71ca143160bb29b870aa2aaa882776a2eb09cd7b`. It changes only the repository license, the root package and lockfile license metadata, the quick-start install command, and license/release documentation. Source files and tests are unchanged.

The current version is source-available under the unmodified PolyForm Noncommercial License 1.0.0 and is not OSI open source. Public history through the baseline commit remains available under the MIT terms that applied to those versions; this does not revoke rights already granted for those historical versions. Separate commercial relicensing rights for future third-party contributions remain unresolved.

## License and metadata checks

- Official source: `https://polyformproject.org/licenses/noncommercial/1.0.0.txt`
- SHA-256 of the downloaded official text and repository `LICENSE`: `ffcca38841adb694b6f380647e15f17c446a4d1656fed51a1e2041d064c94cc8`
- Byte-for-byte comparison: passed.
- Root `package.json` SPDX expression: `PolyForm-Noncommercial-1.0.0`.
- Root package entry in `package-lock.json`: `PolyForm-Noncommercial-1.0.0`.
- Dependency versions, resolved URLs, integrity hashes, and dependency license metadata were not changed.
- `git diff --check`: passed.

The `Yoyodyne` line in `LICENSE` is part of the official license's unchanged example. It is not a project owner, copyright holder, required notice, or contact declaration.

## Fresh-checkout quick start

A new temporary candidate tree was created from the baseline Git archive. Only the candidate's six modified tracked files were overlaid; it had no existing `node_modules`, build output, environment file, user configuration, API key, or copied Amsel content.

Runtime:

- Node.js `v20.20.1`
- npm `10.8.2`
- `npm ci`: passed; exactly three packages were installed from the lockfile and npm reported zero known vulnerabilities.
- `npm run typecheck`: passed.
- `npm test`: 34/34 passed.
- `npm run test:adapter`: 9/9 passed.
- `npm run eval`: 48/48 passed; 18 allowed, 30 blocked, and all 30 expected blocks made zero provider calls.
- `npm run demo`: passed; scenarios A and B each used `MOCK_OFFLINE` once, scenarios C and D used no provider, total provider calls 2.

The documented README quick start uses `npm ci` and was executed in that order. All provider transports in the test run were local in-memory doubles. No live provider, API key, external model request, Amsel data, remote repository write, commit, push, pull request, tag, release, or deployment was used.

## Review status and remaining gates

- The narrow independent review of this license, metadata, documentation, and clean-install evidence completed without an open finding.
- The candidate may be committed to a review branch and presented in a pull request. Merge, tag, public release, or deployment still requires the separate release gate.
- Any OpenAI-specific adapter work, account/key setup, cost approval, or live request remains a separate later step. The existing provider-neutral adapter remains disabled by default.
