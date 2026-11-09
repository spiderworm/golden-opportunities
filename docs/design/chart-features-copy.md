# Chart features: the copy

Status: **for the builders.** These are the strings for David's three chart features (req_bef8599d5ea4, 3 Nov 2026), written before they're built so each builder has them now. Plot owns the copy and is the second reviewer on each UI PR. Builders may add strings this note doesn't foresee; send those to Plot in the PR.

The house rules hold: US English, no emoji, sentence case, and the toolbar's existing patterns. Dates are the one in-world exception, year first: `2194 Apr 1`, `2194 Mar` (David, 3 Nov 2026). Today a disabled button's tooltip says what to do ("Show one measure to compare quarters"), and a toggle keeps its name while it's pressed (`aria-pressed`, as `Table` and `Compare quarters` do).

## The View menu (Chart)

The chart's modes sit in one menu instead of a row of toggles (#341). David named it: asked about calling it "View", he said "Oh YEAH "View" is spot-on. Thanks. Ship it" (req_7fccd7d02625).

- **The button:** `View`. With modes on, it shows `1 on` (or `2 on`) in muted text, and its accessible name is `View, 1 on`.
- **The items, in this order:**
  1. the ways to compare: `Compare quarters`, `vs. same quarter last year`, and `What drove the change`, with `Split into price, volume and mix` indented under it;
  2. the ways to show one measure: `% of total`, `Running share`;
  3. `Events`;
  4. `Scatter plot`, last, since it's the only one that needs two measures.
