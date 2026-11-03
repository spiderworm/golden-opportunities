# @tellim/music

The studio's music player, shared by every game (David, 29 Oct 2026: "Let's
give the users a music player. Let's make it a reusable thing available for
all games."). The plan, and why, is in `plans/music-player.md`.

| Part | What it does |
|---|---|
| `src/queue/` | The order: pinned songs first, once each open; with Shuffle off, the rest in the player's dragged order; with it on (the default), shuffled each open, new songs at the front of the first shuffle; never the same song twice running; exclusions read as each song is picked. |
| `src/prefs/` | What the player chose, kept on the device: volume, excluded, hearted, their order, Shuffle, and the songs known (so an update's songs are New). |
| `src/player/` | `createMusic()`: streams the songs through one `<audio>`, through Web Audio when the game gives its context (and its effects), starts on the first touch, pauses out of sight, skips a song that won't load, and sends every choice to the game's `track()`. `startPaused` starts it as if the player had pressed pause: the first song (or the one restored) waits for their play, through reloads, with nothing reported. |
| `src/player/media-keys.ts` | The device's own controls, on by default (`mediaKeys`): media keys, headphone and Bluetooth buttons, the lock screen and the browser's media controls play, pause, skip and go back, through the Media Session, and the device names the song (`mediaKeys: { album, artist, artwork }` adds to it; `false` leaves them alone). Their analytics say `where: "device"`. |
| `src/player/desktop.ts` | `createDesktopMusic()`: `createMusic()` with a computer's web app defaults (`desktopDefaults`), each overridable: `remember`, `oneTab`, and playing on behind other tabs (paused when hidden only on a touch screen). |
| `src/manifest/` | `parseManifest()` / `loadManifest(url)`: a song list read at run time (a web app's `songs.json`), every entry checked, a bad one left out and counted. |
| `src/sync/` | `createSync()`, for `oneTab`: an app's tabs share the music over the app's channel (newest change wins) and pick the one heard; the tab heard holds a Web Lock in the app's name (gone with the tab, even a crashed one), so other apps on the host know, and ask it over the studio's channel to stop. |
| `src/ui/popup.ts` | `createPopup()`: as a song starts, a pill: back, pause, the song's name, heart, next. Tapping the name opens the full player where the pill was (volume, the song playing, the playlist); a tap outside, Escape or the close button shuts it. It also shows itself for a song's last 8 seconds and stays up as the next starts, so either can be hearted; for half a second after the name changes, a tap is for the song before (its heart hearts that one, and its next doesn't skip the new song too), as in the dock (`src/ui/grace.ts`). The game places the pill and says when it must wait; `full(open)` tells it the full player opened, e.g. to pause. `dispose()` when the page or component that holds it goes. |
| `src/ui/dock.ts` | `createDock(music, root, { layer })`: the pill kept for good in a place of the game's own (Orbital Books' sidebar): the name above back, pause, heart and next; "Music" and a play button before the first song. Its name opens the full player over `layer` (a fixed layer over the page), where the dock is. `compact(true)` keeps only pause / play, for a collapsed sidebar. `dispose()` when it goes. |
| `src/ui/panel.ts` | `createMusicPanel()`: for Settings. The music volume (this is the game's music volume setting), the song playing, and a Playlist row that opens the playlist in its place. |
| `src/ui/parts.ts` | The pieces both share. The playlist: Shuffle, and every song with a handle to drag (or arrow keys), a heart and an on/off switch; songs switched off sink to the bottom each time it opens. |
| `src/ui/music.css` | Its look, through `--music-*` variables a game sets to its colors (`--music-bg`, `-border`, `-fg`, `-muted`, `-accent`, `-heart`, `-knob`, and `-full-base`, the solid color under the full player so the game never shows through). Its defaults weigh nothing, so the game's own `:root` wins whatever the load order. |

## Adding it to a game

1. `npm install --save "@tellim/music@file:../../packages/music"`, from the game's folder.
2. Make the player once, at startup:
   ```ts
   import { createMusic } from "@tellim/music/player";
   import "@tellim/music/music.css";
   const music = createMusic({
     app, // @tellim/platform's defineApp({ id: "pizza", ... }); before it, key: "pizza"
     base: import.meta.env.BASE_URL + "music/",
     songs: [{ id: "triumph-of-the-brave", file: "theme.mp3", title: "Triumph of the Brave", pinned: true }, ...],
     track,
     leadMs: 1000, // Pizza: Bluetooth headphones wake before the theme
     context: () => rawAudio(), // optional: through Web Audio
     effects: (ctx, music) => focusBus(ctx, music), // optional: the game's own sound on the way out
     legacyVolume: () => oldSettings.musicVolume, // optional: carry the old setting over once
   });
   ```
   A song's `id` never changes: exclusions, hearts and analytics are kept by it.
   With Vite-bundled songs (hashed URLs, as Pizza's are), give `base: ""` and each song's full
   imported URL as its `file`, and take the `id` from the file's stem, never the URL.
3. The pop-up: `createPopup(music, hudRoot, { busy, place, hidden })`. `place(el, open)` sets its
   `top` (and `left`, `maxWidth`) clear of the play area; Waddleberg's song toast placement moves here.
   Or, for a pill that never goes away, the dock: `createDock(music, sidebarSpot, { layer })`.
4. Settings: `const p = createMusicPanel(music)`, put `p.el` where the music setting was, and call
   `p.dispose()` when the page goes. Remove the game's own music volume or on/off setting.
5. While the game must be silent (Pizza's `"quiet"`), `music.setQuiet(true)`.
   While it's away for any reason, `music.setAway(reason, true)`: nothing plays until every
   reason is cleared. Page visibility is handled already, but not Android relaunching the app
   behind the lock screen after an update, so feed it Capacitor's `App` state too.
   Where sound needs no tap (the native app), `music.start()` once the game is seen; otherwise
   the first touch starts it.
6. For a web app made for a computer (Orbital Books), make it with `createDesktopMusic()` from
   `@tellim/music/desktop` instead of `createMusic()`: the same options, with three on by default
   (`desktopDefaults`). Any you give win.
   - `remember: true` carries on after a reload, a closed tab or a crash (the song, the place in
     it, the queue, a pause the player chose; a session older than 6 hours, or `{ maxAgeMs }`,
     starts afresh, pinned songs first again).
   - `oneTab: true`: the app's tabs are one app (David, 31 Oct 2026). The song, the place in it,
     the pause and the playlist (hearts, order, songs off, volume) are the same in every tab, and
     one tab is heard: the visible one used last, or, with none in sight and the app allowed to
     play out of sight, the one used last. The tab to be heard starts from the app's place, and the
     one heard before stops once it's sounding, so a tab the browser won't let play yet (never
     touched) leaves the music where it was. Give `app` (@tellim/platform), since apps are told
     apart by id. Another app on the host that's playing isn't played over: this one doesn't start
     by itself; the player's play stops the other (which waits for its own player's play, not
     starting again by itself); one that doesn't answer keeps playing, and the pop-up, dock or
     panel says so. A browser shows a page only its own host's tabs, so an app elsewhere is never
     known, and where it can't tell at all (no Web Locks) it just plays.
   - `pauseWhenHidden`: the music pauses while the page is hidden (another tab, another desktop,
     the app put away), as a game's should, and that's `createMusic()`'s default. On a computer
     it's a backdrop, so the desktop player plays on behind other tabs, and pauses only on a touch
     screen (a tablet), where putting the browser away should stop it. `false` or a function asked
     each time the page hides decides for yourself.
7. Delete the game's old music code (Waddleberg `src/audio/music.ts` and `src/hud/song-toast.ts`,
   Pizza `src/feel/music.ts`'s playlist; Pizza keeps its focus muffle as `effects`).

## Analytics

All through the game's `track()`:
`song_started {id, pinned, index, cause: auto|skip|back|restored, where?}`,
`song_ended {id, how: finished|skipped|back, at_s, length_s}`, `song_restarted {id, at_s, where}`,
`music_paused` / `music_resumed {id, where}`, `song_excluded` / `song_included {id, pinned, where}`,
`song_hearted` / `song_unhearted {id, where}`, `song_moved {id, from, to, where}`, `music_shuffle_set {on, where}`,
`music_player_opened {from}` (the full player from the pop-up or dock, or the playlist in Settings),
`music_volume_set {level, where}` (once the slider is let go). `where` is `popup`, `dock`, `settings` or `device` (the device's own controls: pause, play, skip, back).
With `oneTab`, `music_other_tab {action}`, about another app: `held_back` (it was playing, so this one
didn't start), `taken` (it took the music), `took_over` (this app took it), `blocked` (it wouldn't let
go). The app's own tabs passing the music between them send nothing.

## Tests

`npm test` here (Node's own runner): the order, exclusions, new songs, back, and the kept choices.
