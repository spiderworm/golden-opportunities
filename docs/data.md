# Data: what ships, where it came from, and how to reproduce it

*Frank, 31 October 2026, against `main` at `c58f1db`. Reviewers: Audit and Sim.*

The submission's data comes in three kinds:
- **Source data:** the brief's two workbooks, committed unchanged.
- **Derived data:** a JSON conversion of those workbooks, which the app reads.
- **Generated data:** what the game adds that the workbooks lack.

It's all in the repo. None of it needs a download, a secret or a git-ignored file.

| File | Kind | Size | Made by |
| --- | --- | ---: | --- |
| `data/source/bookshop/Bookshop.xlsx` | Source | 3.4 MB | The brief (Golden Analytics), unchanged |
| `data/source/bookshop/BookshopLibraries.xlsx` | Source | 25 KB | The brief, unchanged |
| `src/bookshop/data.json` | Derived from the source | 14 MB | `npm run data:bookshop` (`tools/convert-bookshop.ts`) |
| `src/simulation/release.ts` | Generated (records) | 3 KB | Written by hand (Sim), from #107 |
| Each game's 2194 sales | Generated (per save) | in `.data/saves/` | The simulation, from the save's seed |
| `data/generated/*.csv` | Generated (a sample) | 2.6 MB | `npm run data:sample` (`tools/sample-data.ts`) |

## Source data

The two workbooks are the brief's Bookshop dataset ("the brief's Bookshop dataset (`Bookshop.xlsx`, `BookshopLibraries.xlsx`)", `docs/requirements.md`). They're committed as received, on 30 October (`9a9ff76`), and nothing in the repo writes to them.

| File | SHA-256 |
| --- | --- |
| `Bookshop.xlsx` | `a9b7a1bdd6a7206f3d3f809a0a65d6e2fac39b82723b618724e670d35305d900` |
| `BookshopLibraries.xlsx` | `eced097acb72c608275445c03c196375d1bfdd1de78ddc518c1e91867091b5ea` |

The sheets the game reads: Book, Author, Info, Edition, Publisher, Series, Award, Ratings, Checkouts, LibraryProfile, Catalog, and Sales Q1 to Sales Q4.

## Derived data: `src/bookshop/data.json`

This is a typed, row-for-row conversion of those sheets. It's committed so the app needs no spreadsheet library at run time.
- **Contents:** 58 books, 41 authors, 58 info rows, 95 editions, 4 publishers, 6 series, 18 awards, 50,330 ratings, 668 checkout rows, 18 library staff rows, 291 catalog rows and 56,350 sale lines.
- **Rules:** the converter skips the workbooks' 514 empty rows. It refuses any value that doesn't fit its schema: a missing ID, a discount outside 0 to 1, or a sale dated outside its sheet's quarter. Each sale keeps its source sheet and row (`sourceSheet`, `sourceRow`).
- **Format:** one record per line, so a diff of the file can be reviewed.
- **No year on checkouts:** the workbook's checkouts have a month but no year (`year: null`). The game treats them as 2193's, because the snapshot came with the 2193 workbook (`src/query/contract.md`).

**Regenerate it:** run `npm ci`, then `npm run data:bookshop`. To check without writing, run `npm run data:bookshop -- --check`, which fails with "Generated data is stale" if the committed file differs. `tools/convert-bookshop.test.ts`, part of `npm test`, checks the same thing.

**Verified byte for byte from a clean clone** (31 October, `main` at `c58f1db`): `git clone`, `npm ci`, then `npm run data:bookshop -- --check` passes. A full `npm run data:bookshop` rewrites the file with the same SHA-256 (`bb45136e97759926312410275796fe3157ed6231378f38159eb7715fbb01e3cc`), and `git status` stays clean.

## Generated data

The brief allows "data of your own choosing", and David decided that generated data ships with the submission (`docs/requirements.md`). Three things are generated.

**1. The new Inspector Ryeslton volume** (`src/simulation/release.ts`; design in `docs/design/m1-new-volume.md`). It's one book that isn't in the workbooks:
- **The records:** *The Bourton Model Village Poisoning*, book `BM901`, ESP hardcover, ISBN `989-28-79-90194-3`, $22.99, out 4 February 2194.
- **Its rate:** 4.5 copies a day, which is volume 2's Q1 2193 rate times 0.85. It sells three times that in its first week and twice that in its second.
- **Borrowed:** its author and series are the series' own (shared with volume 1), and its ratings are volume 2's (`ratedLike: "TH296"`). Its title, cover line, staff comment, pages and print run are generated.
- **The goals count it:** each quarter's 70 point is last year plus the volume's expected effect on holding course, the mean over seeds 101 to 120 (`releaseEffect`). That's why the report card's "last year" column isn't 2193's figure.
- **How it's marked:** `generated: true` in the code. The game doesn't label it as generated, by David's decision.
- **How it's used:** the engine's sale lines and the game's ledgers both join through these records.

