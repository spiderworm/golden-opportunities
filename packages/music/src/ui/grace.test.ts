import { test } from "node:test";
import assert from "node:assert/strict";
import { END_S, GRACE_MS, meantForBefore, nearEnd } from "./grace.ts";

test("a tap just after the song changes was meant for the one before", () => {
  const changed = 10_000;
  assert.equal(meantForBefore(changed + 1, changed), true);
  assert.equal(meantForBefore(changed + 10, changed), true);
  assert.equal(meantForBefore(changed + 200, changed), true);
  assert.equal(meantForBefore(changed + GRACE_MS - 1, changed), true);
  assert.equal(meantForBefore(changed + GRACE_MS, changed), false);
  assert.equal(meantForBefore(changed + 3000, changed), false);
});

test("a tap pressed before the change and landing after it was meant for the one before", () => {
  assert.equal(meantForBefore(9_900, 10_000), true);
});

test("with no change on screen, a tap is for the song shown", () => {
  assert.equal(meantForBefore(10_000, null), false);
});

test("the pop-up shows itself in a song's last seconds, once its length is known", () => {
  assert.equal(nearEnd(null), false);
  assert.equal(nearEnd(END_S + 0.5), false);
  assert.equal(nearEnd(END_S), true);
  assert.equal(nearEnd(1), true);
});
