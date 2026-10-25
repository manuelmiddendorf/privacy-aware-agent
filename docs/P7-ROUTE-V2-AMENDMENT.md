# P7 route-v2 protocol amendment

Recorded: 2026-10-25, after the failed A/B development run and before route-v2 implementation review or inference.
Independent record SHA-256: `48a0f4cbece22c424057d9613ea4b6ce90a13e0c57e928d2d51d43eed4c9c689`.

This is a disclosed correction to the proposal contract. It was not preregistered before the original A/B experiment. The original twelve-case catalog hash `77cdd0add0cf94e7c3c66f00022ea1fd7b36e66f9d3eaf3e1182f48977367088`, the failed A/B report, its ten calls, and its durable development claim remain unchanged.

The correction replaces the interdependent `decision`, `skillIds`, and nullable clarification fields with one exact closed route object:

```json
{"schemaVersion":1,"route":"UNDERSTAND_DOCUMENTS|COMPOSE_TEXT|UNDERSTAND_THEN_COMPOSE|CLARIFY|UNSUPPORTED"}
```

The value shown with separators documents the five alternatives; an actual reply must contain exactly one literal value. Host code maps the first three routes to the existing understanding skill, composition skill, or exact ordered pair. The last two produce fixed host responses without generation. Unknown routes and extra fields are rejected. The model never supplies rights, sources, catalog IDs, actions, or safety clearance.

Exactly one new prompt ID, `P7_ROUTE_V2`, may be tested with the same pinned Qwen model, 16,384-token context, 12 KiB model-prompt cap, 768-token generation cap, source rights, organization/session fences, citation checks, no-action rule, and no persistence or cloud fallback. Its proposal prompt explicitly handles ordinary German and English work requests without requiring users to know skill IDs.

The same six known development cases may run once with at most nine POSTs under a new durable correction claim. The unchanged private holdouts remain unavailable unless route-v2 passes at least three of four known positives and all critical gates. A qualifying holdout run is capped at nine POSTs and a later separately approved UI smoke at four. The cumulative authorized maximum is 32: ten historical calls plus nine correction-development, nine holdout, and four UI calls. The older hard ceiling remains 40, but its final eight calls authorize no additional experiments.

Protected correction-benchmark evidence may store each actual synthetic proposal object in a small bounded closed JSON field together with case, route, counts, and validated result. It does not store general application requests, attachments, real user data, or application traffic. A transport error or unknown execution state stops the phase without retry; the correction claim is never reset automatically.
