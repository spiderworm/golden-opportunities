# M1: the Q4 slump (design draft)

Status: **draft for David's approval.** Plot wrote it and Goldy coordinates it. Every judgement call is marked **Proposal**. Numbers come from `src/bookshop/data.json` unless they are marked *assumed* or *generated*.

**David's review (October 30, 2026):**
- **Decided:** the assumed numbers in section 4 stand.
- **Decided:** the player sees the rules before deciding. Effects appear only after in-game time has passed. Projections, which may not hold true, may come later, once David has played the game.
- **Decided:** the names Dewey and the Commerce Office. "Meridian Station" was approved on condition that it clears a check, and it didn't: it is a location in Microsoft's Halo. A replacement is proposed in section 1.
- **Decided:** we generate whatever data gameplay needs, including customers and demographics (see `arc.md`).
- **Decided:** scoring is a report card of four measures (Profit, Readers served, Happiness, Culture) plus an overall score, which is the lowest of the four. See `scoring.md`, which also proposes M1's reduced report card.
- **Decided:** the event director is Almanac ("Alma"). It sets up events, stretches goals and plays the book market. See `scoring.md`.

M1 is the thinnest slice that can be played end to end: an alert, then the revenue chart, then one decision, then one simulated quarter, then the result.

## 1. The opening alert

The game opens on 1 January 2194, the day after the data ends.

> **MERIDIAN STATION / COMMERCE OFFICE**
> **Quarterly review: Orbital Books, Ring C, Berth 14**
>
> Fourth-quarter revenue: $161,525. Third quarter: $274,036. **Down 41%.**
>
> The Commerce Office expects a plan for the first quarter before the shuttle season ends. Your ledgers are open on the console. Dewey can help you read them.
>
> Submit your plan when you are ready.

**Proposal:** rename the station **Larkspur Station** (to be done after approval; the copy still says Meridian). The search found no game, novel or brand using that name, but it was not a trademark search. "Meridian Station" is a location in Halo, and "Meridian" also has a pending game trademark. The issuer is the Commerce Office. A landlord gives the slump some pressure without inventing customers we can't model.

## 2. The investigation

### What the player can look at in M1

M1 has one chart surface with a few controls, plus Dewey (section 6). It doesn't have a full dashboard.

- **Metric:** revenue, units, orders, average order value.
- **Over time:** by month or quarter (2193 only, until the simulation adds 2194).
- **Break down by:** genre, format, publisher, weekday, discount rate, title.
- **Filter:** quarter, genre, discount (any, full price, a specific rate).
- **Drill down:** click a bar or segment to filter to it. A title view shows that title's sales by month.

**Proposal:** expose discount rate as a breakdown, but don't label any rate as "Book of the Month". The player has to find out what the 15% lines are.

### What a good player can find

There are three insights, and a player can reach any of them first. None of them alone is "the answer".

**A. The whole store slowed, not one part of it.** From Q3 to Q4, every genre fell 38 to 53% except Nonfiction. Every format fell 35 to 45%. Average order value barely moved ($14.03 in Q3, $14.12 in Q4), and so did items per order (1.13, 1.14). The number of orders fell 41% (19,534 to 11,441): fewer visits, not smaller baskets. December rebounded to $74k, the year's third-best month, and Q4 as a whole was within 2% of Q2. So Q3 looks like the outlier. Monthly revenue climbs from February to an August peak, then falls. *Caveat the player should feel:* there's only one year of data, so "it's seasonal" is a well-supported reading, not a proof.

**B. The weekdays emptied; the weekends held.** Weekend orders per day fell 28% (245 to 176) from Q3 to Q4. Weekday orders fell 48% (199 to 104). In Q1 2193, weekdays averaged only 61 orders a day. The summer surge was mostly weekday traffic.

*Orders per day divide by every calendar day in the period, including days with no sales, as the query contract defines it (`src/query/contract.md`).*

**C. Nonfiction's "growth" is one promotion, and the promotion is a pattern.** Nonfiction rose from $5.3k to $5.6k entirely because of *Hashtag QuokkaSelfie*: 189 trade paperbacks in December, 177 of them at 15% off, against about 15 copies in a typical month. The other Q4 riser, *The Startling End of Mr. Hidhoo* (Fiction), shows the same pattern in October. Filtering to the 15% rate reveals one title per month, discounted all month, every month: the store's Book of the Month. After adjusting for the season, every one of the 12 picks sold more than expected. The extra copies were similar whatever the title: about 35 to 60 a month. One pick added 174 extra copies and one added only 19. For a bestseller, the discount mostly goes on copies that would have sold anyway. For a quiet title, nearly every discounted copy is an extra sale.