**2. Each game's 2194 sales.** When the player plans a quarter, the simulation (`src/simulation/`) generates that quarter's sale lines. They have the same columns as 2193's (date, ISBN, discount, order and item IDs). The save (`.data/saves/<id>.json`) keeps each quarter's plan and result and a SHA-256 hash and count of its lines, not the lines: the server replays them from the plan and the save's seed, and refuses a replay that doesn't match the hash (`src/game/replay.server.ts`). At about 188 bytes a line, stored lines would fill the save's 16 MiB in under two years of the endless game. Saves from before keep their stored lines.
- **What they're made from:** the 2193 data, the save's seed (a random 32-bit number made with the save) and the plan. Nothing else.
- **Q1:** 2194 replays Q1 2193 day by day, 364 days on (the same weekday), or 371 if 364 would leave the month (`replayedDay`), with ±3% noise on orders. 2193's Books of the Month are removed, the new volume's copies are added, and then the plan's moves are applied.
- **The new volume's copies:** one-copy orders at full price, from their own seeded stream, so every plan gets the same ones. In Q1 they start on 4 February, at the launch rate and then 4.5 a day. In Q2 they run all quarter at 4.5 a day.
- **Q2:** replays Q2 2193 the same way, from its own seeded streams. Its holding course is the empty calendar (no picks), since Q2's plan is a choice of picks.
- **Reproducible:** the same seed and plan always give the same lines.
  - `src/simulation/model.test.ts` pins a SHA-256 fingerprint of Q1's output for every plan on seeds 1 to 3.
  - `src/simulation/q2.test.ts` checks that Q2 is deterministic.
  - To regenerate a game's lines, call `simulateQuarter(plan, seed, data)` or `simulateQ2(plan, seed, data)` with the save's `seed` and plan, as `replayLines` in `src/game/replay.server.ts` does.
- **The assumptions:** everything the 2193 data can't say is a named constant in `src/simulation/` (`model.ts`, `measures.ts`, `release.ts`), and is shown in "See the assumptions" with its source. Most are marked *assumed*: for example the sale's response (`SALE_RESPONSE = 0.2`), author nights' extra orders (30 to 70) and the 60% cost of goods. The replay and its small day-to-day noise (±3%, `NOISE`) are marked *setup*. A Book of the Month's extra copies, drawn from 2193's twelve observed picks (`OBSERVED_EXTRAS`), are marked *data* (Sim).

**A sample to open without playing: `data/generated/`.** `npm run data:sample` writes the simulation's 2194 sales for one fixed seed (`SAMPLE_SEED = 1`, `src/simulation/sample-data.ts`) as CSV:

| File | Quarter | Plan | Lines |
| --- | --- | --- | ---: |
| `sales-2194-q1-hold-course.csv` | Q1 2194 | Holding course | 8,115 |
| `sales-2194-q1-repick-and-author-nights.csv` | Q1 2194 | Re-pick the Books of the Month, plus author nights | 8,800 |
| `sales-2194-q2-hold-course.csv` | Q2 2194 | Holding course: the empty calendar, no picks | 13,685 |
| `sales-2194-q2-quiet-picks-and-author-nights.csv` | Q2 2194 | *Land Water Sky Space*, *Thatchwork Cottage* and *Kalakalal Avenue* (hardcovers), plus author nights | 14,482 |

- **What's in them:** these are exactly the lines a save with seed 1 stores for those plans. Each file is the source workbook's sales grain (one line per copy sold) with its columns: `Sale Date`, `ISBN`, `Discount` (empty for full price, as in the source), `ItemID` and `OrderID`. Dates are written as `YYYY-MM-DD`, where the workbook has Excel date numbers.
- **The new volume's lines** carry ISBN `989-28-79-90194-3`. It isn't in the workbook's editions, so it joins through `src/simulation/release.ts`.
- **Q2 stands on its own:** `simulateQ2` doesn't read Q1's outcome (Q1 changes only the ledgers), so Q2's sample is made from the same seed without playing Q1.
- **Checking:** `npm run data:sample -- --check` fails with "The sample of generated data is stale" if the committed files differ. `tools/sample-data.test.ts`, part of `npm test`, runs that check, and cross-checks the files against the engine's own totals.
- **When the engine changes on purpose** (as #142 did, when the Q1 fingerprint changed), that check fails too. The fix is to run `npm run data:sample` and commit the new files with the change.

**3. Scenario facts in the design docs.** Station names, bosses and the Commerce Office's memos are fiction, in `docs/design/` and the copy files. They aren't data, but they're listed here so nothing generated goes unaccounted for.

**Not generated: customers and demographics.** The requirements allow generated customers ("Generated data may include customers and demographics"), but none were built. The simulation works at the level of orders and copies and has no customers. So the submission has no customer file. The 3D station's shoppers (`src/station/scene/Shoppers.tsx`) aren't customer records: up to eight figures, their number scaled to the shop's busyness (`src/station/scene-params.ts`).

## Checked for a reviewer

- **Nothing a reviewer needs is git-ignored.** `.gitignore` covers `node_modules`, `build`, `.react-router`, Playwright output, `.data/` (this copy's saves, instance ID and queued analytics), `.DS_Store` and `.env`. A clean clone ignores only `node_modules`, and no `.env` is needed.
- **Nothing is oversized.** The largest tracked files are `src/bookshop/data.json` (14 MB), the music tracks (2 to 3.5 MB each) and `Bookshop.xlsx` (3.4 MB), all well under GitHub's 100 MB file limit. The whole of `public/` is 34.0 MB (32.4 MiB).
- **One install-time dependency is outside npm:** `xlsx`, which only the converter uses, installs from `cdn.sheetjs.com` (`package.json`). A network that blocks that host fails `npm ci` (Sim, `docs/fresh-clone-check.md`).
- **Generated data can be opened without playing:** `data/generated/` holds the sample above, committed and checked.

## README suggestions for David

The README is yours, so these are suggestions only:
- **Data:** the two source workbooks are in `data/source/bookshop/`, and `docs/data.md` says how the rest is derived and generated.
- **Regenerate and check:** `npm run data:bookshop`, or `npm run data:bookshop -- --check`.
- **What's generated:** the new Inspector Ryeslton volume, and each game's 2194 sales from the save's seed. A sample for one seed is in `data/generated/` (`npm run data:sample`). There are no customers.
- **Where a game's data lives:** `.data/saves/`. Deleting `.data/` starts over.
