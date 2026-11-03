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
// One who left it ticked hears it at once: the page Continue opens still has Continue's user activation, so the
// browser lets it sound (measured in Chromium, under Chrome's autoplay policy, and WebKit, #317). If a browser
// refuses, it waits for the first tap or key press, as before. A fresh agreement wins over the player's own
// remembered state either way (David, 3 Nov 2026: "if the user has paused the music player, then deletes cookies,
// is shown that screen, and keeps the play the music checkbox checked, then we should start the player").
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
  const entry = takeEntryChoice();
  const paused = entry === "off";
  // While the entry's choice is applied, its own pause or resume isn't the player's, so it isn't reported:
  // entry_accepted already records the choice.
  let starting = entry !== null;
  const quiet = entry === "off" ? "music_paused" : "music_resumed";
  const music = studio().music({
    songs: { manifest: MANIFEST_URL, fetcher },
    base: "/music/",
    context: musicContext,
    legacyVolume: () => START_VOLUME,
    mediaKeys: { album: "Orbital Books" },
    ...(entry && {
      track: (event: string, props?: Parameters<Started["track"]>[1]) => {
        if (starting && event === quiet) return;
        studio().track(event, props);
      },
    }),
  });
  if (entry === "on")
    return music.then(async (m) => {
      // A pause remembered from before (the player's own session, kept in the browser) would stop start(), so resume
      // it instead; resume does nothing to a player that isn't paused, so that one starts.
      if (m?.state().paused) await m.resume("settings");
      else m?.start();
      starting = false;
      return m;
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

/** The entry page's "Play the music", just answered: "on" or "off" once, and the cookie is cleared so it applies only now. */
function takeEntryChoice(): "on" | "off" | null {
  if (typeof document === "undefined") return null;
  const choice = readCookie(document.cookie, MUSIC_COOKIE);
  if (choice !== "on" && choice !== "off") return null;
  document.cookie = `${MUSIC_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  return choice;
}
