import assert from "node:assert/strict";
import test from "node:test";
import { isAcceptedRemainingPathDraft } from "../src/p8RemainingPathsRunner.js";

const accepted = {
  ok: true,
  kind: "draft",
  draft: "Unverbindlicher Entwurf: bisher 20, künftig 25 Wochenstunden ab 2031-09-01. Andere Vertragsbestimmungen bleiben unverändert.",
  citations: ["contract-lina:p01", "contract-lina:p02"],
};

test("remaining-path evidence requires the grounded hours, date, unchanged terms and both citations", () => {
  assert.equal(isAcceptedRemainingPathDraft(accepted), true);
  for (const result of [
    { ...accepted, draft: accepted.draft.replace("20", "21") },
    { ...accepted, draft: accepted.draft.replace("25", "26") },
    { ...accepted, draft: accepted.draft.replace("2031-09-01", "2031-10-01") },
    { ...accepted, draft: accepted.draft.replace("Andere Vertragsbestimmungen bleiben unverändert.", "Weitere Punkte werden später ergänzt.") },
    { ...accepted, citations: ["contract-lina:p01"] },
    { ...accepted, kind: "clarification" },
  ]) assert.equal(isAcceptedRemainingPathDraft(result), false);
});
