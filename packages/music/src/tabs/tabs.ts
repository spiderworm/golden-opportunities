// One tab of a game plays at a time (David, 30 Oct 2026: "prevent two tabs
// to be playing music at the same time, if we can help it"). The tab that
// has the music holds a Web Lock, which the browser lets go of when the tab
// closes or crashes, so a dead tab never stands in the way. A tab that wants
// the music asks the holder over a BroadcastChannel to stop, then waits a
// moment for the lock. A tab that won't let go (an older build, say) keeps
// it, and the asking tab says so rather than playing over it. Without Web
// Locks (another site, an old browser) nothing is known, and it just plays.
//
// Starting sound must happen in the player's tap itself (Safari), so whether
// another tab has the music is known ahead, without waiting: asked of the
// locks when made and whenever the tab comes back to the front, and kept up
// by the tabs saying "have" and "free" as they take and let go.

export type TabsOptions = {
  /** how long a tab asked to stop has to let go (800 ms) */
  timeoutMs?: number;
  /** the browser's (default), or null: none, as where there are none */
  locks?: LockManager | null;
  channel?: (name: string) => Pick<BroadcastChannel, "postMessage" | "close"> & { onmessage: ((e: MessageEvent) => void) | null };
};

export function createTabs(key: string, o: TabsOptions = {}) {
  const name = `${key}.music.playing`;
  const locks = o.locks !== undefined ? o.locks : typeof navigator !== "undefined" ? navigator.locks : undefined;
  const make = o.channel ?? (typeof BroadcastChannel !== "undefined" ? (n: string) => new BroadcastChannel(n) : undefined);
  const channel = locks && make ? make(name) : undefined;
  const timeoutMs = o.timeoutMs ?? 800;
  let held: (() => void) | null = null; // lets go of the lock
  let taken = () => {};
  let other = false; // another tab has the music, as last known
  let asking: Promise<boolean> | null = null; // a request this tab is waiting on

  if (channel)
    channel.onmessage = (e) => {
      if (e.data === "have") other = true;
      if (e.data === "free") other = false;
      if (e.data !== "take" || !held) return;
      taken();
      release();
    };
  const ask = () =>
    void locks
      ?.query()
      .then((state) => (other = !held && !!state.held?.some((l) => l.name === name)))
      .catch(() => {});
  ask();
  if (locks && typeof document !== "undefined") document.addEventListener("visibilitychange", () => !document.hidden && ask());

  // ask for the lock; true once it's ours. One request at a time: a tap
  // tries to start the music more than once, and mustn't find the lock
  // "taken" by its own first try.
  function hold(options: LockOptions): Promise<boolean> {
    if (asking) return asking;
    asking = new Promise<boolean>((resolve) => {
      locks!
        .request(name, options, (lock) => {
          if (!lock) return resolve(false); // ifAvailable, and it wasn't
          other = false;
          channel?.postMessage("have");
          resolve(true);
          return new Promise<void>((let_go) => (held = let_go));
        })
        .catch(() => resolve(false)); // timed out
    }).finally(() => (asking = null));
    return asking;
  }

  function release() {
    if (!held) return;
    held();
    held = null;
    channel?.postMessage("free");
  }

  return {
    /** another tab of the game has the music, as last known (no waiting) */
    elsewhere: () => !held && other,
    /** this tab has the music */
    mine: () => !!held,
    /** the music is ours if no other tab has it (it isn't taken from one) */
    async claimIfFree(): Promise<boolean> {
      if (!locks || held) return true;
      return hold({ ifAvailable: true });
    },
    /** the music once no tab has it, without asking any to stop (a tab
     * that shows, as the one it took over from hides): false if none let go
     * in time */
    async claimWhenFree(): Promise<boolean> {
      if (!locks || held) return true;
      return hold({ signal: AbortSignal.timeout(timeoutMs) });
    },
    /** take the music from any other tab: true once it's ours, false if
     * the tab that has it didn't let go in time */
    async claim(): Promise<boolean> {
      if (!locks || held) return true;
      if (await hold({ ifAvailable: true })) return true;
      if (held) return true;
      channel!.postMessage("take");
      return hold({ signal: AbortSignal.timeout(timeoutMs) });
    },
    /** this tab has stopped playing (the player paused it, or it's hidden): let go */
    release,
    /** another tab took the music: stop */
    onTaken(f: () => void) {
      taken = f;
    },
    dispose() {
      release();
      channel?.close();
    },
  };
}

export type Tabs = ReturnType<typeof createTabs>;
