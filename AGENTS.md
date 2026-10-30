# Orbital Books: notes for agents

David's take-home for Golden Analytics. Read `docs/requirements.md` first: it says what we're building and who decided what. Also read `~/Documents/how-we-build.md` and build by it.

- **Stack:** React Router 8 in framework mode (David calls it Remix) with server rendering, Vite 8.3.4, TypeScript 7.0.2, React 19, Vitest. `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`.
- **Layout:** `src/` is the features directory (React Router's `appDirectory`). Each top-level folder is a feature; shared code is `src/platform/`. Tests sit beside the code they test.
- **Analytics:** every feature records its events from the start (How We Build, principle 3).
  - Browser code imports `track` from `~/platform/analytics/analytics.client`; server code imports `trackServer` from `~/platform/analytics/analytics.server`.
  - Events say what happened, never content. The one exception is what players type to the in-game agent, recorded with `{ hold: "agent_text" }` so it stays on the device.
  - Each copy of the app has an instance ID in `.data/instance.json` (never committed). Set `ORBITAL_ANALYTICS=off` to stop the server sending; automated browsers never send.
- **`packages/` is existing games-studio code,** copied in by `tools/sync-studio-packages.sh`. Don't edit it here.
- **Changes reach `main` only through a pull request David approves.** Work on a branch, push it, and open a PR with `gh pr create`. Never push to `main` or merge a PR yourself.
- **Keep `docs/collaboration-log.md` current.** Add an entry when David makes a major decision, and especially when he pushes back on or overrides an agent's recommendation. Quote his words.
- **The README is David's to write.** Don't create or edit `README.md`.
- **Game text:** US English, no emoji.
- **Headless browsers:** mute them (Web Audio to a zero gain node, media elements muted). Playwright's Chromium mutes itself; WebKit and Firefox don't.
