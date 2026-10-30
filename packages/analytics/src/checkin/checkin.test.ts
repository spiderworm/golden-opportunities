import { test } from "node:test";
import assert from "node:assert/strict";
import { createCheckin } from "./checkin.ts";

const DAY = 86_400_000;
const setup = () => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  return createCheckin({ key: "t", track: () => {}, question: "?", reasons: {}, storage });
};

test("asked first at the third pause, then every fifth pause at least two days on", () => {
  const c = setup();
  const t = Date.parse("2026-10-22T12:00:00Z");
  assert.deepEqual([c.due(t), c.due(t), c.due(t)], [false, false, true]);
  // five pauses later, but the same day: not yet
  assert.deepEqual([1, 2, 3, 4, 5].map(() => c.due(t + DAY)), [false, false, false, false, false]);
  assert.equal(c.due(t + 2 * DAY), true);
  assert.equal(c.due(t + 9 * DAY), false, "only one pause since");
});