| Month | Book of the Month (edition) | Copies sold | Expected without the promotion | Extra |
| --- | --- | ---: | ---: | ---: |
| Jan | Thatchwork Cottage (trade pbk) | 59 | 16 | 43 |
| Feb | The Seawitch Sings (mass market) | 125 | 71 | 55 |
| Mar | Some Eggs or Something? (trade pbk) | 128 | 70 | 58 |
| Apr | 9803 North Millworks Road (mass market) | 270 | 213 | 57 |
| May | Nothing But Capers (hardcover) | 23 | 4 | 19 |
| Jun | A Horrible Human with the Habits of a Monster (graphic) | 65 | 21 | 44 |
| Jul | Ballinby Boys (hardcover) | 258 | 197 | 62 |
| Aug | Inconvenient Confessions (trade pbk) | 71 | 15 | 56 |
| Sep | The Thing Is (mass market) | 62 | 26 | 36 |
| Oct | The Startling End of Mr. Hidhoo (graphic) | 40 | 3 | 37 |
| Nov | Quiddity and Quoddity (trade pbk) | 45 | 11 | 34 |
| Dec | Hashtag QuokkaSelfie (trade pbk) | 189 | 16 | 173 |

"Expected" is the title's sales in the other 11 months, scaled by that month's store-wide seasonal index.

The traps are reading a 41% drop as a crisis that needs a price cut, and reading Nonfiction as a rising category.

## 3. The decision

The Commerce Office asks for one plan for Q1 2194. **The goal is stated before the player chooses: gross profit for the quarter.** The decision screen also says that books cost the store 60% of list price.

The previous manager has already scheduled the Q1 Books of the Month: *The Mallemaroking* (mass market, January), *Rystwyth* (hardcover, February) and *Portmeirion* (mass market, March). These are the store's three best sellers.

