# Query contract

Shared imports: `Query`, `QueryView`, `QueryResult`, `Dimension`, `Measure`,
`QueryErrorResponse`, and the allowlists/bounds from `src/query/types.ts`.
This first PR publishes the contract; execution and HTTP implementation follow.

The server entry point will be `runQuery(query, view, track?)` in
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
- month: two-digit calendar month (`01`–`12`), across visible years. Checkouts
  use the same month values but have no year. Use quarter as a second grouping
  dimension for multi-year sales comparisons when needed.
- weekday: `Monday` through `Sunday`, computed from the sale's calendar date
  without a timezone shift. Default sorting follows this weekday order.
- genre, format, publisher, series, title, author: source labels, with author
  as first name + space + last name. Missing book/series values group as null,
  not invented labels. Consumers should display null as an unknown/missing value.
- discounted: `yes` for discount > 0, otherwise `no`.

Filters are exact, case-sensitive matches. Values within one dimension are OR;
different dimensions are AND. Each filter contains 1–50 strings of at most 200
characters. There is no null filter token in this initial API. An allowed but
unmatched value returns empty results, including a hidden/future quarter.

Sort is `{ column, direction: 'asc' | 'desc' }`; its column must be the selected
measure or a selected grouping dimension. Default order is ascending grouping
columns in request order; ties use that same order for reproducibility. Nulls
sort last. Limit is 1–200 (default 200). Source states when rows are truncated.
Without grouping, return one aggregate row even when no facts match. With
grouping, do not synthesize missing zero-valued categories.

## Fact grain and totals

| Measure | Fact grain and aggregation | Supported dimensions (group and filter) |
| --- | --- | --- |
| revenue | Sum price × (1 − discount), no per-line cent rounding | All |
| units | Count sale lines | All |
| orders | Count distinct source OrderID in each group; global total is independently distinct | All |
| avg_discount | Arithmetic mean of the sale-line discount fractions, not percentages | All |
| avg_rating | Arithmetic mean of individual source ratings, including unknown-book ratings | genre, series, title, author |
| checkouts | Sum source Number of Checkouts at book/month grain | genre, series, title, author, month |

Ratings/checkouts join directly to Book → Author/Info/Series, never through
sales or editions. This avoids multiplying ratings or checkouts by sales volume
or edition count. CH392's unmatched rows remain, with null book dimensions.
Edition, discount, and sales-calendar dimensions are rejected for ratings and
checkouts, except the observed checkout month. An average over no facts is
null; empty sums/counts are zero. Total is over all filtered visible facts before
grouping or limiting, so grouped distinct orders need not sum to total and
averages are never an unweighted average of group averages.

## Visibility and access

`QueryView` is trusted server state. Filter facts against `periods` BEFORE
filtering/grouping, computing totals or provenance. Derive the period from each
sale's date, including simulated lines; a caller filter can narrow visibility,
never expand it. `includeUndated` explicitly grants the separate undated source
snapshot: ratings/checkouts cannot be assigned to a sales year or quarter.
Without that grant those measures fail with `UNAVAILABLE_FACTS`, even if sales
periods are allowed. Source explains that this snapshot has no observed year.

The initial HTTP adapter resolves a fixed full-2193 view with the undated flag
on. A later server-owned save/session resolver will replace that baseline; the
client must never choose its periods or submit simulated facts. The simulation
engine is out of scope here; optional `simulatedSales` is only a trusted fact
injection point for its later output and does not bypass period checks.

Browser requests must be same-origin. Sage's server-spawned MCP process instead
uses a bearer token generated randomly at server module startup, kept in memory,
never logged or exposed in route data. The planned server-only
`getQueryToken()` in `src/query/access.server.ts` lets Sage's spawner pass it via
its child environment, outside model context. Access is for this local-only
milestone; deployment/session authentication must be revisited before hosting.
HTTP responses are private/no-store. Bounded per-caller and global rate limits
protect compute; caches, if added, must include the trusted view and fact version.

Telemetry accepts `(event, props?)` and records only allowlisted measure,
dimension count, row count, duration and success/error code; never filter values,
query bodies, result data, tokens, or view/save details. Dashboard callers can
forward client-side timing to the platform; the server adapter uses a local
content-free default until a server analytics adapter is available.