- **A disabled item** stays in the menu, and its reason shows as a tooltip on hover, keyboard focus and tap. The reason is also the item's accessible description. There's no line of text under it, so a menu with several unavailable items stays short (David, req_470d24167113: "Need tooltips on hovered view options in the dropdown that aren't available. Explanations as to why". Goldy put Plot's version to him, the tooltip alone with no grey line, and he said "Plot's version sounds right", req_31fff59ef50a). The sections below give each item's reasons.

## 1. Table and chart, either way (Chart; Sage for Dewey)

David: "I'd like to allow (as often as we can make work) tables to toggle to charts, and charts to toggle to tables. In cases where dewey puts both in chat, they only need to do one."

- **The control is the existing `Table` toggle,** everywhere: Investigate's chart, pins, and Dewey's lookups in chat. Pressed, it shows the table, and unpressed, the chart. Something that starts as a table, like a Dewey lookup or a table pin, starts with `Table` pressed. One name in every place, and the name never changes with the state.
- **When Dewey shows both a chart and a table of the same lookup,** only one gets the toggle, as David says. It goes on the chart.
- **Where there's no chart to draw,** the button is disabled, with one of these tooltips:

| Why | Tooltip |
| --- | --- |
| No breakdown: a single figure | `A single figure has no chart` |
| More groups than the chart draws | `Too many groups to chart ({n}). Filter to {max} or fewer.` |
| A comparison of two values (Dewey's `comparison`) | `Two values read best as a table` |
| Nothing matches a report chart's filters and the report's segment (#407) | `Nothing matches, so there's no table or chart` |

- **Analytics:** Investigate's `investigate_table_toggled { shown }` stays as it is. Pins and Dewey record the same `shown`, under event names their builders choose.

## 2. vs. same quarter last year (Frank)

David: "Period-over-period as a toggle on any chart. A switch for "vs. same quarter last year" that adds Δ and % change columns or a ghost series."

- **The toggle's name:** `vs. same quarter last year`, David's words. It's a toggle like `Compare quarters`, beside it, and keeps its name while pressed. It starts in lower case, as he wrote it, because it reads on from the chart's name, as a phrase after it. The chart's title follows its own rule, below.
- **Disabled, with tooltips:**

| Why | Tooltip |
| --- | --- |
| The quarter shown is in 2193, which the ledgers start with | `The ledgers start in 2193: there's no year before it to compare` |
| No single quarter in the quarter filter, whatever the breakdown (title, genre, weekday or none) | `Filter to one quarter to compare it with last year` |
| A breakdown by quarter | `Break down by something other than quarter to compare with last year` |
| More than one measure is shown | `Show one measure to compare with last year` |
| `Compare quarters` is on | `Turn off Compare quarters to compare with last year` |
| Ratings or average rating, which aren't recorded by quarter (pins and Dewey; every Investigate chart measure is dated) | `Ratings aren't recorded by quarter, so there's no last year to compare` |
| Checkouts, which have months but no year | `Checkouts aren't recorded by year, so there's no last year to compare` |
| The quarter in the filter isn't in the ledgers: not played yet, or a stale link | `{Q3 2196} isn't in the ledgers yet: filter to a quarter that's been played` |
| Last year's quarter isn't visible to the player (can't happen today: the ledgers run on from 2193) | `{Q3 2193} isn't in the ledgers, so there's nothing to compare` |
| Nothing in the quarter matches the filters | `Nothing in {Q1 2194} matches these filters, so there's nothing to compare` |
| Any other refusal, so a reason always shows | `Can't compare this chart with last year` |

  David asked for a reason whenever the toggle is unavailable: "When "vs. same quarter last year" is not available, can we get a tooltip explaining why? ie, no data, the bookstore was not open same quarter last year, invalid series, whatever" (req_d5257c07a9f0). So every disabled state has a tooltip, and the fallback covers anything unforeseen. Builders should report it if they ever hit it. The disabled toggle stays focusable, with its reason shown on hover and focus and linked by `aria-describedby`, so keyboard and screen-reader users get it too (Frank). When a measure not recorded by quarter is the only one shown, its line outranks `Show one measure…`. When only last year is empty, the toggle stays on. Sums and counts read `$0` or `0` with `New`; averages read `None`, with `Δ` and `% change` left empty (Audit, #296). The quarter is written as `formatDimensionValue` gives it.

  And the other way round: while this toggle is on, `Compare quarters` is disabled with `Turn off vs. same quarter last year to compare quarters` (Frank, #291).

  A breakdown by month within one quarter is allowed: each month is compared with the same month last year. Any other breakdown it can't do takes the same pattern, `Break down by something other than {dimension} to compare with last year`.

- **The table's columns,** after the dimension's column:

| Column | Header | Cell |
| --- | --- | --- |
| This quarter | the quarter, `Q1 2194` | the value, in the measure's format |
| Last year | the quarter, `Q1 2193` | the value |
| Change | `Δ`, with the accessible name `Change` | `+$2,300`, `-140`, `+0.12`, or `+2.3 pts` for average discount |
| Percent change | `% change` | `+22.8%`, `-4.1%`, `0.0%` |

  - **Signs** follow Investigate's `change()` in `src/investigate/format.ts`, as the tiles do: a hyphen-minus for down and `+` for up. For average discount, `Δ` is in points and `% change` is left empty, because a percent change of a percentage only confuses.
  - **A zero base:** last year 0 and this year above it: `% change` reads `New`. Both 0: `0.0%`. Last year above 0 and this year 0: `-100.0%`.
  - **A group with no sales in one year** (a title not yet published last year) shows `$0` or `0` for that year, so `% change` reads `New`, or `-100.0%` if only last year has sales. `None` is only for no figure at all: an average over no sales (Frank, #291).
- **The ghost series** is the same measure for the same quarter last year, drawn lighter behind or beside this year's:
  - **Legend:** this year's series is named by its quarter, `Q1 2194`, and the ghost by its own, `Q1 2193`. With a breakdown by month, by the year: `2194` and `2193`.
  - **Tooltip:** the group, then both values and the change:
    ```
    March
    Q1 2194: $41,200
    Q1 2193: $38,900
    Change: +$2,300 (+5.9%)
    ```
    From a zero base, `Change: +$400 (New)`. For average discount, in points alone: `Change: +2.3 pts` (Frank, #291).
  - **The chart's title** gains `, vs. Q1 2193`: `Revenue by month, vs. Q1 2193`.
- **Pins and Dewey:** a pinned chart keeps the toggle's state, and its title says so as above. Dewey doesn't get the toggle in this round, unless Sage adds it with the Table toggle.

## 3. Scatter plots (Sage)

David: "Scatter plots: two measures across one dimension."

- **Choosing it:** a toggle `Scatter plot`, beside `Table`. With two measures chosen it's enabled, and its tooltip is `Plot one measure against the other, one point per {dimension, lower case}`, for example `one point per title`. Pressing it and `Table` together shows the table, which has the same columns either way.
- **Disabled, with tooltips:**

| Why | Tooltip |
| --- | --- |
| One measure | `Choose a second measure for a scatter plot` |
| Three measures | `A scatter plot shows two measures` |
| A breakdown by quarter, month or weekday | `Break down by title, genre or another group for a scatter plot` |
| No breakdown | `Break down by a group for a scatter plot` |

  A time breakdown is refused because a line chart already shows two measures over time, and a scatter of twelve months hides their order.
- **Axes:** the first measure chosen runs along the bottom, the second up the side. Each axis is titled with the measure's label, from `MEASURE_LABELS`, and its unit where it has one. Counts have none:

| Measure | Axis title |
| --- | --- |
| `revenue` | `Revenue ($)` |
| `units` | `Units sold` |
| `orders` | `Orders` |
| `avg_discount` | `Average discount (%)` |
| `avg_rating` | `Average rating (stars)` |
| `checkouts` | `Checkouts` |
| `avg_order_value` | `Average order value ($)` |
| `orders_per_day` | `Orders per day` |
| `ratings` | `Ratings` |

  The ticks use the measure's format, compact as on the other charts.
- **The chart's title:** `{Second} against {first, lower case}, by {dimension, lower case}`, for example `Units sold against revenue, by title`, as Dewey's titles have it.
- **A point's tooltip:** the group's name as `formatDimensionValue` gives it, then each measure:
  ```
  The Quiet Picks
  Revenue: $4,120
  Units sold: 212
  ```
- **No labels on the points:** too many of them overlap. The tooltip and the table name them.
- **Row limits** keep the chart's existing source line ("Showing {n} of {total} groups").

## 4. How much evidence is behind a number (Sim)

David: "I'd also like to add showing how much evidence is behind a number. Show n next to averages, add error bars on average rating, and flag a comparison when the difference is "within noise"" (req_291078459e6d).

- **n next to averages:**
  - The column header is `Based on`, not a bare `n`, which non-statisticians won't read.
  - The cell names its unit: `212 ratings`, `1,240 orders`, `3,410 sale lines` or `90 days`, whichever count the average is over. One item reads `1 rating`.
  - A tooltip line goes after the value: `Based on 212 ratings`.
- **Low n,** below Sim's threshold:
  - Tooltip line: `Only 8 ratings: this average could easily change with a few more`.
  - If low-n bars or rows are faded, the caption is `Faded where there are fewer than {k} {ratings}`. Fade only for counts of ratings, orders or sale lines, never days: a breakdown by month and weekday would always fade (Sim, #296).
- **Error bars on average rating:**
  - Legend: `Likely range (95%)`.
  - Tooltip line: `Likely range: 3.9 to 4.3 stars`, with stars to one decimal place. When both ends would read the same at one decimal, two: `Likely range: 4.18 to 4.24 stars`, never "4.2 to 4.2" (Probe, #337; Sim, #340). Dewey's range follows the same rule.
  - When every rating is the same, from 2 ratings up, there's no bar, and the line says so and why: `All 3 ratings are 5 stars, so there's no likely range to give.`, or `Both ratings are 4 stars, …` for two, with `1 star` in the singular (Sim, #342). Dewey's `range` ref will give the same line once Sage's follow-up lands; until then his sentence with it is withheld (Audit, #343).
  - Below 2 ratings there's no bar, and the tooltip line reads `Too few ratings for a likely range`. Ranges are clipped to 1 to 5 stars, and the tooltip shows the clipped figures (Sim, #296).
  - Error bars appear wherever average rating is drawn: Dewey's lookups, pins made from them, and reports. Investigate's own chart doesn't offer average rating (Audit, #296).
  - The legend's tooltip is one plain line: `Where the average would most likely land if as many readers rated again. Fewer ratings, wider range.`
- **Within noise,** on a comparison (Compare quarters, vs. same quarter last year, Dewey's comparisons):
  - Flag: `Within noise`, as a badge beside the change, or in the change cell after it, `+2.1% · within noise`.
  - Tooltip: `A difference this small often shows up by chance with this much data, so don't read much into it.`
  - A clear difference gets no flag, and nothing is labeled "significant". No flag also covers a comparison that can't be judged: a missing flag makes no claim (Sim, #296).
  - From a zero base, both can show: `New · within noise`.
  - Compare quarters has no change cell, so a quarter's tooltip says `Within noise against Q1 2193` when its difference from the quarter drawn before it is within noise (Sim, #311).
- **Beside last year** (vs. same quarter last year, #322): an average's table gets a `Based on` column after `% change`, with both years' counts in the columns' order and the unit once, `1,240 and 980 orders`. The singular applies only when both are one, `1 and 1 rating`, and "and" is used, not "/", which reads as a ratio. The row fades when either year is under the threshold. The tooltip has one line for the two, `Based on 1,240 orders (Q1 2194) and 980 (Q1 2193)`, in place of each series' own.

## 5. What drove the change (Sim)

David: "Change decomposition. A waterfall showing which genres, titles or editions drove a change in revenue, and optionally a price/volume/mix split" (req_7a41bd439666).

- **The control:** a toggle `What drove the change`, beside the others, keeping its name while pressed. Its tooltip, when it's available: `See which {genres|titles|editions} added to revenue and which took away`.
- **What it compares:** the filtered quarter against the quarter before it. With `vs. same quarter last year` on, against that quarter instead.
- **The title:** `What drove revenue's change, Q4 2193 to Q1 2194, by genre`, with the dimension in lower case.
- **The bars:**
  - the start and end bars are the quarters alone, `Q4 2193` and `Q1 2194`, since the axis says revenue;
  - one bar per group, named as `formatDimensionValue` gives it;
  - the rest in one bar, `Everything else`, with the tooltip `{n} more {genres|titles|editions}, together`.
- **A bar's tooltip:**
  ```
  Fiction
  Change: +$4,120 (+12.0%)
  From $34,300 in Q4 2193 to $38,420 in Q1 2194
  ```
  - A group new this quarter reads `Change: +$400 (New)`, and one gone reads `-100.0%`, as the last-year table does.
  - The start and end bars read `Q1 2194: $412,500`.
  - "to" is used, never an arrow character, which some systems draw as emoji.
- **The split:** a toggle `Split into price, volume and mix`. When it's on, each bar's tooltip adds one line, `Price +$600 · Volume +$3,100 · Mix +$420`. The legend items and their tooltips:
  - `Price`: `The same books selling for more or less each.`
  - `Volume`: `More or fewer books sold in all, at the old prices.`
  - `Mix`: `Sales shifting toward pricier or cheaper books.`
  - A group new in the later quarter has no price to compare, so its line reads `New in Q1 2194, so no price change: Volume +$240 · Mix +$160`. One gone from it reads `Not sold in Q1 2194, so no price change: Volume -$240 · Mix -$160`. Naming the quarter keeps it right whichever quarter it's compared with (Sim, #328). In the table, such a group's Price cell reads `None` (Sim, #335).
- **Within noise** shows on the change line and the % cell, `Change: +$30 (+3.0%) · within noise`, with no fade, since fading means few items elsewhere (Sim, #335).
- **The table's last row** is `Total` (Sim, #335).
- **The axis:** the totals' bars stand on a round number below every change, not on zero, so a small change stays visible. Then the caption says so, in the axis's own format, before the source: `The axis starts at $80K, not at zero, so small changes show.` It's shown only when the axis starts above zero (Chart and Sim, #335).
- **Discoveries:** a waterfall is a view the player turns on, so its drawn bars count as evidence, as two chart views would. Groups folded into `Everything else` don't count, and the split adds none of its own. A pinned waterfall is context, as pins always are (#335, #339).
- **Disabled, always with a reason:**

| Why | Tooltip |
| --- | --- |
| Not revenue | `Show revenue to see what drove its change` |
| More than one measure | `Show one measure to see what drove its change` |
| Not by genre, title or edition | `Break down by genre, title or edition to see what drove the change` |
| No single quarter in the filter | `Filter to one quarter to see what drove its change` |
| The first quarter | `Q1 2193 is the first quarter in the ledgers: there's nothing before it to compare` |
| A quarter not yet played | `{Q3 2196} isn't in the ledgers yet: filter to a quarter that's been played` |
| Compare quarters on | `Turn off Compare quarters to see what drove the change` |
| Scatter plot on | `Turn off Scatter plot to see what drove the change` |
| Nothing matches | `Nothing in {Q1 2194} or {Q4 2193} matches these filters, so there's no change to explain` |
| Any other refusal | `Can't break down this chart's change` |
| The split, with the waterfall off | `Turn on What drove the change to split it` |
| The split, when one quarter's rows were cut by the row limit | `Too many {titles\|editions} to split into price, volume and mix: filter to fewer` |
| The split, any other refusal | `Can't split this change into price, volume and mix` |

  While the waterfall is on, Compare quarters reads `Turn off What drove the change to compare quarters`, and Scatter plot reads `Turn off What drove the change for a scatter plot`.

## 6. Share of the total (Chart)

David: "Pareto and share-of-total. "% of total" as a display mode, plus a cumulative-share curve ("the top 5 titles are X% of revenue")" (req_fa2e6a0dbbec).

- **The toggles,** beside the others, keeping their names while pressed:
  - `% of total`, in David's words: each group's share instead of its value. Its tooltip, when it's available: `Show each {genre|title|…}'s share of all {revenue|units sold|…}`.
  - `Running share`, the cumulative curve. "Pareto" is jargon for players. The bars run largest first, with a line climbing to 100%. Its tooltip: `Largest first, with a line adding up their share as it goes`.
- **Labels:**
  - The table gets a `Share` column after the value, and in running mode `Running share` too.
  - The axes are `Share of revenue (%)` and the curve's own `Running share (%)`.
  - The title gains `, as shares`, or `, largest first, with the running share`, as in `Revenue by title, largest first, with the running share`.
- **The headline,** in running mode only, at the top 5 (or all, if fewer): `Top 5 titles: 62.3% of revenue`, or `Top title: 18.0% of revenue` for one. It uses the dimension's plural and the measure's label, both in lower case, and one decimal place.
- **Tooltips:** a bar reads `Fiction: $38,420, 18.0% of revenue`, and a point on the curve reads `Top 3 genres: 54.1% of revenue`.
- **Shares are of the full total,** the one before the row limit, as the source line says. Where rows are cut, the caption adds `Shares are of all {titles}, not only those shown.`
- **Chart's calls (#358):**
  - **Plurals:** `discount rates`, `price bands`, `list prices`, `award groups` and `series volumes`, besides the obvious ones. The singular drops the s.
  - **With both ticked, the View button says `2 on`.**
  - **Turning Running share off** returns to plain `% of total`.
  - **A last-year reason that already applies** (`The ledgers start in 2193…`) comes before `Turn off % of total…`.
- **Where:** Investigate's chart, pins and reports first. Dewey's chat follows with Sage, using the same strings.
- **Disabled, always with a reason:**

| Why | Tooltip |
| --- | --- |
| An average (average discount, rating, order value, orders per day) | `An average has no share of a total: show revenue, units sold or orders` |
| Orders by a book-level group (genre, title, author, format, publisher, series, edition, price band and the like); orders by month, quarter or weekday add up and are allowed | `An order with books in several {genres} counts in each, so their shares would add to more than 100%` |
| More than one measure | `Show one measure to see its share` |
| Running share by month, quarter or weekday (`% of total` is fine there) | `Break down by title, genre or another group for a running share` |
| Compare quarters on | `Turn off Compare quarters to see shares` |
| vs. same quarter last year on | `Turn off vs. same quarter last year to see shares` |
| Scatter plot on | `Turn off Scatter plot to see shares` |
| What drove the change on | `Turn off What drove the change to see shares` |
| Any other refusal | `Can't show shares for this chart` |

  While shares are on, each of those toggles reads `Turn off % of total to {compare quarters|…}`.

## 7. Events on the timeline (Frank)

David: "I think it would be good to support event markers on time series. ie, mark the new volume's release (Feb 4), each Book of the Month pick, the player's Q1 move, and later Alma's events" (req_13c07b31a790).

- **The View item:** `Events`, a tick box like the others. Its hint: `Mark releases, Book of the Month picks, your moves and station events on the timeline`.
- **Marker labels,** short, on the chart and in the legend: `Release`, `Pick`, `Your move` and `Event` (Alma's station events).
- **Tooltips:** the date and kind, then what happened.
  - **Release:** `2194 Feb 4 · Release`, then `The Bourton Model Village Poisoning, Inspector Ryeslton volume 3`.
  - **Pick:** `2194 Mar · Book of the Month`, then the edition's title and format, without its price, e.g. `Portmeirion, mass market paperback` (Frank, #353).
  - **Your move:** `Q1 2194 · Your move`, then the move's name exactly as Decide has it (`MOVES`): `Station-wide sale`, `Weekday author nights` or `Re-pick Book of the Month`. Holding course isn't a move, so it gets no marker. A re-pick gets both its own marker and the picks it chose, so on January 1 the move and January's pick draw as one `+2` (Frank, #353).
  - **Event:** `Q3 2194 · Station event`, then the event's short title (`eventTitle`) alone. Alma's events aren't on the chart yet: `src/game/events.server.ts` builds releases, picks and moves only (Chart, #360).
  - Dates are in the game's one style, year first (`src/platform/dates.ts`; David: "2194 Apr 1 ... that's a much better style than every other"): `2194 Feb 4` for a day, `2194 Mar` for a month, and `Q1 2194` for a quarter. Markers have no arrow or symbol characters.
- **Crowding:** where markers overlap, one is drawn with `+{n}`, e.g. `+2`, and its tooltip lists each in date order. Past 12 markers, the labels would collide, so only the lines and tooltips show, and the caption says `Labels hidden for {n} events: filter to one quarter to see them.` (`1 event` in the singular). Past the 60-marker cap, events aren't drawn at all, and the caption says `{n} more events hidden: filter to one quarter to see them all` (`1 more event hidden: …`). When both apply, each is its own line. An event off the chart's axis is neither drawn nor counted: the server already drops events outside the filters, and the rare row-limit cut is told by the source line (Frank, #357).
- **Beside a book breakdown,** an event's second line adds its group in brackets, `… volume 3 (Mystery)` (Frank, #357).
- **Nothing to mark** isn't a disabled state. The caption says `No events in this period.`, as for 2193 and quarters not yet played. A quarter not yet played is never marked: no spoilers.
- **Disabled, always with a reason:**

| Why | Tooltip |
| --- | --- |
| No time axis (any breakdown but month or quarter, weekday included) | `Break down by month or quarter to mark events` |
| Scatter plot on | `Turn off Scatter plot to mark events` |
| Any other refusal | `Can't mark events on this chart` |

## 8. Saved segments (Sim)

David: "Named filter sets ("awarded paperbacks under $20") that can be applied to any chart or to a whole report. The filters already exist, so this is mostly UI and storage in the save" (req_7a658226468d).

- **Saving:**
  - On the filter bar, after `Add a filter`, there's a `Save as segment` button. With no filters on, it's disabled with `Add a filter to save it as a segment`.
  - The dialog is titled `Save these filters as a segment`, with the field `Name` and the buttons `Save segment` and `Cancel`. The name is prefilled from the bar's own words, in its order, as in `Trade paperback, Award winner`, cut to fit the 60-character limit (Sim, #387).
  - Its errors:
    - `Give the segment a name.`
    - `Keep the name to 60 characters.`
    - `You already have a segment called "{name}".`
    - `These filters are already saved as "{name}".`
    - `You have {20} segments. Delete one to save another.` (the limit, `SEGMENT_LIMITS.segments`)
    - `This name can't be saved. Check it and try again.`
    - `A segment holds up to {50} filter values. Remove some to save it.` (singular: `1 filter value`)
    - when another tab deleted it first: `That segment was deleted in another tab.`, and the menu refreshes without it
    - when the save is busy and the draft is kept: `Your segment didn't save. Please save it again.`, as Reports has it
- **The control:** `Segment`, a dropdown at the start of the filter bar. It reads `Segment: None` or `Segment: {name}`. Choosing one puts its filters on the bar, and if the player then changes a filter, it reads `Segment: {name}, edited`. Choosing `None` takes the filters off again, edits included (Sim, #387). When there are none, the menu says `No segments yet. Add filters, then choose Save as segment.`
- **Managing,** from each segment's row:
  - `Rename`, with the title `Rename segment`, the field `Name`, and `Save` and `Cancel`;
  - `Edit filters`, which applies the segment and offers `Update "{name}"` on the bar;
  - `Delete`. If anything uses the segment: `Delete "{name}"? It's used by {2 pinned charts} and {1 report}. They'll go back to their own filters.` (singular for one, and only the parts that apply). If nothing does: `Delete "{name}"? This can't be undone.` The buttons are `Delete segment` and `Keep it`.
- **Where it shows:**
  - on a pin's card or a report's chart: `Segment: {name}`, small, under the title;
  - for a whole report: the editor's field `Segment for this report` (with `None`), and under the report's title, `Every chart here shows {name}.`
- **Edge cases:**
  - `Nothing matches both this chart's filters and {name}.`
    That line stands alone: the period caption above it (`Every quarter played so far`) is hidden, and the `Table` toggle is disabled with `Nothing matches, so there's no table or chart`, keeping its pressed state (#407).
  - When the segment is gone, on what used it: `This used a segment that's no longer saved, so it shows its own filters now.` One line covers both ways it goes: the player deleted it, or started a new game (Play again or Reset game), which keeps the browser's pins but starts with no segments. "Deleted" would blame the player for a reset they didn't think of as deleting anything (Audit, #407).
- **Privacy:** segment names are the player's own words, kept in the save and never in analytics, which records counts only, not even lengths. The privacy page's line: `…and the names of segments you save. The play data counts them, never what they say.`

## 9. Relative quarters, and running a report for another quarter (Sim)

David agreed the design: "Agreed on all points. Let's do it" (req_a59d77f07115).

- **In the quarter filter,** above the dated quarters: `Latest quarter` (the newest quarter with sales), `Quarter before latest`, and `Same quarter, a year earlier`. None is "this quarter": a quarter being planned has no sales yet.
  - Their shared tooltip: `Moves on as you play: always counted from the newest quarter with sales`.
  - They're shown resolved on the chip, the summary and a pin's card: `Latest quarter: Q1 2194`, `Quarter before latest: Q4 2193`, `Same quarter, a year earlier: Q1 2193`.
  - When one is unavailable: `{Q1 2193} is the first quarter in the ledgers: there's no quarter before it`, or `The ledgers start in 2193: there's no year before it`.
  - A pin or report item made on one keeps it relative, so it moves on with the game (#379).
  - A pinned waterfall moves on too (#380). It's titled `What drove revenue's change into the latest quarter, by {genre}`, or, with last year on, `What drove revenue's change from a year earlier to the latest quarter, by {genre}`, with the resolved line under it. On a fresh save, a year-earlier one shows `The ledgers start in 2193: there's no year before it` in place of the chart.
- **`Run for…` on a report:**
  - It's a button beside the report's title. Its picker, titled `Run this report for`, offers `As saved` (the default), the three relative quarters, then each played quarter, newest first.
  - Charts move by the same number of quarters, counted from the report's newest, so each keeps its own span (Goldy's call). The note says `Run for Q1 2194: every chart moves by the same number of quarters, so each keeps its own span.`, with the button `Back to as saved`.
  - A chart over every quarter isn't moved, and says `Over every quarter, so it stays as saved.`
  - A chart that can't move says why:
    - `This chart can't run for Q1 2194, so it shows as saved.`
    - `Moving this chart would go past the ledgers, so it shows as saved.`
    - the undated reasons from section 2 (`Ratings aren't recorded by quarter, …`).
  - Running a report for another quarter changes nothing saved.

## 10. Forecasts (Frank and Chart)

David: "Build it now. Forecast revenue and total units with hints, values for previous quarter and same quarter previous year, displayed" (req_6d136a2b7fb3).

- **At Decide:**
  - The section is `Your forecast (optional)`, using David's word. Closed, it shows `Add a forecast`, and leaving it closed is the skip. Open, it offers `Remove forecast`.
  - The explanation: `Say what you expect, and a range you're 80% sure of: wide enough that you'd be surprised only 1 time in 5 to see the real figure outside it.`
  - For each of `Revenue` and `Units sold`, there's `Expected`, then `80% range`, with `From` and `To`. The accessible names are in full: `Expected revenue`, `Revenue, low end of the 80% range`, `Revenue, high end of the 80% range`.
  - Under each measure, the hints: `Q4 2193, the quarter before: $161,525` and `Q1 2193, a year earlier: $94,210`. When the year earlier is outside the ledgers: `Q1 2192, a year earlier: not in the ledgers`.
  - The note, `Why? (optional)`, has the placeholder `What you expect to move these, in a line or two.` It holds up to 500 characters. It's the player's own words, kept in the save and never in analytics. The privacy page names it, with Chart's Decide PR.
  - Refusals, shown by their fields:
    - `Enter a number.`
    - `Revenue can't be below $0.` / `Units sold can't be below 0.`
    - `That's more than this shop could sell in a quarter.`
    - `The low end can't be above your expected figure.`
    - `Your expected figure can't be above the high end.`
    - `Fill in all three for revenue, or leave them all empty.`
    - `Keep the note to 500 characters.`
    - with control or reordering characters, which reports and segments refuse too: `This note can't be saved. Check it and try again.`
- **On the result page,** under the heading `How your forecast did`, a line for each measure forecast. The percent is of the real figure (Frank, Sim, Chart):
  - `Revenue: $142,300, inside your range of $130,000 to $150,000. You expected $140,000: off by $2,300 (2%).`
  - outside the range, `above` or `below` in place of `inside`;
  - when the printed figures match: `…You expected $142,300: spot on.` `off by` is the gap between the printed figures, so the line never reads `off by $0` (#397).
  - a miss that rounds to 0%: `off by $500 (under 1%)`, never `(0%)` (Audit, #396); with a real figure of 0, no percent at all.
- **In Reports,** a section `Your forecasts`, also shown read-only in Decide's panel:
  - `3 of 5 quarters forecast` (singular: `1 of 1 quarter forecast`). With none at all: `No quarter forecast yet: add one when you plan.`
  - With fewer than 3: `Too few forecasts to judge yet: {2} so far.`
  - For each measure:
    - `Hit rate`: `2 of 3 inside your range (target: 4 in 5)`. Its tooltip: `How often the real figure landed inside your 80% range. Well calibrated is about 4 times in 5.`
    - `Bias`: `You tend to forecast high, by 4.2% on average.` or `…low, by…`, and within ±2%, `No lean either way.` Its tooltip: `How far your expected figure was from the real one, on average. Above zero means you guessed high.`
    - `Sharpness`: `Typical range: ±7.5% of your expected figure` (the median). Its tooltip: `How wide your ranges were, against your expected figure. Narrower is sharper, but only worth it if the hit rate holds.`
  - The chart is titled `Your forecasts against what happened`, with the series `Expected`, `80% range` and `Actual`. It shows only once its measure is judged (3 quarters or more), so its legend never promises a band or line that can't draw yet (#396).
- **Decide's reports panel** opens whenever there's something to read:
  - with the player's own reports, `Your reports ({n})`, with the forecasts after the lists;
  - with none, but a played forecast quarter, `Your forecasts`, and the panel is titled `Your forecasts`, with no empty list;
  - with neither, `No reports yet`, which goes to Reports.
  - A filed but unplayed forecast changes nothing. There's never a `Your reports (0)` (Goldy and Plot, #396).

## Analytics, for all of them

Events say what happened, never content (CLAUDE.md). The new toggles record their state, as `investigate_table_toggled { shown }` does, for example `investigate_last_year_toggled { on }` and `investigate_scatter_toggled { on }`. The builders pick the final names.
