# Query contract

Shared imports: `Query`, `QueryView`, `QueryResult`, `Dimension`, `Measure`,
`QueryErrorResponse`, and the allowlists/bounds from `src/query/types.ts`.
The executor and HTTP adapter share this contract.

The server entry point is `runQuery(query, view, track?)` in
`src/query/run-query.server.ts`, returning `QueryResult` synchronously. All
inputs are validated at runtime, even internal calls. Invalid queries throw a
`QueryError` with `code` and `message`; the HTTP adapter returns
`{ error: { code, message } }` with an appropriate non-2xx status.

POST `/api/query` accepts the Query itself as JSON (not an envelope). It never
accepts a view, save, SQL, expression, or free-form code. Unknown properties,
unknown dimensions/measures, duplicate grouping dimensions, incompatible
filters, and invalid bounds are errors. Requests are capped at 16 KiB.

```ts
const query: Query = { measure: 'revenue', by: ['quarter'] };
// columns: [{ key: 'quarter', label: 'Quarter', type: 'string', nullable: false },
//           { key: 'revenue', label: 'Revenue', type: 'number', nullable: false }]
// rows: [{ quarter: '2193-Q1', revenue: 95245.8078 }, ...]
// total: 695243.6112 (floating-point summation tolerance applies)
```

## Dimensions and sorting

- quarter: full calendar period (`2193-Q1`), not a sheet label.
- month: year and month (`2193-04`), so a month of 2193 and the same month of
  the player's 2194 are separate rows. Month filters must name the year; a bare
  `04` is refused. Checkouts have no year in the data: the snapshot came with
  the 2193 workbook, so their months are 2193's (`2193-04`).
- weekday: `Monday` through `Sunday`, computed from the sale's calendar date
  without a timezone shift. Default sorting follows this weekday order.
- genre, format, publisher, series, title, author: source labels, with author
  as first name + space + last name. Missing book/series values group as null,
  not invented labels. Consumers should display null as an unknown/missing value.
- discounted: `yes` for discount > 0, otherwise `no`.
- discount_rate: actual discount as a percent label (`0%`, `5%`, `10%`, `13%`,
  `15%`, `20%` in the source); up to eight fractional percentage digits for
  future rates, with trailing zeros omitted.
- stars: a rating's own value, `1` to `5`, for the ratings count only (one
  title's ratings by stars is its histogram). Investigate-only.
- awarded: `yes` if the book has won an award, else `no`; null for the unknown
  book. Awards join books on the exact title. They're the workbook's: two are
  dated 2193, with no month. Investigate-only.
- award: an award's name (`Hugo Award`), **filter only**. A fact matches if
  any of its book's awards is in the filter, so a book with two awards counts
  once. It can't group or sort, since a grouping by award would count *The
  Mallemaroking* (a Hugo and a Nebula) twice. Investigate-only.
- volume: a series book's volume number (`1` to `7`); null for a standalone
  book or the unknown one. Investigate-only.
- in_series: `yes` if the book belongs to a series, else `no`; null for the
  unknown book. Investigate-only.
