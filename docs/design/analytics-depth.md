# Analytics depth: what the data holds that the query layer can't reach

*Frank, 2 November 2026, for Goldy's request (David: "greatly improving the details and texture we can get into with the analytics", plus a Reports section). A proposal only: nothing here is built.*

## What's reachable today

The query layer has 11 dimensions (quarter, month, weekday, genre, format, publisher, series, title, author, discounted, discount rate) and 8 measures (revenue, units, orders, average discount, average rating, checkouts, average order value, orders per day) (`src/query/types.ts`). Book-grain measures (average rating, checkouts) take only genre, series, title and author, so they never fan out through editions or sales.

The workbook has more. Measured on `src/bookshop/data.json` (2193 only), it holds 58 books, 41 authors, 95 editions, 4 publishers, 6 series, 18 awards, 50,330 ratings, 49,514 orders, 7 libraries and 291 catalog rows. Unless noted otherwise, the correlations below are Pearson's r across books or editions, and "units" means 2193 units.

## Ranked by what they'd add to a player's investigation

| # | Candidate | Adds | Signal | Cost | Dewey |
| --- | --- | --- | --- | --- | --- |
| 1 | Edition and list price | dimensions | strong, and Q2 depends on it | low | yes, after Probe |
| 2 | Ratings count, and stars 1 to 5 | measure and dimension | count: real; spread: little | low | yes, the count |
| 3 | Awarded (yes/no), award | dimensions | real, and Culture depends on it | low | yes |
| 4 | Series volume, and in a series | dimensions | real | low | yes |
| 5 | Items per order | dimension | real but flat; one tell | medium | maybe later |
| 6 | Staff comment | dimension, and text in the title view | weak | low | the flag only |
| 7 | Edition details: pages, print run, publication year | dimensions, in bands | print run echoes sales; the rest is noise | low | no |
| 8 | Author country, birthday, writing hours | dimensions or a profile | noise | low | country only |
| 9 | Publisher city, founding year, marketing spend | a profile | can't be measured (4 publishers) | low | no |
| 10 | Libraries: catalog copies and staff | a measure and a profile | echoes sales | medium | no |
| — | Titles bought together | a new query shape | mostly noise | high | no |

### 1. Edition and list price

