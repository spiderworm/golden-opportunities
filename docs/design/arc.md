# The full game: arc sketch (draft)

Status: **draft for David's approval.** It is a sketch to show where M1 leads, not a commitment. Each investigation below is one the 2193 data can support. Figures come from `src/bookshop/data.json`.

## How the game progresses (proposal)

- **One investigation per simulated quarter, for two years** (2194 and 2195). M1 is the first.
- **The player's results become data.** Each simulated quarter is added to the ledger, so later investigations chart 2194 beside 2193. Some later alerts arise from the player's own earlier decisions.
- **Discoveries are the main reward.** Each investigation has a few insights to find, as in M1. Finding them unlocks tools: new chart types, a basket view and a comparison mode. Each quarter is graded on a report card of four measures, and the bosses review the year at an annual review (see `scoring.md`).
- **Decisions get richer over time.** In M1 the player picks one preset option. Later, they choose parameters (which titles, which days, which series), and from Year 2 they combine two levers in a quarter.
- **Not every alert is a problem.** Some are opportunities, and some are red herrings where the right move is to hold course.

## Investigations

| # | Alert (Discover) | What the data can show (Investigate) | Decision | Simulation needs |
| --- | --- | --- | --- | --- |
| 1 | **M1: the Q4 slump.** Revenue down 41%. | Seasonality, the weekday slump, how Book of the Month works. See `m1-slice.md`. | Hold course, run a sale, re-pick the books, or host author nights. | See `m1-slice.md`. |
| 2 | **Pick the books.** "The Book of the Month calendar for Q2 is empty." | All 12 picks added about 35 to 60 copies a month, whatever the title. Price, current volume and rating decide whether a pick pays. | The player chooses three editions, one for each month. | The M1 lift model, reused. |
| 3 | **The shuttle season.** "Q3 is coming. Last summer brought in 39% of the year's revenue." | Summer traffic is weekday traffic: weekday orders per day ran at 199 in Q3 against 61 in Q1. July and August alone brought in 30% of the year's revenue. | Extend weekday hours, add a pop-up stall at the docks, or run summer events. | **Generated:** staffing cost per open hour, and how many visitors are lost at capacity. |
| 4 | **The saga stalls.** A publisher asks whether to fund volume four. | Series sales fall from volume to volume: *The Mallemaroking Saga* sold 7,334, 4,636 and 4,077 copies of volumes 1 to 3. Several series are unfinished: *Inspector Ryeslton* has 2 of 4 volumes out, *The Aspall Trilogy* 1 of 3. *Esme's Ladies* volumes 3 to 6 sold partly at 10% off all year. Tour-event counts sit beside sales. | Which series to push, discount or host a tour for. | **Generated:** release dates for new volumes and a tour-event effect (the data has counts but no dates). |
| 5 | **The publisher's offer.** Etaoin Shrdlu Press offers co-op money for front-table space. | ESP earns 71% of revenue and accounts for 89% of all publisher marketing spend. The small presses earn more per marketing dollar. Palimpsest's Q4 fell only 22%. | Accept the deal, counter it, or give the table to small presses. | **Generated:** the deal's terms, and how much front-table placement lifts sales (anchored to the Book of the Month lift). |
| 6 | **Bought together.** "Customers keep asking for a set." | About 5k multi-item orders. Top pairs: *Portmeirion* with *The Mallemaroking* (415 orders), the two mysteries (225), and the two picture books (157). Discounted orders are bigger (1.29 items against 1.13), though they skew toward pricier titles. | Bundle a pair at a discount, and choose which one. | **Generated:** bundle take-up rate. Cannibalization of the pair's separate sales can be estimated from the pair data. |
| 7 | **The critics and the crowd.** A reviewer says the shop "stocks what wins prizes, not what people read". | Ratings (50k) against sales: *the life and times of an utterly inconsequential person* rates 3.20 but sells strongly, while some 4.3+ titles barely sell. 18 awards, one of them a 2193 Hugo (*Rystwyth*). | A "staff picks" shelf by rating, by awards, or by neither. | **Generated:** shelf-placement lift (reuse #5). |
| 8 | **The libraries next door.** The station libraries propose a partnership. | Library checkouts barely change across the months (1,281 in January, 927 in December), with no summer peak. Reading demand is steady and the shop's traffic isn't. Seven libraries have catalogs and staffing. | Partner with the libraries (author nights, a returns-to-shop table), or with which library. | **Generated:** partnership effect on off-season weekday traffic. Checkouts have no year, so they can't be lined up against sales directly. |

## Generated data: customers, demographics and more

The 2193 data has no customers, demographics, locations, returns, inventory or costs. My earlier draft proposed leaving out investigations that would need them. David overruled that (October 30, 2026): we generate whatever data gameplay needs, including customers and demographics. The concept's examples about segments, locations, returning customers and returns are therefore back in scope.

**How to generate it:**
- **Decided (David):** generated data fits the real data exactly. Each real 2193 order is assigned to a generated customer, so every sales chart still matches the source workbook. Only the new columns (who bought, where, whether it came back) are generated.
- **Decided (David):** the generated customers explain the real patterns, not new ones. For example, shuttle visitors produce the summer weekday surge, and station residents produce the steady weekends. The player's insights from M1 then deepen instead of being contradicted.
- **Decided (David):** Dewey stays blind to how the scenario was built. It sees the data the player sees and nothing else.
- **Dropped:** labeling generated data. David: the starter data was generated too, so the label doesn't mean much.

**Open: the scenario's intended story.** The generator builds a scenario around a story, for example "visitors drive the summer". A player may find a different reading that fits the data as well, or better. **Proposal:** the intended story is never used to grade the player's conclusion. It has three uses:
1. **It drives the simulation.** Decisions play out according to how the station really works. A player whose different reading fits the data will usually make decisions that work too, because the data came from that mechanism. Where their reading misleads them, the outcome shows it, as in real life.
2. **It is checked against the data.** Before a scenario ships, a test confirms the data shows the intended pattern. If players keep finding a better reading, that is either a flaw in the generator or a pattern nobody planned. Analytics should flag it so we can look.
3. **It is revealed in the debrief.** After the quarter, the result screen can say "what was going on on the station", next to what the player found, without marking either right or wrong.

Discoveries would then be credited for any pattern really present in the data, not only the intended ones. M1's three insights are checked against chart states. Crediting unplanned discoveries would need a judge that can see the data. The event director could do it, since it already knows the scenario and Dewey doesn't.

**Investigations this opens** (they fit into the arc above):

| Alert | What the generated data would show | Decision |
| --- | --- | --- |
| **Who to court.** "The Commerce Office offers a marketing slot on the shuttle feeds." | Segments (residents, crew rotations, shuttle visitors, families) differ in genre, format and spend. | Which segment to target, and with what. |
| **The regulars are thinning.** "Fewer familiar faces this quarter." | Repeat-customer cohorts, and the titles and series that bring people back. | Loyalty card, series subscriptions, or neither. |
| **A second berth.** "A kiosk on Ring A is up for lease." | Sales by ring or berth, and the foot traffic past each. | Where to open, or whether to open at all. |
| **Back on the shelf.** "Returns are up." | Return rates by title and format. | Change the returns policy, or drop a title. |

Costs remain assumptions (M1's 60% cost of goods), and the assumptions panel always says so.
