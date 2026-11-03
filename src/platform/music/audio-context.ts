// The music's Web Audio context, as Pizza gives it one. Through it the player
// sets its level with a gain node, smoothly as the slider moves, and a game
// could add its own effects after it. Made only when the player first plays,
// which is on a tap or key press, so no sound starts before one. Without Web
// Audio the player falls back to the <audio> element's own volume.

let context: AudioContext | null | undefined;

/** The one context, made on first use; null where the browser has no Web Audio. */
export function musicContext(): AudioContext | null {
  if (context !== undefined) return context;
  const Context = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  context = Context ? new Context() : null;
  if (context?.state === "suspended") {
    // A browser may not count the first touch as leave to play: try again on the next ones.
    const resume = () => {
      if (!context || context.state !== "suspended") return stop();
      void context.resume().then(
        () => context?.state === "running" && stop(),
        () => {},
      );
    };
    const stop = () =>
      ["pointerup", "keydown"].forEach((g) => removeEventListener(g, resume, true));
    ["pointerup", "keydown"].forEach((g) => addEventListener(g, resume, true));
    resume();
  }
  return context;
}

/** For tests: forget the context. */
export function resetMusicContext(): void {
  context = undefined;
}
