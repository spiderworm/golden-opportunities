// An app's tabs are one app (David, 31 Oct 2026): one song, one place in it,
// one pause, one playlist, kept in step over the app's own channel, and only
// one tab heard: the one the player is on (the visible tab used last), or,
// with none in sight and the app allowed to play out of sight, the tab used
// last. The tab that should be heard starts from the place shared and says
// so once it's sounding; only then does the tab heard before stop, so a tab
// the browser won't let play yet doesn't leave the music silent.
//
// Apps are told apart by id (@tellim/platform). The tab heard holds a Web
// Lock in the app's name, so any app on the host knows whether another is
// playing (a crashed tab's lock goes with it), and asks it to stop over one
// channel the studio's apps share: an app opening while another plays
// doesn't start by itself; the player's play stops the other, which waits for
// its own player's play; one that doesn't answer keeps playing, and the
// player is told. A browser shows a page only its own host's tabs and locks,
// so an app elsewhere is never known.
import type { QueuePlace } from "../queue/queue.ts";

/** The music as every tab of the app has it. */
export type Shared = {
  /** newer wins: when it was made, then the tab, to break a tie */
  rev: number;
  by: string;
  id: string | null;
  place: QueuePlace | null;
  /** seconds into the song at `at` (ms), going on from there while `running` */
  t: number;
  at: number;
  /** a tab is sounding it */
  running: boolean;
  /** the player paused it */
  paused: boolean;
  /** another app has the music: only the player's play takes it back */
  held: boolean;
};

/** Where a tab stands, for which is heard. */
export type Standing = { at: number; visible: boolean; behind: boolean };

export type SyncOptions = {
  /** how long another app asked to stop has to answer (800 ms) */
  timeoutMs?: number;
  /** the browser's (default), or null: none, as where there are none */
  locks?: LockManager | null;
  channel?: (name: string) => Channel;
  /** this tab's id (random) */
  tab?: string;
  now?: () => number;
};
type Channel = Pick<BroadcastChannel, "postMessage" | "close"> & { onmessage: ((e: MessageEvent) => void) | null };

const V = 1; // the messages' shape: a tab of another shape is another app
export const STUDIO_MUSIC = "tellim.music";
const heardLock = (app: string) => `tellim.${app}.music.heard`;
const tabLock = (app: string, tab: string) => `tellim.${app}.music.tab.${tab}`;

type Msg =
  | { v: number; tab: string; kind: "hi" | "me"; standing: Standing; shared?: Shared }
  | { v: number; tab: string; kind: "bye" }
  | { v: number; tab: string; kind: "state"; shared: Shared }
  | { v: number; tab: string; kind: "took" };
type StudioMsg = { v: number; app: string; tab: string; kind: "stop" | "stopped" | "heard" | "quiet"; to?: string };

export const newer = (a: Shared, b: Shared | null) => !b || a.rev > b.rev || (a.rev === b.rev && a.by > b.by);

