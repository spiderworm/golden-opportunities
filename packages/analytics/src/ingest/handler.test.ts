import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { check } = createRequire(import.meta.url)("./handler.cjs");
const games = new Set(["waddleberg"]);
const NOW = Date.parse("2026-10-22T18:00:00Z");
const batch = (over: object = {}) =>
  JSON.stringify({ v: 1, game: "waddleberg", install: "1b4e28ba-2fa1-11d2-883f-0016d3cca427", platform: "android", build: "20261022180000", tz: 300, events: [{ t: NOW, s: "abc123", n: 1, e: "cube_won", p: { level: "c1-3", hearts: 2, won: true } }], ...over });

test("a good batch is kept under its game and the day it came", () => {
  const r = check(batch(), games, NOW);
  assert.equal(r.status, 200);
  assert.match(r.key, /^events\/game=waddleberg\/dt=2026-10-22\/\d+-[0-9a-f-]+\.json\.gz$/);
  assert.equal(r.data.rt, NOW);
  assert.equal(r.data.events[0].e, "cube_won");
});

test("only what an event should hold is kept", () => {
  const r = check(batch({ events: [{ t: NOW, s: "a", n: 1, e: "x", p: {}, extra: "no" }] }), games, NOW);
  assert.deepEqual(Object.keys(r.data.events[0]), ["t", "s", "n", "e", "p"]);
});

test("anything else is refused", () => {
  const refused = (over: object) => check(batch(over), games, NOW).status;
  assert.equal(refused({ game: "unknown" }), 400);
  assert.equal(refused({ v: 2 }), 400);
  assert.equal(refused({ install: "x" }), 400);
  assert.equal(refused({ events: [] }), 400);
  assert.equal(refused({ events: [{ t: NOW, s: "a", n: 1, e: "Bad Name", p: {} }] }), 400);
  assert.equal(refused({ events: [{ t: NOW, s: "a", n: 1, e: "x", p: { nested: { a: 1 } } }] }), 400);
  assert.equal(refused({ events: [{ t: NOW, s: "a", n: 1, e: "x", p: { long: "y".repeat(201) } }] }), 400);
  assert.equal(check("not json", games, NOW).status, 400);
  assert.equal(check("x".repeat(16385), games, NOW).status, 413);
});

test("a batch keeps the version its build reported, or is given one from the table, saying which", () => {
  const table = { releases: { waddleberg: { "20261027134038": "0.1.9-alpha" } }, versions: { waddleberg: [["20261020000000", "0.1.2-alpha"], ["20261029000000", "0.1.12-alpha"]] as [string, string][] } };
  const g = new Set(["waddleberg"]);
  const kept = (over: object) => check(batch({ game: "waddleberg", ...over }), g, NOW, table).data;
  assert.deepEqual([kept({ version: "0.1.13-alpha" }).version, kept({ version: "0.1.13-alpha" }).versionFrom], ["0.1.13-alpha", "reported"]);
  assert.deepEqual([kept({ build: "20261027134038" }).version, kept({ build: "20261027134038" }).versionFrom], ["0.1.9-alpha", "play"]);
  assert.deepEqual([kept({ build: "20261029120000" }).version, kept({ build: "20261029120000" }).versionFrom], ["0.1.12-alpha", "code"]);
  assert.equal(kept({ build: "dev" }).version, undefined, "not a build moment: no version");
  assert.equal(kept({ version: "<script>" , build: "dev" }).version, undefined, "a malformed reported version is ignored");
});
