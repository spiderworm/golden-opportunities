// The device's own controls (David, 2 Nov 2026): a keyboard's media keys,
// headphones' and Bluetooth buttons, the lock screen and the browser's media
// controls. The browser hands them to the page through the Media Session,
// which also names the song where the device shows what's playing. Play and
// pause there are the player's own (a pause from the headphones holds, as
// the dock's does), next skips and previous is the dock's back.
import type { MusicState, Song, Where } from "./player.ts";

/** what the device shows besides the song's name */
export type NowPlaying = {
  /** e.g. the game's name */
  album?: string;
  artist?: string;
  /** e.g. the game's icon */
  artwork?: MediaImage[];
};

/** the player's side of it (the player itself, which hands its controls over as it's made) */
type Player = {
  state(): MusicState;
  subscribe(f: (s: MusicState) => void): () => void;
  pause(where: Where): void;
  resume(where: Where): unknown;
  skip(where: Where): unknown;
  back(where: Where): unknown;
  start(): void;
};
type Session = Pick<MediaSession, "setActionHandler" | "metadata" | "playbackState">;

/** Hand the device's controls to `music`; returns the undo. A browser without the Media Session does nothing. */
export function mediaKeys(music: Player, shown: NowPlaying = {}, session: Session | undefined = globalThis.navigator?.mediaSession): () => void {
  if (!session) return () => {};
  const actions: [MediaSessionAction, () => void][] = [
    // after the player's pause (or with another tab's music), the player's
    // play; else whatever stopped it wasn't the player (a headset that went
    // away, say), and it carries on
    ["play", () => (music.state().paused || music.state().elsewhere ? void music.resume("device") : music.start())],
    ["pause", () => music.pause("device")],
    ["stop", () => music.pause("device")],
    ["nexttrack", () => void music.skip("device")],
    ["previoustrack", () => void music.back("device")],
  ];
  for (const [action, f] of actions) {
    try {
      session.setActionHandler(action, f);
    } catch {} // a browser that doesn't know this one
  }
  let named: Song | null = null;
  const show = (s: MusicState) => {
    if (s.song !== named) {
      named = s.song;
      session.metadata = s.song && typeof MediaMetadata !== "undefined" ? new MediaMetadata({ title: s.song.title, ...shown }) : null;
    }
    session.playbackState = !s.song ? "none" : s.playing ? "playing" : "paused";
  };
  show(music.state());
  const unsubscribe = music.subscribe(show);
  return () => {
    unsubscribe();
    for (const [action] of actions) {
      try {
        session.setActionHandler(action, null);
      } catch {}
    }
    session.metadata = null;
    session.playbackState = "none";
  };
}
