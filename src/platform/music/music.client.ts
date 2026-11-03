// The game's music: the studio's player, through the studio's kit
// (../kit.client), made once in the browser and only if
// public/music/songs.json lists any songs. Shared by the shell's dock and the
// Settings panel. It starts on the player's first tap or key press (the
// package waits for one), plays nothing at volume 0 (the player's own saved
// choice, applied from the first note), and reports through the platform's
// track, by song id, never title.
//
// The kit's desktop defaults (David, 30 and 31 Oct 2026): it carries on after
// a reload, a closed tab or a crash; the game's tabs are one app, heard in the
// tab the player is on; and it keeps playing behind other tabs and desktops
// on a computer, though not on a tablet.
//
// A first-time player starts at 75% (David, 2 Nov 2026); one who has set a
// volume keeps theirs. The player reads this once, only while none is saved.
//
// A player who unticked "Play the music" on the entry page (David, 3 Nov 2026) starts with the player paused: the
// first song is queued and paused before anything can play, and stays paused, through reloads too, until they
// press play. The choice is recorded once, as entry_accepted's music; the startup pause itself isn't.
import type { Started } from "@tellim/kit/app";
import type { Music } from "@tellim/kit/music/player";
import "@tellim/kit/music/music.css";

import { MUSIC_COOKIE, readCookie } from "~/entry/cookie";
import { studio } from "~/platform/kit.client";
import { isPhoneScreen } from "~/platform/phone";
import { musicContext } from "./audio-context";
import { MANIFEST_URL } from "./manifest";

/** the volume a player starts at, before they've chosen one */
export const START_VOLUME = 0.75;

/** The music, or null when there are no songs (or no browser, or it's a phone). Made once. */
export function loadMusic(fetcher: typeof fetch = fetch): Promise<Music | null> {
  // No music on a phone (David): it gets the phone screen instead of the game.
  if (typeof window === "undefined" || isPhoneScreen()) return Promise.resolve(null);
  // A computer's web app: the kit's desktop defaults. Through Web Audio, so the
  // saved volume holds from the first note (audio-context.ts).
  const paused = takeStartPaused();
  let starting = paused;
  const music = studio().music({
    songs: { manifest: MANIFEST_URL, fetcher },
    base: "/music/",
    context: musicContext,
    legacyVolume: () => START_VOLUME,
    mediaKeys: { album: "Orbital Books" },
    // Only for the paused start: its own pause isn't the player's, so it isn't reported.
    ...(paused && {
      track: (event: string, props?: Parameters<Started["track"]>[1]) => {
        if (starting && event === "music_paused") return;
        studio().track(event, props);
      },
    }),
  });
  if (!paused) return music;
  return music.then(async (m) => {
    if (m) {
      // A fresh player has no song until it first plays, and pause needs one: queue the first, which can't sound
      // before a tap or key press, then pause it.
      if (!m.state().song) await m.skip("settings");
      m.pause("settings");
    }
    starting = false;
    return m;
  });
}

/** The entry page's "Play the music", unticked: true once, and the cookie is cleared so it applies only now. */
function takeStartPaused(): boolean {
  if (typeof document === "undefined" || readCookie(document.cookie, MUSIC_COOKIE) !== "off")
    return false;
  document.cookie = `${MUSIC_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  return true;
}
