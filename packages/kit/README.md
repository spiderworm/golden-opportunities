# @tellim/kit

What a studio app starts with (David, 31 Oct 2026): the studio's packages,
`@tellim/platform`, `@tellim/music` and `@tellim/analytics`, at versions tested
together, and `startApp()` to wire them with the defaults we've learned, so the
next app doesn't learn them again. Anything given wins over a default.

The packages beside it in `packages/` are the versions it's made for: its tests
run them together (`npm install && npm test` here), and a game copies them
together (Orbital Books' `tools/sync-studio-packages.sh`).

## Starting an app

1. Put the app in `@tellim/platform`'s list (`packages/platform/src/app/apps.ts`).
2. Depend on the kit and the packages it holds, from the game's folder:
   `npm install "@tellim/kit@file:../../packages/kit"` (or `file:packages/kit` where the
   packages are copied in); its own `file:` dependencies come with it.
3. Once, at startup:
   ```ts
   import { defineApp, startApp } from "@tellim/kit/app";
   export const app = defineApp({ id: "orbital-books", version: __APP_VERSION__, build: __APP_BUILD__ });
   export const kit = startApp(app, { form: "desktop" }); // a phone game: "phone"
   kit.track("level_started", { level: 3 });
   const music = await kit.music({ songs: { manifest: "/music/songs.json" }, base: "/music/" });
   ```

| `startApp(app, { form, analytics, track })` | What it does |
|---|---|
| `form` | `"desktop"`, a computer's web app: the music remembers where it was through a reload, keeps the app's tabs as one app (one song, one pause, heard in the tab the player is on), and plays on behind other tabs and desktops (paused out of sight only on a touch screen). `"phone"`, a phone game: the player's own defaults, paused out of sight. |
| `analytics` | `createAnalytics()` for the app (`game`, `key`, `build` and `version` from it), to the studio's endpoint, platform `"web"`. Give any of its options (`platform: "android"`, `endpoint`, `gl`, ...), or `false` for none. `kit.analytics` is it. |
| `track` | What the music reports through; default, the analytics' `track`. A game that filters its events (Orbital Books on a phone) gives its own. |
| `kit.music(options)` | `createMusic()` options, but the songs may be `{ manifest: url }`: a `songs.json` read at run time, every entry checked (a bad one is left out and `music_manifest_skipped {skipped}` sent). The music player is loaded the first time it's asked for, so it weighs nothing on the first page, and made once; `null` with no songs or no browser. |

## Its parts, one by one

For what `startApp()` doesn't do, each package's parts are here by their own paths, so a page
loads only what it uses (never one bundle):

- `@tellim/kit/platform/app`, `/platform/presence`
- `@tellim/kit/analytics/client`, `/analytics/deployed`, `/analytics/environment`
- `@tellim/kit/music/player`, `/music/desktop`, `/music/manifest`, `/music/popup`, `/music/dock`,
  `/music/panel`, `/music/music.css`
- `@tellim/kit/music`: `startMusic(app, form, options)`, what `kit.music()` calls

Each package's README says how its parts work.
