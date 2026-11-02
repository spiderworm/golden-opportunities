# Rollups: a long save's ledgers, at the grain queries need

Frank, 2 Nov 2026, for Sim and Audit. Goldy and David's plan: profile first, then, if scanning lines dominates,
tally each quarter once into small rollups the query layer reads instead of lines, with distinct orders exact.

## What the profile found

A five-year save (20 quarters, 302,517 simulated lines, plus 2193's 56,350): one Investigate load is 11 queries
of 330 to 380 ms each, about 4 s. Each query builds a fact object for every line: a date parse, an object spread
and some 20 strings. The view build is 35 ms, and the cold replay 0.9 s once per process. The heap is about 1.0 GB
with the save loaded. #247 caches repeats; this is for the first load after each quarter, and for memory.

## What a line is, to a query

Every sales dimension comes from four things: the edition (`isbn`: genre, format, publisher, series, title,
author, awards, volume, list price, price band, edition), the month, the weekday, and the discount (discounted,
discount rate). There's no day dimension. Every sales measure is a sum, a count, or distinct orders:

| Measure | From a cell |
|---|---|
| units | the cell's line count |
| revenue | count x the edition's list price x (1 - discount), the same for every line in the cell |
| avg_discount | the discount sum / count |
| orders, avg_order_value, orders_per_day | distinct orders (below); days come from the calendar, as now |

So a quarter rolls up into **cells keyed by (edition, month, weekday, discount)**, each holding its line count
and its distinct-order count. Measured on the five-year save: 94 editions and 6 discount rates, so **30,516
cells for 302,517 lines (10x)**. Every filter and grouping is exact on cells, because each dimension is a
function of the key.

## Distinct orders, exactly

An order has 1.14 lines on average and happens on one date, so all its lines share a month and weekday. 26,620 of
264,483 orders (10%) span more than one cell: several editions, or one edition at two discounts. Each cell keeps
its distinct-order count, and the rollup keeps those spanning orders as a list of the cells each one touches. For
a group G:

    orders(G) = sum over cells c in G of orders(c)  -  sum over spanning orders o of max(0, cells of o in G - 1)

That's exact, and a query costs about 30,000 cells plus about 27,000 spanning orders, against 360,000 fact objects
now. The total (`by: []`) is the same sum with G = every visible cell.

## Identical answers

Results aren't rounded ("without per-line rounding"), so summing by cells would change revenue's last bits. Both
paths will sum revenue as integers: list price in cents x (10,000 - discount in basis points) is an exact integer
in millionths of a dollar. A five-year total is about 2e13, well under 2^53. 2193's lines and the save's go through
the same arithmetic, so every answer is exact. Any change to current answers is float noise, and a test lists it.

## Where they live

- **Built at replay,** where `quarterLines` now yields lines. The rollup replaces the lines in the replay cache,
  and `QueryView.simulatedSales` becomes `simulatedCells`. For the five-year save that's about 3 MB instead of
  about 400 MB. `MAX_SIMULATED_LINES` becomes a cell bound, and 400 quarters (about 600,000 cells) fit.
- **Not stored in the save.** The save keeps the lines' hash and count, and the hash is checked on the lines
  before they're rolled up and dropped. The cold replay stays, at 0.9 s for five years.
- **2193 is rolled up once per process,** the same way.

## Scope: five years

This is for the interview, and five years is what it's built and measured for. David (2 Nov 2026): "This is
just for an interview. I don't have a decision to expand this past the interview yet. WE SHALL SEE. But
caching static generated results in users' indexdb to reduce load time could happen if we want I think". So
nothing is stored for longer games now.

## Later, if the game outlives the interview

- **Store each quarter's cells in the save** (about 45 KB a quarter), so a cold start reads them instead of
  replaying every quarter. A hundred years replays in about 18 s.
- **Cache finished quarters' results in the browser's IndexedDB,** keyed by data version. A played quarter
  never changes, so a result filed under a version is good for as long as that version is current, across
  page loads and visits.

## Proof

1. **Sim:** each quarter's cell totals match the engine's outcome totals (units, revenue and orders).
2. **Old and new answers are identical** for every query the grammar allows over the five-year save and a
   two-quarter save: every sales measure, by every dimension and every pair of them, with filters on each
   dimension. The test keeps the old line path for that comparison.
3. **The orders formula** is tested against brute force on orders built to span cells several ways.

## Small PRs

1. Integer revenue sums in the existing path, with a test of any changed answers.
2. Rollups built at replay, read by `runQuery`, with the old-against-new test. The lines stay in the view.
3. Drop the lines from the view and the replay cache, and change the bounds and the memory figures.
4. Measure the cold load and memory on the five-year save, under the heavy baton.
