# Reports (design)

Status: **proposal, for David to approve.** Chart wrote it, for Goldy's request (req_3d3635a320e6). Plot owns the copy: every string below is a draft for Plot to rewrite in the game's voice. Nothing here is built.

David chose "both, one page" (2 Nov). The Reports nav item (`src/shell/nav.ts`, the one with no page) opens `/reports`:
- at the top, **the shop's reports**, which the game writes, one per played quarter;
- below them, **the player's own reports**, built from pinned charts with their notes, which they can open in Decide as evidence.

The decisions are listed at the end, each with its alternative.

## 1. Layout, against the reference dashboard

The reference ([the Dribbble shot](https://cdn.dribbble.com/userupload/16634923/file/original-f43329b3981a02596cc81116d1338386.png)) puts a page title and a one-line greeting at the top ("You have **2** new Reports"), a row of metric tiles, one wide chart beside a narrow card, and a row of list and heatmap cards. Its nav item for Reports carries a count badge. Reports borrows that structure, using the panels, tiles and chart theme Investigate already has (`src/platform/charts`, `src/platform/theme/theme.css`).

```
┌ Reports ─────────────────────────────────────────────────────────────────────┐
│ You have 1 new report.                                       [ New report ]  │
│                                                                              │
│ THE SHOP'S REPORTS                                                           │
│ ┌ Overall ┐ ┌ Profit ┐ ┌ Readers ┐ ┌ Happiness ┐ ┌ Culture ┐   last quarter │
│ │ 74 (C)  │ │ 81 (B−)│ │ 74 (C)  │ │ 77 (C+)   │ │ 90 (A−) │   with change  │
│ │ +8 ↗    │ │ +3 ↗   │ │ +8 ↗    │ │ −2 ↘      │ │ +1 ↗    │   from the one │
│ └─────────┘ └────────┘ └─────────┘ └───────────┘ └─────────┘   before       │
│ ┌ Overall by quarter ──────────────────────┐ ┌ Service record ──────────────┐│
│ │ bars per quarter, a line at 70           │ │ Quarter  Overall  Event      ││
│ │ (a strike under it)                      │ │ Q2 2194  74 (C)   None       ││
│ │                                          │ │ Q1 2194  66 (D)   None       ││
│ └──────────────────────────────────────────┘ │ tenure and best quarter lines││
│                                              └──────────────────────────────┘│
│ ┌ Q2 2194 report ─ NEW ┐ ┌ Q1 2194 report ──────┐                            │
│ │ score, plan, event,  │ │ ...                  │                            │
│ │ found, Open results  │ │                      │                            │
│ └──────────────────────┘ └──────────────────────┘                            │
│                                                                              │
│ YOUR REPORTS                                                                 │
│ ┌ The quiet picks ────────────┐ ┌ Weekdays ───────────────────┐              │
│ │ 3 charts · edited Q2 2194   │ │ 2 charts · edited Q1 2194   │              │
│ │ first note, two lines…      │ │ ...                         │              │
│ │ [Open] [Edit]               │ │                             │              │
│ └─────────────────────────────┘ └─────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **The greeting line** counts new shop reports (section 2): `You have {n} new report(s).` With none, it reads `Every report is read.` (*draft*).
- **The nav badge:** Reports shows the same count, as the reference's does, and as the notifications bell counts memos. It's gone at zero.
- **The tile row** is the last played quarter's report card: overall, then the four measures in report-card order, each with its score and grade and a change badge against the quarter before. Q1 2194 has no quarter before in the game, so its badges compare against its own goal (*draft*: `vs goal`).
- **Overall by quarter** is a bar chart, one bar per played quarter, with a line at 70, the strike line in `endless.md` section 7. With one quarter played, the chart is hidden and the record takes the row.
- **Narrow windows** (under 1100 px, Investigate's own breakpoint): the tiles wrap to two rows, and every card goes to one column, the record under the chart. Nothing scrolls sideways.
- **Before any quarter is played,** the shop's section shows one line: `No quarter has been filed yet. The first report arrives once Q1 2194 is played.` (*draft*). The player's section works from the start.

## 2. The shop's reports

**One report per played quarter,** newest first. The game writes it when the quarter is committed. Nothing in it is new data: it gathers what the result screen already shows, so a player can look back without opening each result.

| Part | What it shows | From |
| --- | --- | --- |
| Heading | `{quarter} report`, and `NEW` until the player has opened it | the save |
| Score | overall score and grade, the measure that bound it, and `strike` when it's under 70 | the quarter's outcome |
| Against goals | each measure's actual against its goal, with its score and grade, as the result's report card has them | the outcome |
| Your plan | Q1: the move, or `Held course`. From Q2: each month's pick (`editionLabel`), then the one more move | the outcome's plan |
| Event | Alma's event and the quarter's stretch, in the memo's words, once Alma is wired in (`endless.md` sections 2 and 9). Q1 and Q2 read `None` | the save's Alma record |
| What you found | the discoveries earned that quarter, by their found text | the save's discoveries |
| Link | `Open the full results`, to `/result?quarter={quarter}` | |

**The service record** is `endless.md` section 6's table, tenure line and best-quarter line, unchanged, and the annual review's year lines after each Q4. Reports renders the same component the result screen does, so the two can't disagree.
- If David doesn't approve #168 as written, the record here follows whatever replaces it. Until #168 merges, the table shows the same rows from the half-year review's data (both quarters' measures and overall).

**Opened and new.** A report is new until the player opens its card or its full results. The save keeps `reportsSeen?: QuarterId[]`, as it keeps `alertsSeen` for memos.

**Where it comes from.** The loader reads the save's `played` quarters and builds each report with the result screen's own functions (`src/result/result-data.ts`). The browser gets only what the result screens already send: no seed, no model and no future quarter. A shop report runs no queries, so it records no discovery evidence.

## 3. The player's reports

### What one is

A report is a titled set of **up to 6 charts**, each with an optional note, and an optional summary note at the top.

```ts
interface PlayerReport {
  id: string;
  title: string;            // 1 to 80 characters
  summary?: string;         // up to 1,000 characters
  items: { spec: PinSpec; note?: string }[];  // 1 to 6; each note up to 500 characters
  /** The quarter being played when it was created and last edited, for "edited Q2 2194". */
  created: QuarterId;
  edited: QuarterId;
}
```

- **A chart in a report is a copy of the pin,** not a link to it. Unpinning a chart, or the board dropping it past its 8, leaves every report as it was.
- **Each chart runs again when it's shown,** through `POST /api/query`, as pins do (`runPin`). Nothing a chart showed is stored. The 2193 data and played quarters never change, so a chart filtered to a quarter shows the same thing every time. A chart over every quarter grows as quarters are played; its caption says so (*draft*: `Every quarter played so far`).
- **The limit is 12 reports** (*tune*). At 12, `New report` explains why it's off (*draft*: `You have 12 reports. Delete one to start another.`).

### How it's made

There are two ways in, and both open the same editor:
1. **From Reports:** `New report` opens the editor with the pinned board listed as checkboxes. The player ticks up to 6 and names the report.
2. **From a pinned chart in Investigate:** each pin's menu gains `Add to report`, with the player's reports listed, plus `New report…`. Adding to a full report is refused (*draft*: `This report has 6 charts.`).

Charts Dewey pinned can go in a report like any other pin. Dewey itself can't make or edit reports (section 6).

### Naming and editing

- **The editor** is the report itself, in edit mode: the title as a text field, the summary, each chart with its note field, and `Move up`, `Move down` and `Remove` on each chart. `Add charts` lists the board again.
- **Saving:** `Save report` writes the whole report in one action; `Cancel` puts it back. A report can't be saved without a title or with no charts. Leaving with unsaved changes asks first (React Router's `useBlocker`).
- **Delete:** `Delete report` asks once in an alertdialog, as Decide's confirm does, and is final.
- **No formatting:** notes are plain text, with line breaks kept. No links, no markdown.

### Where it's kept

- **In the save, on the server** (`GameSave.reports`), written by the Reports route's action and checked there: the spec with `parsePinSpec`, then the lengths and counts above. So `Play again` starts with no reports, as it starts with no played quarters, and Decide's loader can read them.
- **Pins stay in the browser** for now, as they are (`usePins`, with its TODO to move into the save). Reports copy pins, so they don't wait for that move.
- **Notes are the player's own words.** They stay in the save on this computer. They never go into analytics, which counts them and their lengths only. Dewey never sees them (section 6).

## 4. Reports in Decide

In Decide, the player can open their reports beside the plan. They read their evidence where they decide, without leaving the form.

- **The button:** `Your reports ({n})` sits in the plan form's header, beside the form's serial. With no reports, it reads `No reports yet` and links to Reports (*draft*).
- **The panel:** a side panel over the boss scene, right-aligned, 480 px wide (the full width under 1100 px). It lists the reports by title. Choosing one shows its summary, then its charts at 220 px high, each with its note, read-only. `Edit in Reports` leaves for `/reports` and asks first if the plan has picks or a move.
- **The plan is never touched.** The panel is a dialog that keeps the form's state, as the picker does through the 3D scene's swap. Closing it returns focus to the button. Escape closes it.
- **The shop's reports are there too,** under the player's, by quarter: score, against goals and plan only, so the player can see what they did last time.
- **Evidence for discoveries:** a report's charts run through `/api/query`, so before the plan is submitted they count exactly as the same pin would on Investigate's board. No new rule, and no way to earn a discovery the views couldn't already earn.
- **The plan doesn't cite reports** (section 9, later). `plan_submitted` counts the reports read in the panel (section 5), so we can see whether evidence was looked at before deciding.

## 5. Analytics

Every event says what happened, never content: no titles, summaries, notes or chart titles. `docs/analytics.md` and the privacy page (`public/privacy.html`) gain each one.

| Event | When | Props |
| --- | --- | --- |
| `reports_viewed` | `/reports` shows | `shopReports`, `newShopReports`, `playerReports` (counts) |
| `report_shop_opened` | a shop report's card or full results is opened | `quarter`, `new` (bool), `via`: `card` or `results` |
| `report_created` | a new report is saved | `charts`, `notes` (count with a note), `summary` (bool), `from`: `reports` or `investigate` |
| `report_edited` | an edit is saved | `charts`, `notes`, `summary`, `renamed` (bool), `added`, `removed`, `moved` (counts) |
| `report_edit_cancelled` | `Cancel`, or leaving with unsaved changes | `changed` (bool) |
| `report_deleted` | a report is deleted | `charts` |
| `report_refused` | save refused | `reason`: `full`, `limit`, `no_title`, `no_charts`, `invalid` |
| `report_chart_failed` | a report's chart can't run | `code`, as `investigate_pin_failed` has it |
| `investigate_pin_reported` | `Add to report` on a pin | `kind`, `pinnedBy`, `to`: `existing` or `new` |
| `plan_reports_opened` | Decide's panel opens | `quarter`, `playerReports`, `shopReports` |
| `plan_report_read` | a report is chosen in the panel | `quarter`, `type`: `player` or `shop`, `charts` |
| `plan_submitted` (existing) | gains `reportsRead` | count of reports chosen in the panel before submitting |

Server side, the Reports action records `game_report_saved` and `game_report_refused` with the same counts and reasons, so a refusal the browser didn't see is still counted.

## 6. Dewey

- **Dewey doesn't read reports.** Notes are the player's words and their reasoning, and Dewey answers only from the query layer (requirements, "Its limits"). Reading them would be a channel for the player's guesses to come back as Dewey's.
- **Dewey's pins already go on the board,** so its charts reach reports through the player, who chooses them.
- **Later:** "add this to my report" as a Dewey tool, with the same spec and checks as `pin_chart`.

## 7. Phones

Phones get the robot, not the game (requirements: "On phones? HEAVENS NO", David, 30 Oct). The check is in `src/root.tsx`, before the game mounts, so a phone never reaches `/reports`, and Reports needs no phone layout. Narrow desktop windows are covered in section 1.

## 8. Room for Frank's charts (`analytics-depth.md`, #169)

- **New dimensions** (edition, list price, awarded, series volume, items per order) arrive as `Query` fields. A pin that uses them is a pin like any other, and reports hold it unchanged.
- **New chart kinds** (a heatmap pin, say) join `PIN_KINDS`. `parsePinSpec` is the one place a report checks its charts, so reports gain them in the same change.
- **Frank's profiles** (authors, publishers, series, awards and libraries, items 7 to 10, "read rather than queried") fit as a third section of this page, **The station's records**, under the player's reports, with their own loader. A profile could also be a report item (`kind: "profile"`, by id), so a player can put an author's page beside a chart. Both wait for his proposal to be approved.

## 9. Today and later

The deadline is 3 November, so "today" means what one agent can build and get reviewed by then.

**Today:**
1. `/reports` and the nav item's `to`, with the badge.
2. The shop's reports: tiles, overall by quarter, the record (the half-year review's rows until #168 lands), one card per quarter, `reportsSeen`.
3. The player's reports: create from Reports or from a pin, edit, reorder, delete, kept in the save, with the checks in section 3.
4. Decide's panel, read-only, with player and shop reports.
5. The analytics in section 5, in `docs/analytics.md` and on the privacy page.
6. Tests: the save's checks (lengths, counts, bad specs), the loader sending no seed or model, the panel keeping the form's state, and an e2e that builds a report from two pins and opens it in Decide.

**Later:**
- The Event column and the shop report's Event part, once Alma is wired in (#170). Until then they read `None`, and nothing else changes.
- The annual review's year lines, with the endless game.
- Frank's profiles, as **The station's records** (section 8).
- Citing reports in a plan, so the result can say `You decided with: The quiet picks.`
- Dewey adding to a report (section 6).
- Printing or exporting a report.
- Moving pins into the save (the existing TODO).

## Decisions for David

1. **One page, shop reports on top, the player's below** (section 1), as David chose. The alternative: two tabs on the page, for a shorter scroll.
2. **A shop report gathers the result screen; it adds no new data** (section 2). The alternative: add something the result doesn't show, such as each month's sales, which would need its own queries and copy.
3. **Charts are copies of pins, run again when shown** (section 3). The alternative: store the rows each chart showed, a snapshot, which never changes but stores data the save doesn't need, and bypasses the query layer's checks.
4. **Reports live in the save, so Play again clears them** (section 3). The alternative: keep them in the browser, as pins are, so they outlive a game but can't reach Decide's loader.
5. **Decide's panel is read-only, and the plan doesn't cite reports** (section 4). The alternative: a `Cite` button per report, shown on the confirm step and in the result.
6. **Dewey doesn't read reports** (section 6). The alternative: let Dewey read titles only, so "open my weekday report" could work.
7. **Up to 12 reports of 6 charts** (section 3). The alternative: one board-sized report (8 charts), or no limit but the save's size.