export function createSync(app: string, o: SyncOptions = {}) {
  const now = o.now ?? Date.now;
  const tab = o.tab ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  const locks = o.locks !== undefined ? o.locks : typeof navigator !== "undefined" ? navigator.locks : undefined;
  const make = o.channel ?? (typeof BroadcastChannel !== "undefined" ? (n: string) => new BroadcastChannel(n) : undefined);
  const timeoutMs = o.timeoutMs ?? 800;
  const mine = locks && make ? make(`tellim.${app}.music`) : undefined;
  const studio = locks && make ? make(STUDIO_MUSIC) : undefined;

  let standing: Standing = { at: now(), visible: true, behind: false };
  const peers = new Map<string, Standing>();
  let heard = false; // this tab is sounding the music
  let heardBy: string | null = null; // the tab of this app heard, as last known
  let otherApps = new Set<string>(); // apps heard on the host, as last known
  let letGo: (() => void) | null = null; // lets go of the heard lock
  let asking = false; // the heard lock is asked for
  let stopAsked: ((from: string) => void) | null = null;
  const waiting = new Map<string, () => void>(); // apps asked to stop, by app
  const onShared = new Set<(s: Shared) => void>();
  const onTook = new Set<() => void>();
  const onSteer = new Set<() => void>();
  let latest: Shared | null = null;
  const steer = () => onSteer.forEach((f) => f());

  const post = (m: Msg extends infer M ? (M extends Msg ? Omit<M, "v" | "tab"> : never) : never) => mine?.postMessage({ ...m, v: V, tab });
  const tell = (m: Omit<StudioMsg, "v" | "app" | "tab">) => studio?.postMessage({ ...m, v: V, app, tab });

  // this tab's own lock, for its life: how the others know it's still there
  let gone = () => {};
  void locks?.request(tabLock(app, tab), () => new Promise<void>((r) => (gone = r))).catch(() => {});

  if (mine)
    mine.onmessage = (e) => {
      const m = e.data as Msg;
      if (!m || m.v !== V || m.tab === tab) return;
      if (m.kind === "bye") {
        peers.delete(m.tab);
        if (heardBy === m.tab) heardBy = null;
      } else if (m.kind === "hi" || m.kind === "me") {
        peers.set(m.tab, m.standing);
        if (m.shared) take(m.shared);
        if (m.kind === "hi") post({ kind: "me", standing, shared: latest ?? undefined });
      } else if (m.kind === "state") take(m.shared);
      else if (m.kind === "took") {
        heardBy = m.tab;
        if (heard) onTook.forEach((f) => f());
      }
      steer();
    };
  function take(s: Shared) {
    if (!newer(s, latest)) return;
    latest = s;
    onShared.forEach((f) => f(s));
  }

  if (studio)
    studio.onmessage = (e) => {
      const m = e.data as StudioMsg;
      if (!m || m.v !== V || m.app === app) return;
      if (m.kind === "heard") otherApps.add(m.app);
      if (m.kind === "quiet") otherApps.delete(m.app);
      if (m.kind === "stop" && m.to === app && heard) stopAsked?.(m.app);
      if (m.kind === "stopped" && m.to === app) {
        otherApps.delete(m.app);
        waiting.get(m.app)?.();
      }
      steer();
    };

  // what the locks say: the tabs still there, and the apps heard
  async function look() {
    if (!locks) return;
    try {
      const names = ((await locks.query()).held ?? []).map((l) => l.name ?? "");
      for (const t of peers.keys()) if (!names.includes(tabLock(app, t))) peers.delete(t);
      if (heardBy && heardBy !== tab && !names.includes(heardLock(app))) heardBy = null;
      otherApps = new Set(names.filter((n) => n.startsWith("tellim.") && n.endsWith(".music.heard") && n !== heardLock(app)).map((n) => n.slice(7, -12)));
      steer();
    } catch {}
  }
  void look();
  // a crashed tab says nothing: every few seconds, the locks are asked
  const timer = locks ? setInterval(() => void look(), 3000) : undefined;
  (timer as { unref?: () => void } | undefined)?.unref?.(); // Node, in tests: not kept alive by it

  post({ kind: "hi", standing });
  const bye = () => post({ kind: "bye" });
  if (typeof addEventListener !== "undefined") addEventListener("pagehide", bye);

  return {
    tab,
    /** another tab of the app is known: they're kept in step */
    together: () => peers.size > 0,
    /** this tab should be the one heard: the visible tab used last, or with none
     * in sight, the one used last that may play out of sight */
    chosen(): boolean {
      const all = [...peers.entries(), [tab, standing] as const];
      const seen = all.filter(([, s]) => s.visible);
      const pool = seen.length ? seen : all.filter(([, s]) => s.behind);
      if (!pool.length) return false;
      const best = pool.reduce((a, b) => (b[1].at > a[1].at || (b[1].at === a[1].at && b[0] > a[0]) ? b : a));
      return best[0] === tab;
    },
    /** where this tab stands changed (seen or not, used, allowed out of sight) */
    stand(s: Partial<Standing>) {
      const next = { ...standing, ...s };
      if (next.at === standing.at && next.visible === standing.visible && next.behind === standing.behind) return;
      standing = next;
      post({ kind: "me", standing });
    },
    /** the music changed here: every tab of the app has it */
    share(s: Omit<Shared, "rev" | "by">) {
      const full = { ...s, rev: Math.max(now(), (latest?.rev ?? 0) + 1), by: tab };
      latest = full;
      post({ kind: "state", shared: full });
      return full;
    },
    latest: () => latest,
    onShared(f: (s: Shared) => void) {
      onShared.add(f);
    },
    /** this tab is sounding the music (true), or has stopped (false) */
    heard(on: boolean) {
      if (on === heard) return;
      heard = on;
      if (on) {
        heardBy = tab;
        post({ kind: "took" });
        tell({ kind: "heard" });
        if (locks && !letGo && !asking) {
          asking = true;
          void locks
            .request(heardLock(app), () => {
              asking = false;
              // stopped again before the lock came: let it go at once
              return heard ? new Promise<void>((r) => (letGo = r)) : undefined;
            })
            .catch(() => (asking = false));
        }
      } else {
        if (heardBy === tab) heardBy = null;
        letGo?.();
        letGo = null;
        tell({ kind: "quiet" });
      }
    },
    /** another tab of the app is heard now: this one stops */
    onTook(f: () => void) {
      onTook.add(f);
    },
    /** a tab of the app is heard, as last known */
    heardHere: () => heard || heardBy !== null,
    /** another app on the host is playing, as last known (no waiting) */
    elsewhere: () => otherApps.size > 0,
    /** the player's play: ask the other apps playing to stop; false if one
     * didn't answer in time */
    async stopOthers(): Promise<boolean> {
      await look();
      const them = [...otherApps];
      if (!them.length) return true;
      const answers = them.map(
        (other) =>
          new Promise<boolean>((resolve) => {
            const t = setTimeout(() => (waiting.delete(other), resolve(false)), timeoutMs);
            waiting.set(other, () => (clearTimeout(t), waiting.delete(other), resolve(true)));
            tell({ kind: "stop", to: other });
          }),
      );
      return (await Promise.all(answers)).every(Boolean);
    },
    /** another app's player pressed play: this app stops (not the player's pause) */
    onStopAsked(f: (from: string) => void) {
      stopAsked = f;
    },
    /** this app has stopped as `from` asked */
    stopped(from: string) {
      tell({ kind: "stopped", to: from });
    },
    /** something that decides which tab is heard changed */
    onSteer(f: () => void) {
      onSteer.add(f);
    },
    dispose() {
      clearInterval(timer);
      bye();
      if (typeof removeEventListener !== "undefined") removeEventListener("pagehide", bye);
      letGo?.();
      gone();
      mine?.close();
      studio?.close();
    },
  };
}

export type Sync = ReturnType<typeof createSync>;
