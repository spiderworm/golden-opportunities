# Game validation on November 3 2026

Goldy ran this after David asked to resume the deferred automated game validation.
The original request's stopping point could not be recovered from Goldy, Audit,
Sim, or Frank's available context. Five years was the stated working scope.

## Result

All completed checks passed against main commit
`53375989946bde29a37dae01bfbdb4539751790b`.

| Check | Result |
| --- | --- |
| Production build | Passed |
| Existing `e2e/game` suite, Chromium and WebKit, 2 workers | 27 passed, 1 existing WebKit skip; 2.6 minutes |
| 20 quarters through game server submissions, seed 1 | Passed; Q1 2194 through Q4 2198, next quarter Q1 2199; 26.61 seconds including test startup |
| Five-year save in Chromium and WebKit, 1 worker | 2 passed; 14.2 seconds |

The browser baseline covers Q1 investigation, discoveries, decisions and results;
Q2 decisions and results; Q3 arrival; removal after three strikes; reset and play
again; stale data across tabs; and the Decide scene's loading and interactions.
The existing skipped WebKit case tests retrying a failed scene fetch.

For each of the 20 quarters, the longer runner submitted the plan through the
actual game functions, checked the saved quarter count and period, cleared the
replay cache, and checked regenerated revenue and units against the saved outcome.
It also checked result-page data, the growing service record, and that the player
had not been removed. All quarters passed, including year boundaries.

Both browsers then opened the generated save on the production server. They
verified the 20-row history, its persistence after reload, access to Q1 2194's
original result, Investigate, Reports, and the Q1 2199 planning screen. No page
errors were collected. Browser audio was muted and external requests blocked by
the existing fixture.

## Scope and limits

The 20-quarter run used Sim's `goodPlan` strategy and seed 1. It exercises the real
simulation, save store, replay, query, and result paths; it does not establish
coverage over every plan, event, or seed. The 20 submissions were server-function
calls, not 20 quarters of browser clicks. The existing early-game tests do submit
through the UI.

Alma was scripted. The browser servers used the fake Dewey provider. Real AI
responses, API authentication, generation quality, and daily usage caps were not
validated by this run. The five-year browser probe checks page availability and
history structure, not every chart value; revenue and units were cross-checked
quarter by quarter in the server runner.

The snapshot reused the workspace's installed dependencies. This was not a fresh
install check. No product-code changes were needed. The initial sandbox refused
the test server's listener and the save lock's process-identity check; those runs
were repeated with approved execution outside the sandbox. An occupied browser
probe port was left alone and replaced with a separate port.

David's server on localhost:5173 and his saves were not used or reset.

## Evidence and reproduction

Evidence lives in [validation/2026-11-03](validation/2026-11-03/): the runner
sources, per-quarter results, and logs. The runner extends Frank's disposable
five-year generator with assertions on replay, ledger totals, and result data.

The isolated source snapshot and generated save are currently at
`/private/tmp/orbital-playthrough-6xjnwmf8`. They are temporary artifacts, not a
committed save. The saved browser config contains that snapshot's absolute data
path; replace it when reproducing elsewhere.

To repeat on an isolated copy of the named commit:

1. Install dependencies or use a compatible existing installation.
2. Run `E2E_PORT=5297 npm run test:e2e -- e2e/game --workers=2`.
3. Copy the archived `five-year.test.ts` into `src/game/zz-five-year.test.ts`.
   Create a separate data directory and run
   `FIVE_YEAR_DIR=<absolute-data-directory> ORBITAL_ALMA_PROVIDER=scripted ORBITAL_ANALYTICS=off npx vitest run src/game/zz-five-year.test.ts --maxWorkers=1`.
4. Copy `five-year-browser.spec.ts` into `e2e/five-year-validation.spec.ts`, and
   copy `playwright.five-year.config.ts` to the root. Adjust its data path and port,
   and the spec's `five-year-data/validation.json` path if needed.
5. Run `npx playwright test --config playwright.five-year.config.ts --workers=1`.
   This uses the production build from step 2.

Coordinate the heavy baton before reproducing. Keep the generated save separate
from a developer's own data, and retain the analytics-off and scripted-provider
settings.