- edition: the sale line's edition, as title and format (`Post Alley
  (Hardcover)`). Where a book has two editions in one format, the label adds
  the publication year (`Heliotrope Pajamas (Paperback, 2181)`). Sales only.
  Investigate-only.
- list_price: the edition's list price before any discount, to the cent
  (`$27.99`). Sorts as an amount. Sales only. Investigate-only.
- price_band: `under $10`, `$10 to $19.99`, `$20 to $29.99` or `$30 and up`,
  sorted in that order. Sales only. Investigate-only.

Filters are exact, case-sensitive matches. Values within one dimension are OR;
different dimensions are AND. Each filter contains 1–50 strings of at most 200
characters. There is no null filter token in this initial API. An allowed but
unmatched value returns empty results, including a hidden/future quarter.

Sort is `{ column, direction: 'asc' | 'desc' }`; its column must be the selected
measure or a selected grouping dimension. Default order is ascending grouping
columns in request order; ties use that same order for reproducibility. Nulls
sort last. Limit is 1–200 (default 200). Source states when rows are truncated. Results also include `truncated: boolean` from the engine so server consumers never need to parse that prose.
Without grouping, return one aggregate row even when no facts match. With
grouping, do not synthesize missing zero-valued categories.

Every response, including errors and provenance, is capped at 131,072 UTF-8
bytes of serialized JSON. Dimension values and column labels are capped at 200
characters, source at 4096, and error messages at 300. Oversized results fail
with `RESULT_TOO_LARGE` (HTTP 422) and a short bounded error; labels and totals
are never silently truncated. Row limiting is explicit in source. These bounds
also apply to direct `runQuery` results, not only the HTTP endpoint.

## Fact grain and totals

| Measure | Fact grain and aggregation | Supported dimensions (group and filter) |
| --- | --- | --- |
| revenue | Sum price × (1 − discount), no per-line cent rounding | All but stars |
| units | Count sale lines | All but stars |
| orders | Count distinct source OrderID in each group; global total is independently distinct | All but stars |
| avg_order_value | Sum revenue / distinct OrderID | All but stars |
| orders_per_day | Distinct OrderID / eligible calendar days | All but stars |
| avg_discount | Arithmetic mean of the sale-line discount fractions, not percentages | All but stars |
| avg_rating | Arithmetic mean of individual source ratings, including unknown-book ratings | genre, series, title, author, awarded, award, volume, in_series |
| checkouts | Sum source Number of Checkouts at book/month grain | genre, series, title, author, awarded, award, volume, in_series, month |
| ratings | Count individual source ratings, including unknown-book ratings. Investigate-only | genre, series, title, author, awarded, award, volume, in_series, stars |

Ratings/checkouts join directly to Book → Author/Info/Series, never through
sales or editions. This avoids multiplying ratings or checkouts by sales volume
or edition count. CH392's unmatched rows remain, with null book dimensions.
Edition (format, edition, list price, price band), discount, and
sales-calendar dimensions are rejected for ratings and checkouts, except the observed checkout month. Stars apply to the ratings count
only: an average rating by stars would be the stars themselves. A book with no
ratings has no row, as with any group without facts. An average over no facts is
null; empty sums/counts are zero. Total is over all filtered visible facts before
grouping or limiting, so grouped distinct orders need not sum to total and
averages are never an unweighted average of group averages.

For orders_per_day, eligible days are ALL calendar dates in the server-visible
periods, narrowed by quarter/month/weekday filters and the group's calendar
dimension values. Count zero-sale days too. Non-calendar filters and groups do
not reduce the day denominator. The total divides globally distinct matching
orders by all eligible days, independently of groups. No eligible calendar days
means null; eligible days with no orders means zero. avg_order_value is null
when there are no orders. Both calculations respect visibility before any
aggregation; neither averages already-computed group values.

## Last year

`vs: "last_year"` (David, 3 Nov 2026: "vs. same quarter last year") adds
`lastYear: { rows, total }` to the result: each row's figure a year earlier, in
the rows' order, and the total's. Last year is the same measure, breakdown and
filters with the quarter and month filters a year back (`last-year.ts`). A row
grouped by quarter or month is matched to its quarter or month a year earlier;
any other row to the same group, over the year-earlier quarters of the query's
scope.

A figure is `null` when its quarters a year earlier aren't all in the view's
periods: before 2193, or outside what the player can see. Otherwise it's
`{ value }`, and a group with no sales last year is a zero for sums and counts
and `{ value: null }` for averages, as with any group. `change(now, before)`
gives the difference and the fractional change, `"new"` when last year was zero
(never Infinity). Ratings and checkouts have no quarters, so no last year: `INCOMPATIBLE_DIMENSION`.
Groups that sold last year but not this year are not added as rows. Dewey can't
use `vs` yet. Discovery evidence comes from the result's rows and total, never
from `lastYear`: last year's figures are context (Audit, #292).

## Several measures

A player who asks for several measures together ("revenue and units by
quarter") gets one table (David, 12 Nov 2026, as Goldy relayed it: "if a user asks for revenue and
units sold over a quarter, that they appear in a single table"). Unrelated
measures aren't forced together unless that's asked for, and Dewey never adds a
measure nobody asked for.

- **Query.** `measure` is the first measure; `also` adds one to three more,
  distinct and not `measure`, so a lookup has at most `QUERY_LIMITS.measures`
  (4). A query without `also` is exactly what it was. `queryMeasures(query)`
  lists them all, the first first.
- **Families.** Sales measures (revenue, units, orders, avg_discount,
  avg_order_value, orders_per_day) go together, and so do the book-record ones
  (avg_rating, ratings, checkouts). A mix is refused with
  `INCOMPATIBLE_MEASURES`: "revenue and avg_rating can't share a query: revenue
  comes from sales, and avg_rating from book records (ratings and checkouts).
  Query them separately." Dewey then runs two lookups. Lining sales up with
  undated records in one table would put figures over different periods side by
  side; that may come later, when a player asks for it, with a source line
  saying which periods each covers.
- **Dimensions.** Every grouping, filter and sort dimension must be one every
  measure supports (the intersection of `MEASURE_DIMENSIONS`), else
  `INCOMPATIBLE_DIMENSION` naming the measure that lacks it.
- **Sales measures** are aggregated in one pass over the same facts, each in
  its own aggregate, so each figure is exactly what it would be alone: distinct
  orders stay exact across orders spanning cells, orders per day keeps its day
  denominator, and no average is an average of group averages.
- **Book-record measures** are each totalled alone by the grouping, then lined
  up on the groups' values, never joined fact to fact (no multiplying ratings
  by checkouts). A group one measure lacks is a row all the same, with a zero
  for a count and null for an average, and evidence `{ n: 0, se: 0 }` or
  `{ n: 0, se: null }` to match.
- **Sort and limit.** `sort.column` may be any requested measure or a grouped
  dimension. Rows are sorted, then cut to the limit: a top N sorts by the
  measure it wants, and the other measures fill in those rows. Totals are
  before the limit, as always.
- **Result.** Columns are the grouping dimensions, then each measure in order,
  and each row has a figure under every measure's name. `total` and `evidence`
  stay the first measure's. `measures` holds every requested measure's
  `{ total, evidence: { unit, rows, total } }`, the first's included, keyed by
  measure; it's absent without `also`. `truncated` is one flag for the whole
  result. `perMeasure(query, result)` (`result.ts`) splits a result into the
  single-measure lookups it stands for, for code that reads one measure at a
  time.
- **Source line.** Measures of one grain share its count, and each names its
  calculation: "Revenue and units from 56,350 visible matching sale lines:
  revenue, sum of …; units, one unit per sale line; allowed periods: …".
  Ratings and checkouts have a clause each. One measure reads as it always has.
- **Not yet.** `vs: "last_year"` is one measure at a time: with `also` it's
  `INVALID_QUERY`.
- **Dewey.** `investigateOnly` checks every measure, so the HTTP adapter refuses
  Dewey's token if any is Investigate-only. His kept evidence holds each
  measure's (`agentMeasureEvidence`). His tools don't offer several measures
  until Sage's PR and Probe's review against the figures gate land.
- **Bounds.** The 16 KiB request cap and the 131,072-byte result cap hold. Four
  sales measures over 200 rows of editions by month are 60,235 bytes.
- **Caches and telemetry.** The server's results cache keys on the checked
  query, `also` included, and the browser's `queryKey` names `also` and `vs`.
  `query_completed` and `query_failed` record `measureCount` and `measures` (the
  names, from the fixed list), never a value.

## How much evidence

Every result carries `evidence: { unit, rows, total }` (`evidence.ts`; David,
3 Nov 2026: "Show n next to averages, add error bars on average rating, and
flag a comparison when the difference is "within noise""): for each row's
figure and the total's, in the rows' order, how many items it's over (`n`) and
its standard error (`se`, in the figure's units). It's how sure a figure is,
not the discovery evidence of "Context, never evidence" below.

- **Averages** name their `unit`: `avg_order_value` is over orders (distinct,
  as `orders` counts them), `avg_discount` over sale lines, `avg_rating` over
  ratings and `orders_per_day` over eligible days. Other measures' `unit` is
  null. An average's `se` is its items' standard deviation over the root of
  their count, null below two items. `orders_per_day`'s is its orders' root
  over its days.
- **Counts** (`units`, `orders`, `ratings`, `checkouts`) are taken as Poisson:
  `se` is the count's root.
- **Revenue** is taken as compound Poisson over its orders: `se` is the root of
  the sum of its orders' totals squared, where a total is the order's lines in
  the row's group. Lines in one order rise and fall together, so its variance
  is up to 30% larger (its `se` 14% wider) than if lines were independent
  (2193, by quarter). Cells keep
  each order's lines per cell (`squares`, `spanningLines` in `sale-cells.ts`),
  so it's exact for any grouping.
- **Last year** gives its figures' evidence too: `lastYear.evidence`, null where
  the figure is, and `{ n: 0, se: 0 }` for a count that didn't sell (`se: null`
  for an average).

`withinNoise(unit, a, b)` flags a comparison whose difference is within 95% of
its spread: Welch's test for averages, its degrees of freedom from each side's
`n`, and normal for counts, revenue and orders per day. So a count is within
noise when |a − b| ≤ 1.96·√(a + b). It's null, and no flag shows, when either
side can't be judged. `ratingRange` is an average rating's likely range: t on
n − 1 degrees of freedom times its `se`, clipped to 1 to 5 stars, and null below
two ratings. `lowEvidence` says when an average is shown faded: under 30
ratings, orders or sale lines, and never for days.

Dewey sees it only through the figures gate. The tool server
(`src/assistant/tools/server.ts`) keeps `evidence` when it checks out and turns
it into plain fields: for an average, `n` beside each row and the total, and
for average rating the likely range, `range_low` to `range_high`, or
`range_none: "agree"` when two ratings or more all agree; for a
comparison, `noise` (`within`, `clear` or null) on each row and the total. The
model can cite them only by ref (`{{a1.n}}`, `{{a1.range}}`, `{{b.noise}}`), and
its own words about evidence ("significant", "noise") are withheld.

## Change decomposition

`waterfall(by, then, now, { top, split })` (`decompose.ts`; David, 3 Nov 2026:
"A waterfall showing which genres, titles or editions drove a change in revenue,
and optionally a price/volume/mix split") works from plain queries: each
period's revenue, and units for the split, by the group. It doesn't use
`vs: "last_year"`, whose rows leave out groups that sold then but not now. The
bars run from then's total to now's: the `top` largest changes by size, then
everything else in one, which is whatever those don't account for, so the bars
always sum to the change. A bar is within noise when its change is within 95% of
the two figures' spread (`withinNoise`).

The split gives each group's change as price U1·(p1 − p0), volume (U1 − U0)·P̄0
and mix (U1 − U0)·(p0 − P̄0), where p is realized revenue per unit, so a discount
counts as price, and P̄0 is then's average. Each sums to its group's change, and
summed over the groups they're volume (U1 − U0)·P̄0, mix U1·(Σ s1·p0 − P̄0) and
price Σ U1·(p1 − p0). A new group takes its own price as its price then, so it
has no price change; its units at the old average are volume, and the rest is
mix. A group that's gone is the same backwards. There's no split with nothing
sold then, without units, or past a row limit.

## What Dewey may use

Dewey's tools see only `AGENT_MEASURES`, `AGENT_DIMENSIONS` and
`AGENT_MEASURE_DIMENSIONS` (`types.ts`). A new measure or dimension joins them
only after Probe has reviewed it against Dewey's figures gate (Goldy, 2 Nov).
Until then it's Investigate-only: left out of the tool schemas and
`describe_data`, and refused by the HTTP adapter for Dewey's bearer token with
`INVALID_QUERY` ("ratings isn't available to the assistant yet."), whether it
is the measure, one of `also`, a grouping, a filter or the sort. Browser queries may use it.

Investigate-only now: the `ratings` measure, and the `stars`, `awarded`,
`award`, `volume`, `in_series`, `edition`, `list_price` and `price_band`
dimensions (#169).

## Data version

`dataVersion(save)` (`data-version.server.ts`) is an opaque 16-hex string that
changes exactly when what a save's queries can see changes: a plan commit, a
reset or new game (a new save), or a new server process. It also changes when
the open quarter's Alma record lands, because from Q3 what a view proves for the
quarter's discoveries depends on that record's event: a view shown before it
landed reaches the server again after (Audit). Discovery, evidence and
alert-seen writes keep it. It's a hash, never the save ID. The shell layout's
loader returns it (`dataVersion`, route `shell/layout`), and every successful
`/api/query` response carries the version its result was computed under, in
`X-Orbital-Data-Version`. A client cache keys results on that header, not on the
version it last saw, so a result that raced a plan commit is never filed under
the new version. Errors carry no version. Keep it out of analytics events: it's
stable for a save within a server process, so it would work as a per-save
identifier (Audit, #187).

## Several measures, several discoveries

A query with `also` is judged for discoveries as one view per measure (`perMeasure` in `result.ts`): each measure's rows, total and evidence, as if it had been looked up alone. So a lookup of revenue and units counts for both, as Investigate's chart of several measures already does, each measure being its own query there. Dewey's lookups are the player's own (David, 3 Nov 2026: "if dewey looked it up, they did it for the user"), so his count the same way (Plot, chart-features-copy.md section 11).

## Context, never evidence

The server records discovery evidence from every `/api/query` answer. A request
with `X-Orbital-Evidence: none` is answered without recording it: the view is
context, like Investigate's heatmap, which never awards discoveries wherever it's
shown, a pinned heatmap included (Plot, #63 and #266). The header can only
withhold evidence, so trusting it from the browser costs nothing. The browser's
cache keeps these answers apart from the same query shown as evidence, so that
one still reaches the server and is recorded.

## A save that can't be replayed

Played quarters keep their lines' hash and are replayed on read
(`src/game/replay.server.ts`). If a replay no longer matches, because the engine
changed since the quarter was played, the view can't be built: `/api/query`
answers 409 `SAVE_NOT_REPLAYABLE`, telling the player to start over from
Settings. Page loaders throw a 409 naming the first quarter that no longer
replays, and the shell's error boundary shows "Your save can't be replayed".

## Visibility and access

`QueryView` is trusted server state. Filter facts against `periods` BEFORE
filtering/grouping, computing totals or provenance. Derive the period from each
sale's date, including simulated lines; a caller filter can narrow visibility,
never expand it. `includeUndated` explicitly grants the separate undated source
snapshot: ratings/checkouts cannot be assigned to a sales year or quarter.
Without that grant those measures fail with `UNAVAILABLE_FACTS`, even if sales
periods are allowed. Source explains that this snapshot has no observed year.

The HTTP adapter resolves the browser's existing cookie-selected save, or the save
bound to a server-issued agent capability. The initial save grants all of 2193 and
undated facts. Only committed played quarters extend it. Clients cannot choose
periods or submit simulated facts; simulation lines are still period-gated.

Browser requests must be local and same-origin and have a valid save cookie.
Sage's spawner resolves that cookie server-side and calls
`issueGameQueryToken(saveId)` from `src/game/query-token.server.ts`, receiving
`{ token, revoke }`. One random capability lives for at most three minutes and
is revoked after the answer's provider finishes. It binds a query revision; a changed
query revision, revocation, expiry or missing save returns SESSION_ENDED/401. Comparisons
must fail as a whole if either call ends, never combine different revisions.
There is no startup-global bearer or fallback view. Tokens travel through child
environment only; Host never chooses their destination or a save.
HTTP responses are private/no-store. This is local hosting, not public user authentication.

Telemetry accepts `(event, props?)` and records only allowlisted measure,
dimension count, row count, duration and success/error code; never filter values,
query bodies, result data, tokens, or view/save details. Dashboard callers can
forward client-side timing to the platform; the server adapter uses the platform
trackServer adapter for content-free events.

## Implementation integration

Execution and the resource route now implement this contract. Features export
route lists (`src/query/routes.ts`); the top-level routes file composes them.
The query resource route stays outside page layouts.

Server callers import `runQuery` from `src/query/run-query.server.ts`, and obtain
`getGameSession(request).queryView` from `src/game/session.server.ts`. Never return
the view, save, seed or simulated facts in route loader data. Query code does not
import the simulation model or hidden scenario state.

Sage passes the issued token as ORBITAL_QUERY_TOKEN in the MCP child's environment.
The child sends Authorization: Bearer to its configured loopback endpoint. Tokens
never enter prompts, tool arguments/results, browser data or logs. At most four
capabilities per save and 64 globally can be active. The server-only
isLocalBrowserRequest helper in query/access.server.ts centralizes the browser boundary:
localhost/127.0.0.1/[::1] only, matching Origin, no cross-origin CORS access; or, when
the server is deployed with `ORBITAL_PUBLIC_ORIGIN`, a request whose Origin is that
origin exactly and whose Host is its host (`platform/origin.server.ts`, `docs/deploy.md`).

HTTP admission is at most 60 requests/minute per local principal (browser or
MCP), 100/minute globally, and eight active request bodies per process. Bodies
have a five-second deadline and a 16 KiB streaming byte limit even without a
Content-Length header. Non-JSON and compressed bodies are rejected. The browser/MCP buckets remain deliberately conservative shared limits;
issuing more saves cannot multiply the global allowance.
These are in-process limits for local hosting, not distributed deployment limits.

Up to 64 history results are cached per process/build, with the entire period
and undated grant in each key. Results are copied for callers. Simulated facts
are not cached until the save layer supplies an immutable version contract.
Responses remain private/no-store because views are player-specific;
source indicates limited result rows and the independent pre-limit total.


Discovery-only and alert-seen writes preserve `queryRevision`; ordinary save updates (including play)
advance it. Legacy saves without the field use their existing `revision`. The storage
revision still advances for evidence writes, preserving optimistic update safety. An
answer may discover an insight without invalidating its own next lookup. Revocation,
expiry and a committed play still end the capability, including during body arrival.
