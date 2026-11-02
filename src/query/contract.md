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
Edition, discount, and sales-calendar dimensions are rejected for ratings and
checkouts, except the observed checkout month. Stars apply to the ratings count
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

## What Dewey may use

Dewey's tools see only `AGENT_MEASURES`, `AGENT_DIMENSIONS` and
`AGENT_MEASURE_DIMENSIONS` (`types.ts`). A new measure or dimension joins them
only after Probe has reviewed it against Dewey's figures gate (Goldy, 2 Nov).
Until then it's Investigate-only: left out of the tool schemas and
`describe_data`, and refused by the HTTP adapter for Dewey's bearer token with
`INVALID_QUERY` ("ratings isn't available to the assistant yet."), whether it
is the measure, a grouping, a filter or the sort. Browser queries may use it.

Investigate-only now: the `ratings` measure, and the `stars`, `awarded`,
`award`, `volume` and `in_series` dimensions (#169).

## Data version

`dataVersion(save)` (`data-version.server.ts`) is an opaque 16-hex string that
changes exactly when what a save's queries can see changes: a plan commit, a
reset or new game (a new save), or a new server process. Discovery, evidence and
alert-seen writes keep it. It's a hash, never the save ID. The shell layout's
loader returns it (`dataVersion`, route `shell/layout`), and every successful
`/api/query` response carries the version its result was computed under, in
`X-Orbital-Data-Version`. A client cache keys results on that header, not on the
version it last saw, so a result that raced a plan commit is never filed under
the new version. Errors carry no version.

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
isLocalBrowserRequest helper in query/access.server.ts centralizes the local boundary:
localhost/127.0.0.1/[::1] only, matching Origin, no cross-origin CORS access.

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
