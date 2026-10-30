import { test } from "node:test";
import assert from "node:assert/strict";
import { between, report, rows, sessions, type Batch } from "./report.ts";

const H = 3_600_000;
const D = 24 * H;
const T0 = Date.parse("2026-10-20T14:00:00Z"); // 10:00 in New York (tz 240)
let n = 0;
const batch = (install: string, events: [number, string, object?][]): Batch => ({
  rt: 0, game: "g", install, platform: "android", build: "b", tz: 240,
  events: events.map(([t, e, p = {}]) => ({ t, s: "s", n: ++n, e, p: p as any })),
});

test("a repeated batch counts once", () => {
  const b = batch("aaaaaaaa", [[T0, "app_shown"]]);
  assert.equal(rows([b, b]).length, 1);
});

test("sessions end when the app's put away or goes quiet, and keep the player's hour", () => {
  const b = batch("aaaaaaaa", [
    [T0, "app_shown"],
    [T0 + 60_000, "cube_started"],
    [T0 + 120_000, "app_hidden"],
    [T0 + 120_010, "frames"],
    [T0 + 130_000, "app_shown"],
    [T0 + 140_000, "cube_won"],
    [T0 + 3 * H, "app_shown"],
  ]);
  const ss = sessions(rows([b]));
  assert.deepEqual(ss.map((s) => s.ms), [120_010, 10_000, 0]);
  assert.equal(ss[0].localHour, 10);
});

test("players who've gone quiet are stopped, with their last session and the game's signals", () => {
  const r = report(
    [
      batch("stopper1", [[T0, "app_shown"], [T0 + 60_000, "cube_lost", { level: "c1-4" }], [T0 + 70_000, "app_hidden"]]),
      batch("keeper11", [[T0, "app_shown"], [T0 + D, "app_shown"], [T0 + 5 * D, "cube_won"]]),
      batch("private1", [[T0, "app_shown"], [T0 + 1000, "sharing_set", { on: false }]]),
    ],
    { now: T0 + 5 * D + H, signals: (last) => (last.events.some((e) => e.e === "cube_lost") ? ["lost"] : []) },
  );
  const by = Object.fromEntries(r.players.map((p) => [p.install, p]));
  assert.equal(by.stopper1.status, "stopped");
  assert.deepEqual(by.stopper1.lastSession!.signals, ["lost"]);
  assert.equal(by.keeper11.status, "playing");
  assert.equal(by.private1.status, "sharing off");
  assert.deepEqual(r.stopSignals, [{ signal: "lost", players: 1 }]);
  assert.deepEqual(r.retention.find((x) => x.day === 1), { day: 1, eligible: 3, returned: 1 });
});

test("days are the player's own: an evening in New York is still that day", () => {
  const late = Date.parse("2026-10-21T02:30:00Z"); // 22:30 on the 20th in New York
  const b = batch("nightowl", [[late, "app_shown"], [late + 60_000, "cube_started"]]);
  assert.deepEqual(report([b], { now: late + H }).daily, [{ date: "2026-10-20", players: 1, sessions: 1 }]);
  assert.equal(between([b], "2026-10-21", "2026-10-21").length, 0);
  assert.equal(between([b], "2026-10-20", "2026-10-20")[0].events.length, 2);
});

test("players and rows say which game they're from", () => {
  const a = batch("aaaaaaaa", [[T0, "app_shown"]]);
  const p = { ...batch("bbbbbbbb", [[T0, "app_shown"]]), game: "pizza" };
  const r = report([a, p], { now: T0 + H });
  assert.deepEqual(r.games, ["g", "pizza"]);
  assert.deepEqual(r.players.map((x) => x.game).sort(), ["g", "pizza"]);
});
