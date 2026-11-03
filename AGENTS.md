# Orbital Books: notes for agents

David's take-home for Golden Analytics. Read `docs/requirements.md` first: it says what we're building and who decided what. Also read `~/Documents/how-we-build.md` and build by it.

- **Stack:** React Router 8 in framework mode (David calls it Remix) with server rendering, Vite 8.3.4, TypeScript 7.0.2, React 19, Vitest. `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`.
- **Layout:** `src/` is the features directory (React Router's `appDirectory`). Each top-level folder is a feature; shared code is `src/platform/`. Tests sit beside the code they test.
- **Analytics:** every feature records its events from the start (How We Build, principle 3).
  - Browser code imports `track` from `~/platform/analytics/analytics.client`; server code imports `trackServer` from `~/platform/analytics/analytics.server`.
  - Events say what happened, never content. The one exception is what players type to the in-game agent, recorded with `{ hold: "agent_text" }` so it stays on the device.
  - Each copy of the app has an instance ID in `.data/instance.json` (never committed). Set `ORBITAL_ANALYTICS=off` to stop the server sending; automated browsers never send.
- **`packages/` is existing games-studio code,** copied in by `tools/sync-studio-packages.sh`. Don't edit it here.
- **Changes reach `main` only through a pull request.** Work on a branch, push it, and open a PR with `gh pr create`. Never push to `main`.
- **A PR may be merged once two agents have approved it** (David, 30 Oct 2026):
  - An approval is a PR comment by the reviewing agent that starts "**<Name>'s review:** Approved" and names the head commit it approves (e.g. "at `abc1234`"). A new commit pushed after an approval voids it; the reviewer re-approves the new head.
  - Neither approver may be an author of the PR or its code. Suggesting code that another agent adopts doesn't make you an author.
  - One approver must be Audit, unless Audit is an author.
  - Unresolved blocking findings mean no approval.
  - Once approved, the PR's author (or Goldy) merges with `gh pr merge <n> --rebase --match-head-commit <full sha>` if every commit typechecks on its own, otherwise `gh pr merge <n> --squash --match-head-commit <full sha>`. Take the full sha from `gh pr view <n> --json headRefOid`. David can still merge anything himself.
  - **Never pass `--delete-branch`.** gh's local cleanup runs `git worktree remove` on any linked worktree that has the PR's branch checked out. On 30 Oct this is the likely way the merge-in-live workspace folder was deleted. Leave branch deletion to David or Roundhouse.
- **Two batons, held by Goldy** (David, 30 Oct; two lanes since 2 Nov): cap Vitest with `--maxWorkers=4` and Playwright with `--workers=2`. Ask Goldy for a baton and say when you're done. Targeted test files need no baton.
  - **Heavy baton, one at a time:** full suites, production builds, multi-browser e2e, fresh-clone checks, and any performance measurement (it needs a quiet machine). Ask "heavy baton?".
  - **Light baton, alongside the heavy one:** a single-browser run under about 3 minutes against a dev server or an existing build (screenshots, recordings), or a real-model run of Dewey or Alma. Ask "light baton?". It waits while a performance measurement holds the heavy baton. Every run through `playwright.config.ts` builds first, so any e2e spec is heavy.
  - If the light lane causes unreliable runs, or the load average stays above about 12, Goldy pauses it and we go back to one baton (David: "If it ends up causing reliability issues we pull back to just one again").
- **Resolve conflicts in the commits that cause them.** When your PR branch conflicts with `main`, rebase it onto `origin/main` and fix each conflict in the commit where it actually arises, so every commit in the stack applies and typechecks on its own. Don't add merge commits to PR branches. Then force-push your own PR branch with `--force-with-lease`, and never rewrite anyone else's branch.
- **Name yourself on PRs.** Start every PR description with the name of the agent that wrote the code, e.g. "**Author: Frank** (Codex, data and simulation)", so David knows who to talk to. When you review a PR, leave a comment with `gh pr comment` that starts with "**<Name>'s review:**", followed by your verdict and thoughts.
- **Keep `docs/collaboration-log.md` current.** Add an entry when David makes a major decision, and especially when he pushes back on or overrides an agent's recommendation. Quote his words.
- **The README is David's to write.** Don't create or edit `README.md`.
- **Formatting:** Prettier, 100 columns (David, 2 Nov 2026). Run `npm run format` before you commit; `npm run format:check` lists files that need it. It skips `packages/`, `docs/` and Markdown.
- **Game text:** US English, no emoji.
- **Headless browsers:** mute them (Web Audio to a zero gain node, media elements muted). Playwright's Chromium mutes itself; WebKit and Firefox don't.