| | Option | Who might pick it | Illustrative effect on Q1 gross profit, compared with A |
| --- | --- | --- | --- |
| A | **Hold course.** Keep the schedule and ride out the season. | Reading A: it's seasonal, so don't panic. | $0 (about $37.1k) |
| B | **Station-wide sale.** 15% off everything for the quarter. | Taking the alert at face value. | About −$7.8k: revenue rises about 3 to 4% while profit falls about 21% (from Sim's engine; holding course already gives away about 1.5% of list in other discounts) |
| C | **Re-pick Book of the Month.** Feature three quiet, well-rated hardcovers instead: *Kalakalal Avenue*, *Can I Be Honest?*, *Who Did You Think You Were Kidding?* | Insight C | About +$1.5k |
| D | **Weekday author nights.** 12 Tuesday-to-Thursday events, $200 each. | Insight B | About +$0.9k, with a range from −$0.4k to +$2.3k |

A, C and D are all defensible. C has the best footing in the data, D is a bet on a real pattern, and A is the honest "nothing is broken". B is the overreaction. It still "wins" on revenue, which is the lesson.

**Decided (David, October 30): the plan combines up to two moves.** The player chooses up to two of B, C and D, or none, which is A. The best plan, C and D together, typically grades B+ (85 to 91) under the lowest-measure score. Holding course grades D (67 to 70), and any plan with the sale grades F. `scoring.md` has the details and the calibration.

**Proposals:**
- ~~Score on gross profit only.~~ **Open:** David asked for more than one measure (see the review at the top).
- In M1, option C's three titles are preset. Letting the player choose the titles is M2 (see `arc.md`).
- ~~Options are exclusive in M1.~~ Superseded: up to two moves can be combined.
- **Decided (David):** before choosing, the player sees the rules of the world: the goal, the 60% cost of goods and the price of an event. They see the effect sizes only after the quarter plays out, in the assumptions panel.

## 4. The simulation

The model is small enough to explain in the assumptions panel, with one line per lever.

**Baseline (Option A, and the base for every other option).** Q1 2194 replays Q1 2193: the same titles, months and weekday pattern, with seeded noise of about ±3% on daily orders. First, the 2193 Book of the Month effect is taken out (those copies return to full price, and the extra copies are removed). Then the 2194 picks are applied. *This assumes 2194 repeats 2193's seasons, so within the game, insight A is true.* **Open:** David wants seasonal trends with some unpredictability, driven by an event director. This baseline would become the director's starting point.

**Levers**

| Lever | Moved by | Effect in the model | Grounding |
| --- | --- | --- | --- |
| Price of the featured title | A, C (and B) | 15% off every copy of that edition for the month | Matches the observed Book of the Month |
| Extra copies of the featured title | A, C | Each pick's extra copies are drawn from one of the 12 observed picks in the table above (median 50) | **From the data.** Assumes no cannibalization: the extra copies don't come out of other titles' sales |
| Store-wide price | B | 15% off every line | Option definition |
| Store-wide extra units | B | +20% units on every title | **Assumed.** The data has no store-wide sale to measure. The panel shows what +10% and +30% would have given |
| Weekday orders | D | Each event adds 30 to 70 orders that day (drawn uniformly) at the Q1 average order value ($13.96) | **Assumed.** The event effect can't be measured: series book-tour counts have no dates. The opportunity is grounded: weekdays have the most room (insight B) |
| Event cost | D | $200 per event | **Assumed** (an author's shuttle fare) |
| Cost of goods | all | 60% of list price | **Assumed** |

**Data that must be generated, and why**

1. **Q1 2194 sales lines.** These come from the replay above, saved as a seeded supporting file. There's no future data, and later investigations will chart 2194 beside 2193.
2. **Unit cost (60% of list) per edition.** The dataset has no costs. Without them, any discount looks like growth, and profit can't be scored.
3. **Store-wide price response (+20% units at 15% off).** No store-wide sale was ever run.
4. **Author-night lift (30 to 70 orders) and cost ($200).** Event dates aren't in the data.
5. **The scheduled 2194 Books of the Month.** This is scenario fiction, not data.

**Randomness.** The run is seeded per playthrough. The do-nothing line uses the same seed, so the comparison shows the effect of the decision rather than noise.

## 5. Scoring and the result screen

After the quarter plays out, the result screen shows:

- **A chart of Q1 2194 by month, with two lines:** "your plan" and "if you'd held course". Q4 2193 sits faintly behind them for context.
- **Tiles with change badges:** gross profit, revenue and units, each compared with holding course. Q1 revenue is far below Q4 in every option (holding course gives about $95k, 41% down again). The screen says plainly that this is the season, and that the comparison that counts is the do-nothing line.
- **What happened:** three plain sentences generated from the model. For example: "The sale sold about 20% more books, but each one earned about $1.85 less. Revenue rose 3%; gross profit fell 21%."
- **Assumptions:** every lever from section 4, each tagged "from your data" or "assumed", with its value.
- **Discoveries:** insights A, B and C, each marked found if the player opened a view that shows it. For example, C counts as found once the player has looked at a title by month with the 15% filter applied. Points aren't the main reward; this is.

**Score:** superseded by `scoring.md`. M1 shows a reduced report card: the four measures, graded against last year's Q1 plus 5%, with the do-nothing line still shown for comparison.

## 6. The in-game agent: Dewey

**Proposal:** call the agent **Dewey**, after the decimal system. It is the station's reference assistant, on loan to the shop. (Alternatives: Index, Marginalia.)

**Personality:** a reference librarian. It's precise, patient and quietly curious. It finds things and leaves the meaning to you, and says so. Its sentences are short. It always says what it queried, and it won't dress up a number.

How it keeps its limits in character:

- **A specific question gets a direct answer and a chart.** "Weekday orders per day: Q3, 199; Q4, 104. Pinned it if you want it."
- **An open question gets questions back.** Asked "Why is revenue down?", Dewey says: "I can't tell you why; that part's yours. I can show revenue, units, orders or average order value, by month or quarter, broken down by genre, format, publisher, weekday, discount or title. What would you like to see?" **Decided (David):** a redirect always offers this full menu, in a fixed order, and never a subset chosen for the question (see `m1-copy.md`).
- **A request for advice gets a polite refusal.** Asked "Which option should I pick?", Dewey says: "Not my shelf. I can show you what last year's data says about anything an option touches."
- **It doesn't volunteer.** If the player has filtered to the 15% rate, Dewey answers what was asked and doesn't point out that it's one title a month.
- **It explains terms** (average order value, seasonal index) **and shows how to use the tools.**
