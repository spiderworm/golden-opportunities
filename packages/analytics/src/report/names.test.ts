import { test } from "node:test";
import assert from "node:assert/strict";
import { placeholderName } from "./names.ts";

test("a player's made-up name is two words, the same every time, and differs between players", () => {
  const a = placeholderName("b9ab82be-1111-4222-8333-444455556666");
  assert.match(a, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.equal(placeholderName("b9ab82be-1111-4222-8333-444455556666"), a);
  const names = new Set(Array.from({ length: 200 }, (_, i) => placeholderName(`install-${i}`)));
  assert.ok(names.size > 180, `200 players got only ${names.size} names`);
});
