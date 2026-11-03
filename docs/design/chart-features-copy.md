# Chart features: the copy

Status: **for the builders.** These are the strings for David's three chart features (req_bef8599d5ea4, 3 Nov 2026), written before they're built so each builder has them now. Plot owns the copy and is the second reviewer on each UI PR. Builders may add strings this note doesn't foresee; send those to Plot in the PR.

The house rules hold: US English, no emoji, sentence case, and the toolbar's existing patterns. Today a disabled button's tooltip says what to do ("Show one measure to compare quarters"), and a toggle keeps its name while it's pressed (`aria-pressed`, as `Table` and `Compare quarters` do).

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
| Checkouts, likewise | `Checkouts aren't recorded by quarter, so there's no last year to compare` |
| The quarter in the filter isn't in the ledgers: not played yet, or a stale link | `{Q3 2196} isn't in the ledgers yet: filter to a quarter that's been played` |
| Last year's quarter isn't visible to the player (can't happen today: the ledgers run on from 2193) | `{Q3 2193} isn't in the ledgers, so there's nothing to compare` |
| Nothing in the quarter matches the filters | `Nothing in {Q1 2194} matches these filters, so there's nothing to compare` |
| Any other refusal, so a reason always shows | `Can't compare this chart with last year` |

  David asked for a reason whenever the toggle is unavailable: "When "vs. same quarter last year" is not available, can we get a tooltip explaining why? ie, no data, the bookstore was not open same quarter last year, invalid series, whatever" (req_d5257c07a9f0). So every disabled state has a tooltip, and the fallback covers anything unforeseen. Builders should report it if they ever hit it. The disabled toggle stays focusable, with its reason shown on hover and focus and linked by `aria-describedby`, so keyboard and screen-reader users get it too (Frank). When a measure not recorded by quarter is the only one shown, its line outranks `Show one measure…`. When only last year is empty, the toggle stays on and the rows read `New`. The quarter is written as `formatDimensionValue` gives it.

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
  - If low-n bars or rows are faded, the caption is `Faded where there are fewer than {k} {ratings}`.
- **Error bars on average rating:**
  - Legend: `Likely range (95%)`.
  - Tooltip line: `Likely range: 3.9 to 4.3 stars`, with stars to one decimal place.
  - The legend's tooltip is one plain line: `Where the average would most likely land if as many readers rated again. Fewer ratings, wider range.`
- **Within noise,** on a comparison (Compare quarters, vs. same quarter last year, Dewey's comparisons):
  - Flag: `Within noise`, as a badge beside the change, or in the change cell after it, `+2.1% · within noise`.
  - Tooltip: `A difference this small often shows up by chance with this much data, so don't read much into it.`
  - A clear difference gets no flag, and nothing is labelled "significant".

## Analytics, for all three

Events say what happened, never content (CLAUDE.md). The new toggles record their state, as `investigate_table_toggled { shown }` does, for example `investigate_last_year_toggled { on }` and `investigate_scatter_toggled { on }`. The builders pick the final names.
