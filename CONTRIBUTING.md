# Contributing

Keep the privacy gate before every provider call. A change that adds an input source must add an explicit trusted-policy capability, size bound, tenant check, metadata/content scan, and negative tests proving zero provider calls when access is denied.

Use synthetic data only in tests, examples, logs, and issues. Never add API keys, live provider configuration, personal data, private prompts, or production documents. Run `npm run typecheck`, `npm test`, and `npm run eval` before proposing a change.
