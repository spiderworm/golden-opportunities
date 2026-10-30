# Orbital Books: notes for agents

David's take-home for Golden Analytics. Read `docs/requirements.md` first: it says what we're building and who decided what. Also read `~/Documents/how-we-build.md` and build by it.

- **Stack:** React Router 8 in framework mode (David calls it Remix) with server rendering, Vite 8.3.4, TypeScript 7.0.2, React 19, Vitest. `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`.
- **Layout:** `src/` is the features directory (React Router's `appDirectory`). Each top-level folder is a feature; shared code is `src/platform/`. Tests sit beside the code they test.
- **`packages/` is existing games-studio code,** copied in by `tools/sync-studio-packages.sh`. Don't edit it here.
- **Changes reach `main` only through a pull request David approves.** Work on a branch, push it, and open a PR with `gh pr create`. Never push to `main` or merge a PR yourself.
- **Keep `docs/collaboration-log.md` current.** Add an entry when David makes a major decision, and especially when he pushes back on or overrides an agent's recommendation. Quote his words.
- **The README is David's to write.** Don't create or edit `README.md`.
- **Game text:** US English, no emoji.
- **Headless browsers:** mute them (Web Audio to a zero gain node, media elements muted). Playwright's Chromium mutes itself; WebKit and Firefox don't.
