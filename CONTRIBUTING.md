# Contributing

Keep the privacy gate before every provider call. A change that adds an input source must add an explicit trusted-policy capability, size bound, tenant check, metadata/content scan, and negative tests proving zero provider calls when access is denied.

Use synthetic data only in tests, examples, logs, and issues. Never add API keys, live provider configuration, personal data, private prompts, or production documents. Run `npm run typecheck`, `npm test`, and `npm run eval` before proposing a change.

## License of contributions

The current project is source-available under the PolyForm Noncommercial License 1.0.0 and is not OSI open source. By submitting a contribution, you agree that it may be distributed as part of this project under that license. This does not assign copyright or grant the project separate commercial relicensing rights; contribution terms for any future commercial licensing remain an open project decision. Do not submit code unless you have the right to do so.
