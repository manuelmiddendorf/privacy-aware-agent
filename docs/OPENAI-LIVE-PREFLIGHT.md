# OpenAI live-demo preflight

Date: 2026-10-24

## Reviewed scope

This preflight prepares one small server-side transport for the existing privacy-gated `TransportModelProvider`. It does not add a second agent engine. The normal demo remains offline and uses `MOCK_OFFLINE`.

The only proposed live run reuses synthetic scenarios A–D:

- A: one source-backed answer, at most one OpenAI request;
- B: one general draft, at most one OpenAI request;
- C: child/health content is blocked before transport, zero requests;
- D: insufficient approved evidence is blocked before transport, zero requests.

Requests run sequentially. There are no retries, tools, files, actions, arbitrary URLs, model probes, list-model calls, or evaluation series.

## Fixed API contract

- Endpoint: `POST https://api.openai.com/v1/responses`
- Model ID: `gpt-6-luna`
- Processing: `service_tier: "default"` for Standard pricing
- Storage: `store: false`
- Reasoning: `reasoning.effort: "none"`
- Output ceiling: 256 tokens, including visible and reasoning tokens
- Input billing reservation: the full published 1,050,000-token model context minus the 256-token output ceiling
- Tools: empty and `tool_choice: "none"`
- Redirects: rejected
- Output: strict JSON schema containing only `text` and selected-source `citations`

The model ID, endpoint, processing tier, price constants, and request limits are compiled trusted-host settings. They cannot be supplied by a user request, document, provider response, environment variable, or command-line argument.

Official OpenAI documentation consulted:

- [GPT-6 Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [API pricing](https://developers.openai.com/api/docs/pricing)
- [Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [API authentication overview](https://developers.openai.com/api/reference/overview)
- [Token counting and output-token limits](https://developers.openai.com/api/docs/guides/token-counting)
- [Responses storage behavior](https://developers.openai.com/api/docs/guides/migrate-to-responses)

The documentation lists `gpt-6-luna` for Responses, supports `reasoning.effort: none`, and gives Standard text prices of USD 0.10 per million input tokens and USD 0.50 per million output tokens. It also states that prompts above 272,000 input tokens are charged at twice the input rate and 1.5 times the output rate for the full request. The implementation makes no claim that this particular account currently has access; that remains unknown until the separately approved live attempt.

## Conservative budget

The worst-case reservation for one attempt is:

`1,049,744 × 0.20 / 1,000,000 + 256 × 0.75 / 1,000,000 = USD 0.2101408`

The fixed two-request maximum reserves at most USD 0.4202816, below the approved overall ceiling of USD 5.00. This reservation deliberately uses the model's full published context and the long-context rates; it does not infer a token count from the 49 KiB HTTP-body limit. `max_output_tokens` includes non-visible reasoning tokens according to the official documentation. Cached-input discounts are ignored.

Before every network attempt, an on-disk ledger reserves the full worst-case amount under a SHA-256 digest of the already gated request. The ledger is written with mode 0600 and protected by an exclusive lock. It permits no more than two unique requests. A duplicate, parallel run, unfinished previous reservation, timeout, unknown response, missing or inconsistent usage, unexpected model/tier, or changed price contract halts subsequent calls. Confirmed usage is recorded, while the conservative reservation is never refunded. A dashboard alert is not used as the enforcement boundary.

## Local key file

The only supported key path is `.env.openai.local` in this repository. It is already covered by the `.env.*` Git ignore rule. The application does not search the environment, Keychain, Amsel files, home directory, or other credential stores.

After the separate live gate, prepare the file without putting the key in shell history:

```sh
cd /Users/my/VisualStudio/privacy-aware-agent
if [ -e .env.openai.local ]; then
  echo "Key file already exists; leaving it unchanged."
else
  (umask 077 && : > .env.openai.local)
fi
```

Open that file in a local editor and add exactly one line:

```text
OPENAI_API_KEY=<paste the dedicated project key locally>
```

Do not paste the key into chat, command arguments, Git, reports, screenshots, or logs. The runner checks that the file is a regular file with mode 0600 before reading it. It never prints the key. A dedicated OpenAI project and key are recommended; they are not created by this code.

The historical one-time command was:

```sh
PAA_OPENAI_LIVE_ENABLED=1 npm run demo:openai
```

That reviewed run is complete. Its two-entry ledger is intentionally exhausted and must not be deleted, reset, or rerun. Any separately reviewed follow-up uses a different compiled run contract and ledger while counting this full reservation; see [OpenAI practical P3 preflight](OPENAI-PRACTICAL-P3-PREFLIGHT.md).

## Current boundary

All automated tests use injected in-memory HTTP doubles. After the independent review and a separate human-authorized live gate, the fixed runner was executed once on 2026-10-24 with the four synthetic scenarios. It made exactly the two permitted A/B requests; C/D remained blocked before transport. See [OpenAI live result](OPENAI-LIVE-RESULT.md).

The runner alone read the protected local key into memory and did not print it. `store: false` does not by itself establish Zero Data Retention, EU-only processing, a legal privacy conclusion, or compliance. The rule-based privacy gate remains intentionally incomplete.
