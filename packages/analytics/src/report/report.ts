// What the batches say about how a game is played: who plays, when, for how
// long, when they stop, and (with the game's own signals) why. Pure: give it
// the batches as ingest kept them (see fetch.ts for getting them from S3).
import type { Sent } from "../client/analytics.ts";

/** version: the release the build is; versionFrom: "reported" by the build, or looked up at ingest ("play": its Play bundle, "code": the game's version when it was built) */
export type Batch = { rt: number; game: string; install: string; platform: string; build: string; version?: string; versionFrom?: "reported" | "play" | "code"; tz: number; events: Sent[] };
/** an event with where it came from; local: the player's own clock, as an ISO-like string */
export type Row = Sent & { game: string; install: string; platform: string; build: string; tz: number; local: string };
/** localDate, localHour, localDay: when it started on the player's own clock */
export type Session = { game: string; install: string; start: number; end: number; ms: number; localDate: string; localHour: number; localDay: number; events: Row[] };

/** a game's reading of a player's last session: why it may have been their last */
export type Signals = (last: Session, all: Row[]) => string[];

export type Options = {
  now?: number;
  /** installs left out (David's own, say) */
  exclude?: string[];
  /** an install not seen for this many days has stopped (3) */
  lapsedDays?: number;
  signals?: Signals;
};

const DAY = 86_400_000;
const GAP = 30 * 60_000; // events further apart than this are separate sessions

export function rows(batches: Batch[], exclude: string[] = []): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const b of batches) {
    if (exclude.includes(b.install)) continue;
    for (const e of b.events) {
      const id = `${b.install}:${e.n}`;
      if (seen.has(id)) continue; // sent twice: the answer was lost as the app was put away
      seen.add(id);
      out.push({ ...e, game: b.game, install: b.install, platform: b.platform, build: b.build, tz: b.tz, local: localTime(e.t, b.tz) });
    }
  }
  return out.sort((a, b) => a.install.localeCompare(b.install) || a.n - b.n);
}

// getTimezoneOffset's minutes: UTC minus local
const localTime = (t: number, tz: number) => new Date(t - tz * 60_000).toISOString().slice(0, 19).replace("T", " ");

/** an install's events split where it came back after being put away, or after half an hour quiet */
export function sessions(all: Row[]): Session[] {
  const out: Session[] = [];
  let cur: Row[] = [];
  const close = () => {
    if (!cur.length) return;
    const start = cur[0].t;
    const end = cur.at(-1)!.t;
    const local = new Date(start - cur[0].tz * 60_000);
    out.push({ game: cur[0].game, install: cur[0].install, start, end, ms: end - start, localDate: local.toISOString().slice(0, 10), localHour: local.getUTCHours(), localDay: local.getUTCDay(), events: cur });
    cur = [];
  };
  for (const r of all) {
    const prev = cur.at(-1);
    // what's tracked as the app goes (a game's own last words) stays with its session
    const back = r.e === "app_shown" && cur.some((x) => x.e === "app_hidden");
    if (prev && (prev.install !== r.install || r.t - prev.t > GAP || back)) close();
    if (!cur.length && r.e === "app_hidden") continue; // a lone put-away ends nothing
    cur.push(r);
  }
  close();
  return out;
}

/** the batches with only the events made between from and to (YYYY-MM-DD, inclusive) on the player's own clock */
export function between(batches: Batch[], from: string, to: string): Batch[] {
  return batches
    .map((b) => ({ ...b, events: b.events.filter((e) => { const d = localTime(e.t, b.tz).slice(0, 10); return d >= from && d <= to; }) }))
    .filter((b) => b.events.length);
}

export function report(batches: Batch[], o: Options = {}) {
  const now = o.now ?? Date.now();
  const lapsedDays = o.lapsedDays ?? 3;
  const all = rows(batches, o.exclude);
  const ss = sessions(all);
  const installs = [...new Set(all.map((r) => r.install))];

  const active = new Map<string, Set<string>>();
  for (const s of ss) {
    const d = s.localDate;
    if (!active.has(d)) active.set(d, new Set());
    active.get(d)!.add(s.install);
  }

  const players = installs.map((install) => {
    const mine = ss.filter((s) => s.install === install);
    const evs = all.filter((r) => r.install === install);
    const first = evs[0].t;
    const last = evs.at(-1)!.t;
    const days = new Set(mine.map((s) => s.localDate));
    const lapsed = now - last > lapsedDays * DAY;
    const sharingOff = evs.at(-1)!.e === "sharing_set" && evs.at(-1)!.p.on === false;
    const lastSession = mine.at(-1);
    return {
      game: evs[0].game,
      install,
      short: install.slice(0, 8),
      platform: evs.at(-1)!.platform,
      build: evs.at(-1)!.build,
      first,
      last,
      daysSinceFirst: Math.floor((now - first) / DAY),
      daysSinceLast: Math.floor((now - last) / DAY),
      activeDays: days.size,
      sessions: mine.length,
      playMs: mine.reduce((a, s) => a + s.ms, 0),
      // stopped: quiet for lapsedDays, or turned sharing off (which isn't stopping)
      status: sharingOff ? "sharing off" : lapsed ? "stopped" : "playing",
      lastSession: lastSession && {
        start: lastSession.start,
        ms: lastSession.ms,
        tail: lastSession.events.slice(-15).map((r) => ({ local: r.local, e: r.e, p: r.p })),
        signals: o.signals?.(lastSession, evs) ?? [],
      },
      checkins: evs.filter((r) => r.e === "checkin").map((r) => ({ local: r.local, ...r.p })),
    };
  });

  // returned on day N: of the installs at least N days old, the share seen N days after their first day (or later)
  const retention = [1, 3, 7, 14].map((n) => {
    const eligible = players.filter((p) => p.daysSinceFirst >= n);
    const back = eligible.filter((p) => p.last - p.first >= n * DAY - DAY / 2);
    return { day: n, eligible: eligible.length, returned: back.length };
  });

  const lengths = ss.map((s) => s.ms).sort((a, b) => a - b);
  const q = (f: number) => (lengths.length ? lengths[Math.min(lengths.length - 1, Math.floor(f * lengths.length))] : 0);

  return {
    game: batches[0]?.game ?? "",
    games: [...new Set(all.map((r) => r.game))].sort(),
    at: now,
    installs: installs.length,
    events: all.length,
    sessions: ss.length,
    daily: [...active].sort(([a], [b]) => a.localeCompare(b)).map(([date, set]) => ({ date, players: set.size, sessions: ss.filter((s) => s.localDate === date).length })),
    byHour: Array.from({ length: 24 }, (_, h) => ss.filter((s) => s.localHour === h).length),
    byWeekday: Array.from({ length: 7 }, (_, d) => ss.filter((s) => s.localDay === d).length),
    sessionMs: { p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9) },
    retention,
    players: players.sort((a, b) => b.last - a.last),
    // what stopped players' last sessions had in common
    stopSignals: tally(players.filter((p) => p.status === "stopped").flatMap((p) => p.lastSession?.signals ?? [])),
  };
}

export type Report = ReturnType<typeof report>;

const tally = (xs: string[]) =>
  Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1])
    .map(([signal, players]) => ({ signal, players }));

/** a held string sent in pieces (../client's pieces(): key, key_2, key_3, …) put back together */
export function joined(p: Record<string, string | number | boolean>, key: string): string | undefined {
  const k = key.slice(0, 36);
  if (p[k] === undefined) return undefined;
  let text = String(p[k]);
  for (let i = 2; p[`${k}_${i}`] !== undefined; i++) text += String(p[`${k}_${i}`]);
  return text;
}
