// The music's own Web Audio context (`context: "own"`), and its sleep.
//
// Made on the touch that first plays the music; a browser may not count
// that touch, so later touches and keys try again until it's running
// (Waddleberg, 2026). A keeper (./keeper) wakes it on the app's return and
// revives it when its output fails to open.
//
// A running context sends sound to the device even when it's silence, and
// Android's Bluetooth counts that as playing: earbuds whose music was paused
// sent pause again rather than play (David, 5 Nov 2026). So the context
// sleeps the moment the player pauses, and a moment after the music stops
// by itself (longer than the quiet between songs); it wakes for the play.
import { keepAlive, type AudioTrack, type Keeper } from "./keeper.ts";
export { keepAlive, type Keeper };

type Still = { state(): { song: unknown; playing: boolean; paused: boolean }; subscribe(f: (s: { song: unknown; playing: boolean; paused: boolean }) => void): () => void };

/** how long the music may be stopped by itself before its context sleeps (longer than the quiet between songs) */
export const STILL_MS = 1500;

/** The music's own context: `get()` makes it (on the first play), with its keeper; `keeper()` is that, once it's made. */
export function ownContext(track?: AudioTrack, doc?: Parameters<typeof keepAlive>[1]["doc"]) {
  let context: AudioContext | null | undefined;
  let keeper: Keeper | null = null;
  return {
    keeper: () => keeper,
    get(): AudioContext | null {
      if (context !== undefined) return context;
      const Context = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
      context = Context ? new Context() : null;
      if (context) keeper = keepAlive(context, { context: "music", track, doc });
      if (context?.state === "suspended") {
        // a browser may not count the first touch: try again on the next ones
        const gestures = ["pointerup", "keydown"];
        const resume = () => {
          if (!context || context.state !== "suspended") return stop();
          void context.resume().then(() => context?.state === "running" && stop(), () => {});
        };
        const stop = () => gestures.forEach((g) => removeEventListener(g, resume, true));
        gestures.forEach((g) => addEventListener(g, resume, true));
        resume();
      }
      return context;
    },
  };
}

/** The context sleeps while the music's stopped and wakes for its play (see
 * above), through its keeper (keepAlive), so a sleep asked for is never
 * revived; returns the undo. The player does it for its own context; a game
 * whose context its sound effects share calls it with `busy`, true while
 * they may sound, so it never sleeps under them. */
export function stillWhenStopped(music: Still, keeper: () => Pick<Keeper, "sleep" | "wake"> | null | undefined, o: { ms?: number; busy?: () => boolean } = {}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return music.subscribe((s) => {
    const k = keeper();
    if (!k) return;
    clearTimeout(timer);
    // the player's play: awake before the song sounds
    if (s.playing || (!s.paused && s.song)) k.wake();
    const sleep = () => {
      if (music.state().playing) return;
      if (o.busy?.()) return void (timer = setTimeout(sleep, o.ms ?? STILL_MS));
      k.sleep();
    };
    if (s.paused) sleep();
    else if (!s.playing) timer = setTimeout(sleep, o.ms ?? STILL_MS);
  });
}
