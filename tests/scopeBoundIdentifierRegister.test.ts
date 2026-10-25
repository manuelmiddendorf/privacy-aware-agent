import assert from "node:assert/strict";
import test from "node:test";
import { ScopeBoundIdentifierRegister } from "../src/scopeBoundIdentifierRegister.js";

test("email matching folds only the domain and preserves local-part case", () => {
  const register = new ScopeBoundIdentifierRegister([
    { subjectId: "one", type: "email", value: "Talea@Verein.Invalid" },
  ]);
  assert.equal(register.match("Kontakt: Talea@verein.invalid").state, "exact");
  assert.equal(register.match("Kontakt: talea@verein.invalid").state, "none");
});

test("NFKC exact names and normalized addresses match without discarding their numbers", () => {
  const register = new ScopeBoundIdentifierRegister([
    { subjectId: "one", type: "person_name", value: "Talea Fantasie" },
    { subjectId: "one", type: "postal_address", value: "Beispielbogen 84, 00000 Musterort" },
  ]);
  assert.equal(register.match("Ｔａｌｅａ　Ｆａｎｔａｓｉｅ").state, "exact");
  assert.equal(register.match("Beispielbogen 84,00000 Musterort").state, "exact");
  assert.equal(register.match("Beispielbogen, Musterort").state, "none");
});

test("one-edit names remain uncertain and two possible subjects are ambiguous", () => {
  const register = new ScopeBoundIdentifierRegister([
    { subjectId: "talea", type: "person_name", value: "Talea Fantasie" },
    { subjectId: "talia", type: "person_name", value: "Talia Fantasie" },
  ]);
  const unique = register.match("Talea Fantasle");
  assert.equal(unique.state, "fuzzy");
  assert.deepEqual(unique.matchedTypes, ["person_name"]);
  assert.equal(unique.subjectCount, 1);
  const ambiguous = register.match("Tala Fantasie");
  assert.equal(ambiguous.state, "ambiguous");
  assert.deepEqual(ambiguous.matchedTypes, ["person_name"]);
  assert.equal(ambiguous.subjectCount, 2);
});

test("unresolved short and fuzzy matches take precedence over an exact known person", () => {
  const register = new ScopeBoundIdentifierRegister([
    { subjectId: "talea", type: "person_name", value: "Talea Fantasie" },
    { subjectId: "talea", type: "contextual_short_alias", value: "Al" },
    { subjectId: "talia", type: "person_name", value: "Talia Fantasie" },
  ]);
  assert.equal(register.match("Talea Fantasie fragt mit Al nach.").state, "short_alias_uncertain");
  assert.equal(register.match("Talea Fantasie fragt auch für Talia Fantasle.").state, "ambiguous");
});

test("exact names never absorb an identifier inserted between their tokens", () => {
  const register = new ScopeBoundIdentifierRegister([
    { subjectId: "talea", type: "person_name", value: "Talea Fantasie" },
  ]);
  const match = register.match("Talea +49 30 12345678 Fantasie möchte ihre Stunden ändern.");
  assert.equal(match.state, "none");
  assert.deepEqual(match.confirmedRanges, []);
});

test("contextual short aliases match complete tokens only and never identify automatically", () => {
  const register = new ScopeBoundIdentifierRegister([
    { subjectId: "one", type: "contextual_short_alias", value: "Al" },
  ]);
  assert.equal(register.match("Allgemeine Informationen").state, "none");
  assert.equal(register.match("Kollege Al fragt nach.").state, "short_alias_uncertain");
});
