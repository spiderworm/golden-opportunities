# Fresh-clone check: can a reviewer clone, set up and play?

*Run by Sim on October 31, 2026, with Goldy's baton, against `main` at `d0b4e61`, which includes #150. Reviewers: Audit and Frank.*

M4 asks that "a reviewer can clone the repo, follow the instructions, and play". The check cloned `main` into a new folder outside every workspace, ran each setup step a reviewer would, then played the game in a muted browser.

**Re-run after fixes.** Two findings below block a reviewer. Once Frank's fix for both (`src/assistant/tools/toolServer.server.ts`) and #144 (Q2's Decide screen) are on `main`, run a second pass with the baton. It should check that the real Dewey answers under `npm start`, and play the Q2 loop. Then update this doc.

## What was run

The setup docs that exist were followed: `CLAUDE.md` (its command list), `docs/dewey-setup.md`, and `e2e/game/notes.md` for the browser tests. `README.md` is one line (the repo's name), so it gives a reviewer no steps.

Machine: macOS, Node 24.21.0, npm 11.19.0, Claude Code installed and signed in. Analytics were off (`ORBITAL_ANALYTICS=off`) for every step, so the check sent no events.

| Step | Result |
| --- | --- |
| `git clone` (SSH) | Works, for an account that can see the repo. |
| `npm ci` | Passes. 298 packages, with one warning that fsevents' install script wasn't run, which is harmless. It was fast here because npm's cache was warm; a cold machine downloads everything, including xlsx from `cdn.sheetjs.com`. |
| `npm run typecheck` | Passes. |
| `npm test` | Passes, 661 of 661 tests in 75 files, in 26 s with `--maxWorkers=4`. |
| `npm run build` | Passes. |
| `npm start`, `PORT` unset | Serves on `http://localhost:3000`, and makes `.data/` (`instance.json`, `analytics-server.json`, `saves/`) on first run. |
| A reviewer's first steps, under `npm start` (Chromium, muted) | **Works.** The station and Investigate load, and the test-mode Dewey (`ORBITAL_ASSISTANT_PROVIDER=fake`) returns real lookups, so #150's fix works. A full Q1 plan (re-pick and author nights) plays through to the result, which opens with the new volume's sentence and offers `Continue to Q2`. |
| The real Dewey under `npm start` | **Broken**: blocking finding 1. |
| `npm run dev` on 5174 (5173 was taken) | The game works. **Dewey's lookups fail**: blocking finding 2. |
| The real Dewey under `npm run dev` on 5174, with `PORT=5174` | Works: one real-model question, answered with a lookup and its table. |
| No Claude Code on the PATH | Dewey's panel says it's offline and points to `docs/dewey-setup.md`, as designed. Everything else works. |
| `npx playwright install chromium webkit`, then `m1-loop.spec.ts` and `q2-arrival.spec.ts` | Pass, 4 of 4, Chromium and WebKit, muted by `e2e/fixtures.ts`. Q2's loop isn't on `main` yet (#144). |

## Where a reviewer gets stuck

### Blocking

1. **The real Dewey doesn't answer under `npm start`.** It replies "The assistant is unavailable right now. Try again in a moment.", while `GET /api/assistant` says `{"available":true}`. The server records the answer as `outcome: unavailable`, provider `claude-code`, 0 turns, in 771 ms.
   - **Cause:** the built server starts Dewey's tool server as `node <build/server>/server.ts`, from `new URL("./server.ts", import.meta.url)` in `toolServer.server.ts`. The build doesn't contain that file, and the source path only exists under `npm run dev`.
   - **Evidence:** the same question, on the same machine with the same Claude Code sign-in, answers correctly under `npm run dev`.
   - **Why the tests miss it:** the e2e suite and the test-mode provider never start the tool server.
   - **Routed:** to Frank.
2. **Under `npm run dev` on any port but 5173, Dewey's lookups fail** with "A lookup didn't work: That session ended. Reload the page to continue."
   - **Cause:** with `PORT` unset, `defaultQueryUrl` still falls back to `[::1]:5173`. #150 fixed this only for `npm start`.
   - **When it happens:** Vite moves to the next free port when 5173 is busy, so a reviewer running anything else on 5173 hits this. Here, the lookups went to another copy of the game on 5173, which refused them.
   - **Routed:** to Frank.

### Likely

3. **The repo is private.** A reviewer needs to be invited before they can clone it, and needs SSH or HTTPS credentials for GitHub.
4. **No setup steps anywhere a reviewer looks first.** The README is one line. The steps exist only in `CLAUDE.md` (written for agents), `docs/dewey-setup.md` (linked only from Dewey's offline panel) and `e2e/game/notes.md`.
5. **No Node version is declared.** There's no `engines` field and no `.nvmrc`. `docs/dewey-setup.md` says Claude Code needs Node 22 or newer, and it was tested with 24.21.0. The app runs Dewey's tool server through Node's native TypeScript support, which works without a flag from Node 22.18 (and 23.6).
6. **Dewey needs Claude Code, signed in, on a paid plan or a Console account.** An `ANTHROPIC_API_KEY` in the environment isn't used. Without it, everything but Dewey works, and the panel says so. `ORBITAL_ASSISTANT_PROVIDER=fake` shows the panel working without Claude Code.

### Minor

7. **Analytics are on by default.** Each copy sends content-free events, plus an instance ID kept in `.data/instance.json`, to David's analytics endpoint. That's intended (David, October 30: "so David can tell copies apart"), but nothing tells the reviewer. `ORBITAL_ANALYTICS=off` stops the server sending, and automated browsers never send.
8. **`npm ci` needs `cdn.sheetjs.com`.** The `xlsx` dev dependency installs from SheetJS's CDN, not npm, so a network that blocks it fails the install.
9. **The browser tests need their browsers.** Run `npx playwright install chromium webkit` first. Firefox is disabled (see `playwright.config.ts`). The e2e run builds and serves its own copy on 127.0.0.1:5187, so it needs that port free, or `E2E_PORT`.
10. **Ports:** `npm start` uses 3000 (or `PORT`) and fails with `EADDRINUSE` if 3000 is busy. `npm run dev` uses 5173 and moves on if it's busy, which triggers finding 2 until it's fixed.
11. **`.data/`** is made on first run in the clone's folder and holds saves, the instance ID and queued analytics. Deleting it starts over. `ORBITAL_DATA_DIR` moves it.

## README suggestions for David

The README is yours, so these are suggestions only:

- **What it is:** one paragraph, with a link to `docs/requirements.md`.
- **Requirements:** Node 22.18 or newer (tested on 24), and npm. Claude Code is optional and only needed for Dewey (link `docs/dewey-setup.md`).
- **Setup and play:** `npm ci`, then `npm run build && npm start` and open `http://localhost:3000`. Or `npm run dev` and open `http://localhost:5173`.
- **Tests:** `npm test`. For the browser tests, `npx playwright install chromium webkit` and then `npm run test:e2e`.
- **Dewey:** what it needs (Claude Code, signed in), what the game does without it, and `ORBITAL_ASSISTANT_PROVIDER=fake` to see it work without Claude Code.
- **Data and analytics:** that `.data/` holds the saves and the instance ID; that the copy sends content-free analytics, and why; and that `ORBITAL_ANALYTICS=off` stops it.
- **Settings**, as a short table:
  - `PORT`;
  - `ORBITAL_DATA_DIR`;
  - `ORBITAL_ANALYTICS`;
  - `ORBITAL_ASSISTANT_PROVIDER`;
  - `ORBITAL_ASSISTANT_MODEL`;
  - `ORBITAL_ASSISTANT_CLAUDE` (the path to the `claude` binary).
- **Access:** that the repo is private, so reviewers need an invitation.
