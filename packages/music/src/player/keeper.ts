// A Web Audio context kept sounding: for the music's own (`context: "own"`)
// and for any a game shares with its sound effects (keepAlive).
//
// On Android over Bluetooth, a context's output opened again (on the app's
// return, or a wake after a sleep) can take over a second to start, and its
// first callback times out: the context says running, its time hardly
// moves, and a few seconds later the browser puts it to sleep itself. Nothing
// woke it until a sound asked again (David's Pixel, 5 Nov 2026: music, then
// sound effects, silent after coming back to Waddleberg; Pizza, 28 Oct). A
// second try opens at once. So the keeper:
//   - sleeps the context while the app's away, and wakes it on return,
//     unless a sleep was asked for (sleep / wake: the music stopped);
//   - never wakes it while the app's out of sight;
//   - watches each wake: a context whose time doesn't move, or that the
//     browser put to sleep unasked, is opened again 300 ms later, then 1, 2,
//     4 and 8 s, five tries at most.
//
// Each stall is reported (Annie, 5 Nov 2026): audio_stalled as it's found,
// then audio_revived or audio_revive_failed; at most 5 stalls a session.

export type AudioTrack = (event: string, props?: Record<string, string | number | boolean>) => void;
export type Keeper = {
  /** a sleep asked for (the music stopped): not woken on return, not revived */
  sleep(): void;
  /** awake again (now, or once the app's in sight), and watched as it opens */
  wake(): void;
  dispose(): void;
};
type Ctx = Pick<AudioContext, "state" | "currentTime" | "resume" | "suspend" | "addEventListener" | "removeEventListener"> & { outputLatency?: number };
type Doc = { hidden: boolean; addEventListener(e: string, f: () => void): void; removeEventListener(e: string, f: () => void): void };

/** the tries' waits: the first soon (a second open starts at once), then backing off */
export const REVIVE_MS = [300, 1000, 2000, 4000, 8000];
/** how long a wake is watched, and how far its time must move by then: an
 * output to Bluetooth may take 1.3 s to start (David's Pixel), and one that
 * failed has moved a few ms when the browser gives up on it, at about 3.5 s */
export const WATCH_MS = 3000;
const MOVED_S = 0.5;
const MAX_STALLS = 5;
let stalls = 0;
/** for tests: a new session */
export function newAudioSession() {
  stalls = 0;
}

/** `doc`: the game's own sense of away, if it's more than the page hidden
 * (Pizza's: also the app paused, and away until it knows it's seen, since
 * after an install Android starts the app behind the lock screen with the
 * page not hidden, Slice, 28 Oct 2026). `hidden` is true while away, and
 * "visibilitychange" fires as that changes. The player's own context gets
 * the player's (the page hidden, if the music pauses then, or any setAway). */
export function keepAlive(ctx: Ctx, o: { context: "music" | "sfx"; track?: AudioTrack; doc?: Doc }): Keeper {
  const doc = o.doc ?? (typeof document !== "undefined" ? (document as Doc) : undefined);
  const track = o.track ?? (() => {});
  const away = () => !!doc?.hidden;
  let asked = false; // a sleep asked for
  let watching = false;
  let after: "launch" | "return" | "resume" = "launch";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stall: { at: number; tries: number; reported: boolean } | null = null;

  function settle(how: "audio_revived" | "audio_revive_failed", error?: unknown) {
    if (stall?.reported)
      track(how, { context: o.context, ms: Math.round(performance.now() - stall.at), tries: stall.tries, ...(error instanceof Error ? { error: error.name } : {}) });
    stall = null;
  }

  // after a wake (or a try): its time must move, or it stalled
  function watch() {
    clearTimeout(timer);
    watching = true;
    const from = ctx.currentTime;
    timer = setTimeout(() => {
      watching = false;
      if (asked || away()) return;
      if (ctx.state === "running" && ctx.currentTime - from >= MOVED_S) return stall && settle("audio_revived");
      stalled(ctx.state === "running" ? "silent" : "suspended");
    }, WATCH_MS);
  }

  // a stall: reported once, then the next try
  function stalled(state: "silent" | "suspended") {
    if (!stall) {
      stall = { at: performance.now(), tries: 0, reported: stalls < MAX_STALLS };
      if (stall.reported) {
        stalls++;
        track("audio_stalled", { context: o.context, after, state, latencyMs: Math.round((ctx.outputLatency ?? 0) * 1000) });
      }
    }
    if (stall.tries >= REVIVE_MS.length) return settle("audio_revive_failed");
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (asked || away() || !stall) return;
      stall.tries++;
      try {
        // running silent: opened again, asleep then awake
        if (ctx.state === "running") await ctx.suspend();
        await ctx.resume();
      } catch (error) {
        if (stall.tries >= REVIVE_MS.length) return settle("audio_revive_failed", error);
      }
      watch();
    }, REVIVE_MS[stall.tries]);
  }

  function open() {
    if (asked || away()) return;
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
    watch();
  }

  // the browser put it to sleep, unasked (a watch running sees it too)
  const changed = () => {
    if (ctx.state === "suspended" && !asked && !away() && !stall) stalled("suspended");
  };
  // away: asleep (not asked: it wakes on return); back: awake
  let wasAway = away();
  const seen = () => {
    if (away() === wasAway) return; // told again: nothing changed
    wasAway = away();
    clearTimeout(timer);
    watching = false;
    stall = null;
    if (away()) {
      if (ctx.state === "running") void ctx.suspend().catch(() => {});
      return;
    }
    after = "return";
    open();
  };
  ctx.addEventListener("statechange", changed);
  doc?.addEventListener("visibilitychange", seen);

  return {
    sleep() {
      asked = true;
      after = "resume";
      clearTimeout(timer);
      watching = false;
      stall = null;
      if (ctx.state === "running") void ctx.suspend().catch(() => {});
    },
    wake() {
      // already awake and watched, or being revived: left to it
      if (!asked && (watching || stall)) return;
      asked = false;
      open();
    },
    dispose() {
      clearTimeout(timer);
      ctx.removeEventListener("statechange", changed);
      doc?.removeEventListener("visibilitychange", seen);
    },
  };
}
