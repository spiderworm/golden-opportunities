// The studio's music player (plans/music-player.md, David 29 Oct 2026: "a
// reusable thing available for all games"). It plays a game's songs in the
// queue's order (../queue), keeps the player's choices (../prefs), and tells
// the game's track() what the player did with it. The pop-up and the
// Settings panel (../ui) draw it; the game decides where and when.
//
// One <audio> element, so a song streams rather than being decoded whole
// into memory. Given the game's AudioContext, the element runs through Web
// Audio, so the game can put its own effects after it (Pizza's muffle while
// cutting) and the volume is a gain node; without one, the element's own
// volume.
//
// A game may have it carry on after a reload, a closed tab or a crash
// (`remember`), and keep its tabs as one app, heard in one of them, without
// playing over another app (`oneTab`, ../sync); Orbital Books does both
// (David, 30 and 31 Oct 2026).

import { createQueue, type QueuePlace, type Song } from "../queue/queue.ts";
import { createSync, type Shared, type SyncOptions } from "../sync/sync.ts";
import { loadPrefs, meetSongs, ordered, savePrefs, type Prefs } from "../prefs/prefs.ts";

export type { Song };
type Props = Record<string, string | number | boolean>;

/** Why a song started: by itself, the player's skip or back, or carried on
 * from before a reload (`remember`). */
export type Cause = "auto" | "skip" | "back" | "restored";
/** Where the player did it: the pop-up, the dock (the pop-up kept in a
 * game's sidebar) or the Settings panel. */
export type Where = "popup" | "dock" | "settings";

export type MusicOptions = {
  /** the app, from @tellim/platform's defineApp: what its data is kept under */
  app?: { id: string; storagePrefix: string };
  /** before `app`: the prefix for its storage keys, e.g. "cubeberg" (the app's wins) */
  key?: string;
  /** the game's songs; pinned ones first, in this order */
  songs: Song[];
  /** where `file` is found, e.g. BASE_URL + "music/" */
  base: string;
  /** the game's track() (@tellim/analytics) */
  track?: (event: string, props?: Props) => void;
  /** the quiet between songs (500 ms) */
  gapMs?: number;
  /** before the first song: time for Bluetooth headphones to wake (0) */
  leadMs?: number;
  /** the songs' level at full volume (0.55, as both games had it) */
  loudness?: number;
  /** the game's AudioContext, made on its first touch: music goes through Web Audio */
  context?: () => AudioContext | null | undefined;
  /** the game's effects: given the music's node, return the node to connect to the speakers */
  effects?: (ctx: AudioContext, music: AudioNode) => AudioNode;
  /** a volume from the game's old setting (0–1), read once if there's none yet */
  legacyVolume?: () => number | null;
  /** a save that failed (the game's own report) */
  saveFailed?: (key: string, error: unknown) => void;
  storage?: Pick<Storage, "getItem" | "setItem">;
  /** Carry on after a reload, a closed tab or a crash: the song, the place
   * in it, the queue, and a pause the player chose. A session last saved
   * longer ago than `maxAgeMs` (true: 6 hours) starts afresh, as an app
   * opening does: the pinned songs first again. */
  remember?: boolean | { maxAgeMs: number };
  /** The app's tabs are one app, and one tab is heard (../sync): the song,
   * the place, the pause and the playlist are the same in every tab, and the
   * tab the player is on plays. Another app on the host that's playing isn't
   * played over: this one doesn't start by itself, and the player's play
   * stops the other, or says it can't. */
  oneTab?: boolean | SyncOptions;
  /** Pause while the page is hidden (another tab, another desktop, the app
   * put away), and carry on when it's back: true, the default, as a game's
   * music should. A web app whose music is a backdrop keeps playing behind
   * other tabs with false, or decides each time the page hides with a
   * function: Orbital Books keeps it on phones only (David, 31 Oct 2026). */
  pauseWhenHidden?: boolean | (() => boolean);
};

/** The place saved for `remember`. */
type Session = { at: number; id: string; t: number; paused: boolean; place: QueuePlace };
const SIX_HOURS = 6 * 60 * 60 * 1000;