- **What:** `edition` (a title and its format, one ISBN) and `list_price` (the edition's price, exact, like `$27.99`, or in bands: under $10, $10 to $19.99, $20 to $29.99, $30 and up).
- **Grain:** the sale line already carries its ISBN and list price, so every sale-grain measure gets them exactly. Book-grain measures don't, because a book can have several editions (33 books have 2, and 2 books have 3 or 4). That's the same rule `format` follows today.
- **Signal:** price is one of the three things Q2's picks depend on (`q2.md` section 4), and the terminal can't show it. Dewey says as much: "The terminal has no list price" (Probe's p2). Prices run from $5.99 to $48, with 25 distinct values. Within a format they still vary: hardcovers run from $18.50 to $48. Price against units per edition is r = −0.33. The same title sells very differently by edition. *Post Alley* sold 51 hardcovers at $27.99 against 307 trade paperbacks at $12.50, and *Zero over Twelve* sold 94 hardcovers against 1,363 mass markets. Today discovery D needs "a title view filtered to the pick's format, or a breakdown by format". An edition dimension makes that one step.
- **Cost:** low. Two entries in the sale's dimension map (`run-query.server.ts`), labels, the tool's dimension list, and Investigate's filter bar.
- **Dewey:** yes, but prices are figures. A price used as a dimension value has to pass the figures gate as a ref, so Probe reviews the gate before Dewey gets it.
- **For Plot and David:** this makes Q2's price leg directly visible. Today the player has to work price out from revenue over units. Whether to hand it over is a design call.

### 2. Ratings count, and the star distribution

- **What:** a `ratings` measure (how many ratings) and a `stars` dimension (1 to 5) for it, so one title's ratings can be shown as a histogram.
- **Grain:** one rating. Only book dimensions apply, as for average rating. CH392's 548 ratings have no book, and they stay an unknown-book group, as `data-notes.md` requires.
- **Signal:** the count is real. Ratings per book run from 0 to 1,901, median 844. *Land Water Sky Space*, Q2's best pick in Sim's model, has 95, the fewest of any rated book. *Cimornul*, an award winner, has none. So "well rated" rests on very different amounts of evidence, and a player can't see that today. Count against units is r = 0.65.
  - **The distribution adds little.** Standard deviations run from 0.66 to 1.19, and they follow the mean. No two titles have means within 0.05 of each other and spreads 0.4 apart. A histogram is texture for a title page, not a new finding.
  - **Reviewers are noise:** 31,064 of them, with at most 8 ratings each.
- **Cost:** low. It's a new fact table in the engine, like checkouts.
- **Dewey:** yes for the count. Stars only after Probe's gate review.

### 3. Awards

- **What:** `awarded` (yes or no) and `award` (its name, like Hugo Award).
- **Grain:** book. `awarded` is safe for every measure. `award` fans out: *The Mallemaroking* holds both a Hugo and a Nebula, so a grouping by award counts its sales twice. It should be a filter, or a grouping whose total says the groups overlap. Every award title matches a book exactly.
- **Signal:** 17 of 58 books won an award. Awarded books sold 1,563 units each, against 726 for the rest, and their ratings are about the same (4.09 against 4.03). Award-winning titles carry more Culture in the game (`q2.md` section 4), so this is the evidence for a scoring term the player can't currently see. Two awards are dated 2193 (*Rystwyth*, *The Spark and The Ashes*), with no month.
- **Cost:** low. **Dewey:** yes.

### 4. Series volume

- **What:** `volume` (Volume 1, 2 and so on) and `in_series` (yes or no). A series' planned volumes and book tour events are one value per series, so they belong in a profile (Reports), not a dimension.
- **Grain:** book, safe for every measure.
- **Signal:** books in a series sold 1,721 units each, against 577 for standalone books. In most series, Volume 1 sells best (Mallemaroking 7,334, then 4,636, then 4,077). Inspector Ryeslton has 2 of 4 planned volumes out, which is the setup for the new volume (#107) and its trap pick.
- **Cost:** low. **Dewey:** yes. Volume numbers are digits, so they go through Probe's gate, as for prices.

### 5. Items per order

- **What:** `basket` (1, 2, 3, 4 or more items), for orders, units and revenue.
- **Grain:** an order property copied onto each of its lines. Orders by basket size count each order once.
- **Signal:** 90% of 2193's orders are a single item. 3,599 have 2 items, 1,015 have 3, and 395 have 4 to 8. 448 orders hold the same edition twice. That's real, but it's flat: nothing in the game turns on basket size.
- **A tell:** in the simulation, a pick's extra copies and the new volume's sales are always one-item orders (`model.ts`), while every other order replays a real 2193 basket. A player comparing basket sizes in a pick month could see the engine's seams. Sim should decide whether that matters before this is built.
- **Cost:** medium. It needs a per-order pass over the visible lines, both source and simulated, before grouping.

### 6. Staff comments

- 32 of 58 books have one. Books with a comment sold 1,111 units each, against 800 without.
- **As a dimension** (`staff_comment`, yes or no), it's cheap.
- **As text** in the title view, it's texture.
- **Dewey:** the flag only. The text is long free prose, and it shouldn't go into the model's context, where the gate would have to judge it.

### 7. Edition details

- **Print run** (2,000 to 78,000) correlates with units (r = 0.58). That's the publisher's own expectation, so it says a book sells without saying why.
- **Pages** (11 to 1,296) barely does (0.22).
- **Publication year** (2178 to 2192) is noise (0.01). No edition came out in 2193, so "new release" has no 2193 rows.
- **Where it fits:** a title page in Reports.

### 8. Authors

- **Country:** 12 countries, but 20 of 41 authors wrote one book, and one wrote 8 (Lynne Danticat, New Zealand). So grouping by country mostly regroups by author. United States books average 2,668 units because of *The Mallemaroking*'s author.
- **Writing hours:** no signal (r = −0.15 with units, −0.13 with rating). It holds the source anomaly 5.13.
- **Birthdays:** these include 2225 and 2238, after 2193, so ages aren't trustworthy (`data-notes.md`).
- **Where it fits:** a profile in Reports, with country as an optional dimension.

### 9. Publishers

There are only 4 publishers, and `publisher` is already a dimension. Their city, founding year and marketing spend are one value each, so they add no grouping. Etaoin Shrdlu spends $2.32M and sold 35,609 units, Palimpsest $48,000 and 1,633, but 4 points can't show a relationship. A profile in Reports.

### 10. Libraries

- The catalog is library × edition copies: 7 libraries, 291 rows. Copies against units is r = 0.72, and checkouts against units is 0.87. So libraries echo what sells.
- Checkouts have no library, and no year, so they can't be split by library.
- Staff numbers don't join to anything.
- A copies measure and a library profile would fill Reports, but they wouldn't help a decision.

### Not proposed: titles bought together

- 922 pairs of titles share an order. The most frequent pairs are just the bestsellers: *Portmeirion* + *The Mallemaroking* (415 orders) has a lift of 0.62, so they're bought together less often than chance would predict.
- Among the 94 pairs with 20 or more orders, the highest lift is 1.90 (26 orders).
- It also needs a new query shape (pairs, not one measure by up to two dimensions). The cost is high and the payoff is mostly noise.

## For the Reports section

Items 7 to 10 fit Reports better than Investigate: profiles of authors, publishers, series, awards and libraries, read rather than queried. They need a loader that returns the profile tables, not new query dimensions, and they need no Dewey gate work.

## Suggested order

1. Edition and list price (after Plot and David agree it's fine to show price).
2. Ratings count.
3. Awarded.
4. Series volume.

Each is a small PR with tests in the engine. The Investigate UI changes are Chart's. Dewey gets each one after Probe reviews the gate. Items per order waits for Sim's view on the tell.
