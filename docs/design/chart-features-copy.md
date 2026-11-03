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

- **The toggle's name:** `vs. same quarter last year`, David's words. It's a toggle like `Compare quarters`, beside it, and keeps its name while pressed. It starts in lower case, as he wrote it, because it reads on from the chart's title ("Revenue by month vs. same quarter last year").
- **Disabled, with tooltips:**

| Why | Tooltip |
| --- | --- |
| The quarter shown is in 2193, which the ledgers start with | `The ledgers start in 2193: there's no year before it to compare` |
| Every quarter is shown (no quarter filter) and the breakdown is by quarter | `Filter to one quarter to compare it with last year` |
| More than one measure is shown | `Show one measure to compare with last year` |
| `Compare quarters` is on | `Turn off Compare quarters to compare with last year` |

  A breakdown by month within one quarter is allowed: each month is compared with the same month last year. If Frank finds a time breakdown it can't do, the pattern is `Break down by something other than {dimension} to compare with last year`.

- **The table's columns,** after the dimension's column:

| Column | Header | Cell |
| --- | --- | --- |
| This quarter | the quarter, `Q1 2194` | the value, in the measure's format |
| Last year | the quarter, `Q1 2193` | the value |
| Change | `Δ`, with the accessible name `Change` | `+$2,300`, `-140`, `+0.12`, or `+2.3 pts` for average discount |
| Percent change | `% change` | `+22.8%`, `-4.1%`, `0.0%` |

  - **Signs** follow Investigate's `change()` in `src/investigate/format.ts`, as the tiles do: a hyphen-minus for down and `+` for up. For average discount, `Δ` is in points and `% change` is left empty, because a percent change of a percentage only confuses.
  - **A zero base:** last year 0 and this year above it: `% change` reads `New`. Both 0: `0.0%`. Last year above 0 and this year 0: `-100.0%`.
  - **A group only one year has** (a title not yet published last year): the missing year's cell reads `None`, and `% change` reads `New`, or `-100.0%` if only last year has it.
- **The ghost series** is the same measure for the same quarter last year, drawn lighter behind or beside this year's:
  - **Legend:** this year's series is named by its quarter, `Q1 2194`, and the ghost by its own, `Q1 2193`. With a breakdown by month, by the year: `2194` and `2193`.
  - **Tooltip:** the group, then both values and the change:
    ```
    March
    Q1 2194: $41,200
    Q1 2193: $38,900
    Change: +$2,300 (+5.9%)
    ```
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
- **Axes:** the first measure chosen runs along the bottom, the second up the side. Each axis is titled with the measure's label, from `MEASURE_LABELS`, and its unit: `Revenue ($)`, `Units sold`, `Average discount (%)`, `Average rating (stars)`. The ticks use the measure's format, compact as on the other charts.
- **The chart's title:** `{second} against {first}, by {dimension}`, for example `Units sold against revenue, by title`, with the dimension in lower case as Dewey's titles have it.
- **A point's tooltip:** the group's name as `formatDimensionValue` gives it, then each measure:
  ```
  The Quiet Picks
  Revenue: $4,120
  Units sold: 212
  ```
- **No labels on the points:** too many of them overlap. The tooltip and the table name them.
- **Row limits** keep the chart's existing source line ("Showing {n} of {total} groups").

## Analytics, for all three

Events say what happened, never content (CLAUDE.md). The new toggles record their state, as `investigate_table_toggled { shown }` does, for example `investigate_last_year_toggled { on }` and `investigate_scatter_toggled { on }`. The builders pick the final names.