export type MusicState = {
  song: Song | null;
  playing: boolean;
  volume: number;
  /** the game has hushed it (setQuiet) */
  quiet: boolean;
  /** another app has the music (oneTab): play takes it */
  elsewhere: boolean;
};

export function createMusic(o: MusicOptions) {
  const key = o.app?.storagePrefix ?? o.key;
  if (!key) throw new Error("createMusic: give the app (or a key)");
  const store = o.storage ?? (() => { try { return globalThis.localStorage; } catch { return undefined; } })();
  const track = o.track ?? (() => {});
  const gapMs = o.gapMs ?? 500;
  const loudness = o.loudness ?? 0.55;
  let prefs: Prefs = meetSongs(loadPrefs(key, store, o.legacyVolume), o.songs.map((s) => s.id));
  const save = () => savePrefs(key, store, prefs, o.saveFailed);
  save();

  const ids = o.songs.map((s) => s.id);
  const queue = createQueue(o.songs, {
    excluded: (id) => prefs.excluded.includes(id),
    fresh: (id) => prefs.fresh.includes(id),
    order: () => ordered(prefs, ids),
    shuffled: () => prefs.shuffle,
  });
  const sync = o.oneTab && typeof window !== "undefined" ? createSync(o.app?.id ?? key, typeof o.oneTab === "object" ? o.oneTab : {}) : null;
  const deck = new Audio();
  deck.preload = "auto";
  let wired: { gain: GainNode } | null = null;
  let song: Song | null = null;
  let cause: Cause = "auto";
  let by: Where | undefined; // where the skip or back was
  let loaded = false; // the deck has the current song's file
  let started = false; // the player has touched the page
  let paused = false; // the player paused it
  let yielded = false; // another app has the music (oneTab): only the player's play takes it
  let sounding = false; // this tab is the one heard (oneTab)
  let resumeAt = 0; // seconds into the song restored (remember)
  let quiet = false; // the game hushed it
  // Why the game is away, by reason: no sound starts while any is set.
  // Visibility alone misses some: after an update, Android relaunches the
  // app behind the lock screen, "visible", and Pizza's theme played with
  // David's screen off (Slice, 29 Oct 2026).
  const away = new Set<string>();
  let wait = 0; // the gap's (or the lead's) timer
  let announced: Song | null = null;
  const listeners = new Set<(s: MusicState) => void>();
  const songListeners = new Set<(song: Song, cause: Cause) => void>();

  const hidden = () =>
    typeof document !== "undefined" && document.hidden && (typeof o.pauseWhenHidden === "function" ? o.pauseWhenHidden() : o.pauseWhenHidden !== false);
  const level = () => prefs.volume ** 2 * loudness; // squared, so the slider feels even
  const audible = () => prefs.volume > 0 && !quiet && !paused && !yielded && started && !away.size && !hidden();
  // with the app's tabs together, playing is the app's: a tab not heard shows what the heard one does
  const playing = () => !!song && (sync && !sounding ? !paused && !yielded && !!sync.latest()?.running : !deck.paused);
  const state = (): MusicState => ({ song, playing: playing(), volume: prefs.volume, quiet, elsewhere: yielded });
  const changed = () => listeners.forEach((f) => f(state()));

  function wire() {
    if (wired || !o.context) return;
    const ctx = o.context();
    if (!ctx) return;
    const source = ctx.createMediaElementSource(deck);
    const gain = ctx.createGain();
    gain.gain.value = level();
    source.connect(gain);
    (o.effects ? o.effects(ctx, gain) : gain).connect(ctx.destination);
    deck.volume = 1;
    wired = { gain };
  }

  function setLevel() {
    if (wired) wired.gain.gain.setTargetAtTime(level(), wired.gain.context.currentTime, 0.05);
    else deck.volume = Math.min(1, level());
  }
  // the player's level from the start: without Web Audio (or before it's
  // wired), the element plays at its own volume, 1 until told otherwise
  // (Audit, via Goldy, 30 Oct 2026)
  setLevel();

  // play (or carry on with) the current song, if it may be heard
  function play() {
    if (!audible() || wait) return;
    if (sync) {
      // another app playing: this one doesn't start by itself
      if (!sounding && !sync.heardHere() && sync.elsewhere()) return yieldTo("held_back");
      // another tab of the app is the one to be heard
      if (!sync.chosen()) return;
      // from where the app's music is now, not where this tab last had it
      if (!sounding && song) {
        const t = now();
        if (!loaded) resumeAt = t;
        else if (Math.abs(t - deck.currentTime) > 1.5) deck.currentTime = t;
      }
    }
    if (!song) return advance("auto", o.leadMs ?? 0);
    wire();
    if (!loaded) {
      deck.src = o.base + song.file;
      loaded = true;
      if (resumeAt) {
        const at = resumeAt;
        deck.addEventListener("loadedmetadata", () => (deck.currentTime = at), { once: true });
      }
      resumeAt = 0;
    }
    deck.play().catch(() => {});
  }

  // another app has the music: stop, and wait for the player's own play
  function yieldTo(why: "held_back" | "taken") {
    if (yielded) return;
    yielded = true;
    deck.pause();
    share(false); // where it stopped, before it's no longer this tab's
    quietHere();
    track("music_other_tab", { action: why });
    changed();
  }

  // remember: where it is, saved by the tab that has the music
  const rememberFor = o.remember ? (typeof o.remember === "object" ? o.remember.maxAgeMs : SIX_HOURS) : 0;
  const sessionKey = `${key}.music.session`;
  function remember() {
    if (!rememberFor || !song) return;
    const s: Session = { at: Date.now(), id: song.id, t: Math.round(now()), paused, place: queue.place() };
    try {
      store?.setItem(sessionKey, JSON.stringify(s));
    } catch (error) {
      o.saveFailed?.(sessionKey, error);
    }
  }
  // carry on from the place saved (on load, and from the tab whose music
  // this one takes: it saves its place as it lets go)
  function restore() {
    try {
      const s = JSON.parse(store?.getItem(sessionKey) ?? "null") as Session | null;
      if (s && Date.now() - s.at < rememberFor && o.songs.some((x) => x.id === s.id)) {
        // the song this tab has loaded: on to the place, without reloading (or announcing) it
        if (loaded && song?.id === s.id) {
          queue.resume(s.place);
          if (Math.abs(s.t - deck.currentTime) >= 1) deck.currentTime = Math.max(0, Number(s.t) || 0);
          return void (paused = s.paused === true);
        }
        queue.resume(s.place);
        if (queue.current()?.id === s.id) {
          song = queue.current();
          cause = "restored";
          announced = null;
          loaded = false;
          resumeAt = Math.max(0, Number(s.t) || 0);
          paused = s.paused === true;
        }
      }
    } catch {}
  }
  if (rememberFor) {
    restore();
    let last = 0;
    deck.addEventListener("timeupdate", () => {
      if (Date.now() - last < 5000) return;
      last = Date.now();
      remember();
      if (sounding) share();
    });
    if (typeof addEventListener !== "undefined") addEventListener("pagehide", remember);
  }

  // seconds into the song: the deck's, or, in a tab not heard, the heard tab's as last shared
  function now() {
    const l = sync?.latest();
    if (sync && !sounding && l && l.id === song?.id) return l.t + (l.running ? (Date.now() - l.at) / 1000 : 0);
    return deck.currentTime || resumeAt;
  }

  // The app's tabs together (oneTab): what changes here, every tab has.
  function share(running = sounding && !paused && !yielded) {
    if (!sync) return;
    sync.share({ id: song?.id ?? null, place: song ? queue.place() : null, t: now(), at: Date.now(), running, paused, held: yielded });
  }
  // this tab stops being the one heard
  function quietHere() {
    if (!sounding) return;
    sounding = false;
    sync?.heard(false);
  }
  // what another tab of the app changed
  function follow(s: Shared) {
    if (s.id && s.id !== song?.id) {
      const to = o.songs.find((x) => x.id === s.id);
      if (to) {
        if (s.place) queue.resume(s.place);
        song = queue.current()?.id === s.id ? queue.current() : to;
        announced = song; // it started in that tab
        loaded = false;
        clearTimeout(wait);
        wait = 0;
        deck.pause();
        deck.removeAttribute("src");
        quietHere();
      }
    } else if (s.place) queue.resume(s.place);
    resumeAt = Math.max(0, s.t + (s.running ? (Date.now() - s.at) / 1000 : 0));
    // the heard tab's place, if it moved (back to the top, say)
    if (sounding && loaded && Math.abs(resumeAt - deck.currentTime) > 1.5 && s.by !== sync?.tab) deck.currentTime = resumeAt;
    // the app plays (in another tab, or did, out of sight): this one may carry it on
    if (s.id && !s.paused && !s.held && !sounding) started = true;
    paused = s.paused;
    yielded = s.held;
    if (paused || yielded) {
      deck.pause();
      quietHere();
    }
    steer();
    changed();
  }
  // which tab is heard: this one, if it's the one, and may be
  function steer() {
    if (!sync) return;
    if (audible() && sync.chosen()) {
      if (!sounding || deck.paused) play();
      return;
    }
    // it may not be heard here (hidden, put away, hushed, paused): stop. If
    // only another tab should be heard, play on until that one is.
    if (sounding && !audible()) {
      deck.pause();
      share(false);
      quietHere();
      changed();
    }
  }
  if (sync) {
    sync.onShared(follow);
    sync.onSteer(steer);
    sync.onTook(() => {
      deck.pause();
      quietHere();
      changed();
    });
    // another app's player pressed play: this app stops, and waits for its player's play
    sync.onStopAsked((from) => {
      yieldTo("taken");
      sync.stopped(from);
    });
    deck.addEventListener("playing", () => {
      if (!sounding) {
        sounding = true;
        sync.heard(true);
      }
      share();
    });
    // where this tab stands: seen, used, allowed to play out of sight
    const behind = () => (typeof o.pauseWhenHidden === "function" ? !o.pauseWhenHidden() : o.pauseWhenHidden === false);
    const stand = (used: boolean) => sync.stand({ visible: !document.hidden, behind: behind(), ...(used ? { at: Date.now() } : {}) });
    stand(!document.hidden);
    document.addEventListener("visibilitychange", () => (stand(!document.hidden), steer()));
    addEventListener("focus", () => (stand(true), steer()));
    for (const g of ["pointerdown", "keydown"]) addEventListener(g, () => stand(true), true);
    // the playlist, hearts and volume chosen in another tab
    addEventListener("storage", (e) => {
      if (e.key !== `${key}.music` || !e.newValue) return;
      prefs = meetSongs(loadPrefs(key, store, o.legacyVolume), ids);
      setLevel();
      steer();
      changed();
    });
    addEventListener("pagehide", () => {
      if (!sounding) return;
      deck.pause();
      share(false);
      quietHere();
    });
  }

  // the player's own play (or skip, or back): stop another app playing
  // first; false if it wouldn't
  async function take(): Promise<boolean> {
    if (!sync) return true;
    sync.stand({ at: Date.now() });
    const was = yielded;
    if (sync.elsewhere() && !(await sync.stopOthers())) {
      track("music_other_tab", { action: "blocked" });
      blockedListeners.forEach((f) => f());
      return false;
    }
    if (was) track("music_other_tab", { action: "took_over" });
    yielded = false;
    return true;
  }
  const blockedListeners = new Set<() => void>();
  // do it now (in the tap, which a browser may need to start sound), or once another app has stopped
  function withMusic(f: () => void): Promise<boolean> {
    if (!sync || !sync.elsewhere()) {
      sync?.stand({ at: Date.now() });
      yielded = false;
      return (f(), share(), Promise.resolve(true));
    }
    return take().then((ok) => (ok && (f(), share()), ok));
  }

  /** the end of the current song, for analytics */
  function finish(how: "finished" | "skipped" | "back") {
    if (!song || !announced) return;
    track("song_ended", { id: song.id, how, at_s: Math.round(deck.currentTime), length_s: Math.round(deck.duration || 0) });
  }

  // on to the next song (or back to the last), after `delay` ms
  function advance(why: Cause, delay: number, to = why === "back" ? queue.back() : queue.next(), where?: Where) {
    if (!to) {
      song = null;
      deck.pause();
      changed();
      return;
    }
    song = to;
    cause = why;
    by = where;
    announced = null;
    loaded = false;
    resumeAt = 0;
    deck.pause();
    deck.removeAttribute("src");
    clearTimeout(wait);
    wait = 0;
    share();
    changed();
    if (delay > 0) {
      wait = window.setTimeout(() => {
        wait = 0;
        play();
      }, delay);
    } else play();
  }

  deck.addEventListener("ended", () => {
    finish("finished");
    advance("auto", gapMs);
  });
  deck.addEventListener("playing", () => {
    changed();
    // a carry-on after a pause isn't a new song
    if (!song || announced === song) return;
    announced = song;
    failures = 0;
    if (prefs.fresh.includes(song.id)) {
      prefs = { ...prefs, fresh: prefs.fresh.filter((id) => id !== song!.id) };
      save();
    }
    track("song_started", { id: song.id, pinned: !!song.pinned, index: queue.count(), cause, ...(by ? { where: by } : {}) });
    remember();
    songListeners.forEach((f) => f(song!, cause));
  });
  deck.addEventListener("pause", changed);
  // a song that won't load is skipped; when none will (offline, say), it stops
  let failures = 0;
  deck.addEventListener("error", () => {
    if (!song || !loaded) return;
    if (++failures >= o.songs.length) return void (song = null, changed());
    advance("auto", gapMs);
  });

  // A phone doesn't count a finger going down as a gesture that may start
  // sound, only one lifting (and a browser can refuse the first try anyway),
  // so every touch and key tries until the music is playing (Waddleberg,
  // David 13 Oct 2026).
  if (typeof addEventListener !== "undefined") {
    const gestures = ["pointerdown", "pointerup", "keydown"];
    const start = () => {
      started = true;
      play();
    };
    for (const g of gestures) addEventListener(g, start, true);
    deck.addEventListener("playing", () => gestures.forEach((g) => removeEventListener(g, start, true)), { once: true });
    if (!sync) document.addEventListener("visibilitychange", () => (hidden() ? deck.pause() : play()));
  }

  const has = (list: string[], id: string) => list.includes(id);
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

  return {
    songs: o.songs,
    state,
    /** called with the state whenever it changes; returns the unsubscribe */
    subscribe(f: (s: MusicState) => void) {
      listeners.add(f);
      return () => void listeners.delete(f);
    },
    /** a song has started (not carried on after a pause): the pop-up shows it */
    onSong(f: (song: Song, cause: Cause) => void) {
      songListeners.add(f);
      return () => void songListeners.delete(f);
    },

    pause(where: Where) {
      if (paused || !song) return;
      paused = true;
      deck.pause();
      track("music_paused", { id: song.id, where });
      remember();
      share();
      quietHere();
      changed();
    },
    /** the player's play: after their pause, or with another tab's music
     * (oneTab), which it takes; false if that tab wouldn't let go */
    resume(where: Where): Promise<boolean> {
      if (!paused && !yielded) return Promise.resolve(true);
      return withMusic(() => {
        started = true;
        if (paused && song) track("music_resumed", { id: song.id, where });
        paused = false;
        play();
        remember();
        changed();
      });
    },
    skip(where: Where): Promise<boolean> {
      return withMusic(() => {
        finish("skipped");
        paused = false;
        advance("skip", 0, undefined, where);
      });
    },
    /** more than 3 s in: the song from the top; else the one before */
    back(where: Where): Promise<boolean> {
      return withMusic(() => {
        paused = false;
        if (song && (deck.currentTime > 3 || queue.count() < 2)) {
          track("song_restarted", { id: song.id, at_s: Math.round(deck.currentTime), where });
          deck.currentTime = 0;
          play();
          changed();
          return;
        }
        finish("back");
        advance("back", 0, undefined, where);
      });
    },
    /** another tab wouldn't let go of the music when the player asked (oneTab):
     * the pop-up and panel say so */
    onBlocked(f: () => void) {
      blockedListeners.add(f);
      return () => void blockedListeners.delete(f);
    },

    /** the music volume, 0 (Mute) to 1: the game's music volume setting */
    volume: () => prefs.volume,
    setVolume(v: number) {
      prefs = { ...prefs, volume: Math.min(1, Math.max(0, v)) };
      save();
      setLevel();
      if (prefs.volume > 0) play();
      else deck.pause();
      steer();
      changed();
    },
    /** the slider has settled: one event, not one a step */
    volumeSettled(where: Where) {
      track("music_volume_set", { level: Math.round(prefs.volume * 20) * 5, where });
    },

    excluded: (id: string) => has(prefs.excluded, id),
    setExcluded(id: string, out: boolean, where: Where) {
      if (has(prefs.excluded, id) === out) return;
      prefs = { ...prefs, excluded: toggle(prefs.excluded, id, out) };
      save();
      const s = o.songs.find((x) => x.id === id);
      track(out ? "song_excluded" : "song_included", { id, pinned: !!s?.pinned, where });
      // excluding the song that's playing moves on; including one when
      // nothing could play starts the music again
      if (out && song?.id === id) {
        finish("skipped");
        advance("skip", 0, undefined, where);
      } else if (!out && !song) play();
      changed();
    },
    /** every song is excluded: there's no music, whatever the volume */
    allExcluded: () => o.songs.every((s) => has(prefs.excluded, s.id)),

    hearted: (id: string) => has(prefs.hearted, id),
    setHearted(id: string, on: boolean, where: Where) {
      if (has(prefs.hearted, id) === on) return;
      prefs = { ...prefs, hearted: toggle(prefs.hearted, id, on) };
      save();
      track(on ? "song_hearted" : "song_unhearted", { id, where });
      changed();
    },

    /** The playlist as the player has it: every song, in their order. */
    playlist: (): Song[] => ordered(prefs, ids).map((id) => o.songs.find((s) => s.id === id)!),
    /** the player dragged `id` to place `to` (0 the top) */
    move(id: string, to: number, where: Where) {
      const list = ordered(prefs, ids);
      const from = list.indexOf(id);
      if (from < 0 || from === to) return;
      list.splice(from, 1);
      list.splice(Math.max(0, Math.min(to, list.length)), 0, id);
      prefs = { ...prefs, order: list };
      save();
      track("song_moved", { id, from, to, where });
      changed();
    },
    /** The playlist opens: songs switched off go to the bottom, in the order
     * they were (David, 29 Oct 2026: "Every time the playlist is opened"). */
    sinkExcluded() {
      const list = ordered(prefs, ids);
      const sunk = [...list.filter((id) => !has(prefs.excluded, id)), ...list.filter((id) => has(prefs.excluded, id))];
      if (sunk.join() === list.join()) return;
      prefs = { ...prefs, order: sunk };
      save();
      changed();
    },
    /** a fresh shuffle each open (true), or the playlist's order */
    shuffle: () => prefs.shuffle,
    setShuffle(on: boolean, where: Where) {
      if (prefs.shuffle === on) return;
      prefs = { ...prefs, shuffle: on };
      save();
      track("music_shuffle_set", { on, where });
      changed();
    },

    /** new since the last update, not yet played */
    fresh: (id: string) => has(prefs.fresh, id),

    /** The game may start the music itself, with no touch: in the native
     * app, where sound needs no gesture, once the game is actually seen. */
    start() {
      started = true;
      play();
    },
    /** The game is away for `reason` (the app in the background, the screen
     * locked) or back: nothing plays while any reason is set. */
    setAway(reason: string, on: boolean) {
      if (on) away.add(reason);
      else away.delete(reason);
      if (away.size) deck.pause();
      else play();
      steer();
      changed();
    },
    /** the game hushes the music (Pizza's "quiet") or lets it play again */
    setQuiet(on: boolean) {
      quiet = on;
      if (on) deck.pause();
      else play();
      steer();
      changed();
    },
    /** seconds into the song playing (Pizza's title follows the theme's hits) */
    time: () => now(),
    /** the panel or pop-up opened */
    opened(from: Where) {
      track("music_player_opened", { from });
    },
  };
}

export type Music = ReturnType<typeof createMusic>;
