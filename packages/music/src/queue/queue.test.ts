import { test } from "node:test";
import assert from "node:assert/strict";
import { createQueue, shuffle, type Song } from "./queue.ts";
import { loadPrefs, meetSongs } from "../prefs/prefs.ts";

const songs: Song[] = [
  { id: "theme", file: "theme.mp3", title: "Theme", pinned: true },
  { id: "a", file: "a.mp3", title: "A" },
  { id: "b", file: "b.mp3", title: "B" },
  { id: "c", file: "c.mp3", title: "C" },
  { id: "d", file: "d.mp3", title: "D" },
];
const none = () => false;
// a repeatable random
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const take = (q: ReturnType<typeof createQueue>, n: number) => Array.from({ length: n }, () => q.next()?.id);

test("the pinned song first, then every other song once before any repeats, and the pinned one never again", () => {
  const q = createQueue(songs, { excluded: none, random: seeded(7) });
  const order = take(q, 13);
  assert.equal(order[0], "theme");
  for (const r of [order.slice(1, 5), order.slice(5, 9), order.slice(9, 13)]) assert.deepEqual([...r].sort(), ["a", "b", "c", "d"]);
  assert.ok(!order.slice(1).includes("theme"));
});

test("a new round never starts with the song that just ended", () => {
  for (let seed = 1; seed < 200; seed++) {
    const q = createQueue(songs, { excluded: none, random: seeded(seed) });
    const order = take(q, 30);
    for (let i = 1; i < order.length; i++) assert.notEqual(order[i], order[i - 1], `seed ${seed}`);
  }
});

test("shuffling is even: each song leads about as often", () => {
  const firsts = new Map<string, number>();
  const random = seeded(3);
  for (let i = 0; i < 4000; i++) {
    const f = shuffle(["a", "b", "c", "d"], random)[0];
    firsts.set(f, (firsts.get(f) ?? 0) + 1);
  }
  for (const n of firsts.values()) assert.ok(n > 900 && n < 1100, `${n}`);
});

test("excluded songs don't play, pinned or not, and take effect mid-session", () => {
  const out = new Set(["theme", "b"]);
  const q = createQueue(songs, { excluded: (id) => out.has(id), random: seeded(5) });
  const first = take(q, 6);
  assert.ok(!first.includes("theme") && !first.includes("b"));
  out.delete("b");
  out.add("c");
  const later = take(q, 9);
  assert.ok(later.includes("b") && !later.slice(3).includes("c"), later.join());
});

test("with every unpinned song excluded the pinned ones go round; with all excluded, nothing", () => {
  const out = new Set(["a", "b", "c", "d"]);
  const q = createQueue(songs, { excluded: (id) => out.has(id) });
  assert.deepEqual(take(q, 3), ["theme", "theme", "theme"]);
  out.add("theme");
  assert.equal(q.next(), null);
});

test("new songs lead the first shuffle (after the pinned song), and only the first", () => {
  const q = createQueue(songs, { excluded: none, fresh: (id) => id === "d", random: seeded(11) });
  const order = take(q, 9);
  assert.deepEqual(order.slice(0, 2), ["theme", "d"]);
});

test("back plays the song before, and skip then returns to the one left", () => {
  const q = createQueue(songs, { excluded: none, random: seeded(2) });
  const [t, x, y] = take(q, 3);
  assert.equal(q.back()?.id, x);
  assert.equal(q.back()?.id, t);
  assert.equal(q.back(), null);
  assert.equal(q.next()?.id, x);
  assert.equal(q.next()?.id, y);
});

test("prefs: the first open marks nothing new; an update's songs are new until played", () => {
  const m = new Map<string, string>();
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  let p = meetSongs(loadPrefs("t", store), ["a", "b"]);
  assert.deepEqual(p.fresh, []);
  p = meetSongs(p, ["a", "b", "c"]);
  assert.deepEqual(p.fresh, ["c"]);
  p = meetSongs({ ...p, fresh: [] }, ["a", "b", "c"]);
  assert.deepEqual(p.fresh, []);
});

test("prefs: an old volume setting carries over once, and nonsense is ignored", () => {
  const m = new Map<string, string>([["t.music", "{not json"]]);
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: () => {} };
  assert.equal(loadPrefs("t", store, () => 0).volume, 0);
  assert.equal(loadPrefs("t", store).volume, 1);
  m.set("t.music", JSON.stringify({ volume: 0.4, excluded: ["a", 3] }));
  assert.equal(loadPrefs("t", store, () => 0).volume, 0.4);
  assert.deepEqual(loadPrefs("t", store).excluded, ["a"]);
});

test("shuffle off: the player's order, from the song after the one playing, pinned first and round again", () => {
  let shuffled = true;
  const order = ["theme", "c", "a", "d", "b"];
  const q = createQueue(songs, { excluded: (id) => id === "d", order: () => order, shuffled: () => shuffled, random: seeded(4) });
  shuffled = false;
  assert.deepEqual(take(q, 6), ["theme", "c", "a", "b", "c", "a"]);
});

test("turning shuffle off mid-session carries on in order from the song playing", () => {
  let shuffled = true;
  const order = ["theme", "a", "b", "c", "d"];
  const q = createQueue(songs, { excluded: none, order: () => order, shuffled: () => shuffled, random: seeded(9) });
  take(q, 2);
  const now = q.current()!.id;
  shuffled = false;
  const at = order.indexOf(now);
  const want = [1, 2, 3].map((k) => order.filter((id) => id !== "theme")[(order.indexOf(now) - 1 + k) % 4]);
  assert.ok(at > 0);
  assert.deepEqual(take(q, 3), want);
});

test("prefs: the order keeps the player's songs where they put them, new ones after", async () => {
  const { ordered } = await import("../prefs/prefs.ts");
  const p = loadPrefs("t", undefined);
  assert.deepEqual(ordered({ ...p, order: ["c", "gone", "a"] }, ["a", "b", "c"]), ["c", "a", "b"]);
  assert.equal(p.shuffle, true);
});

test("a saved place carries on: the same song, the pinned ones still spent, the same round", async () => {
  const { createQueue } = await import("./queue.ts");
  const list = [{ id: "theme", file: "", title: "", pinned: true }, ...["a", "b", "c", "d"].map((id) => ({ id, file: "", title: "" }))];
  const first = createQueue(list, { excluded: () => false });
  first.next();
  first.next();
  first.next();
  const place = JSON.parse(JSON.stringify(first.place()));
  const again = createQueue(list, { excluded: () => false });
  again.resume(place);
  assert.equal(again.current()?.id, first.current()?.id);
  const rest = [again.next()!.id, again.next()!.id];
  assert.deepEqual(rest, [first.next()!.id, first.next()!.id]);
  assert.ok(!rest.includes("theme"));
});
