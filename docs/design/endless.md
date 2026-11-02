# Endless quarters, Alma and removal (design)

Status: **proposal, for David to approve in one pass.** Plot leads and wrote sections 1 to 7; Sim writes the model (section 8), and Sage wrote the Alma engine (section 9). Numbers marked *tune* are starting values for Sim to calibrate.

David, November 2, 2026, overruling Goldy's recommendations on `q2.md`'s two open questions:
- "Alma: Oh just do it. We've got time."
- "The ending: There's no ending. With Alma in play, this can go on and on forever until the player does such a bad job that the panel of robots decides to remove them from the position."

So the half-year review goes, Q2's result screen gets `Continue to Q3`, and the game runs quarter after quarter until the bosses remove the player. Alma, the event director in `scoring.md`, gives every quarter from Q3 on something new to investigate.

The decisions are listed at the end, each with its alternative.

## 1. The loop, from Q3 on

Q1 and Q2 stay exactly as built: their memos, discoveries A to F, and calibration. From Q3 2194 on, every quarter runs the same loop:

1. **Results of the last quarter,** with the running record (section 6) and `Continue to Q{n}`.
2. **Alma sets up the quarter** (section 9). It runs once, when the previous quarter's plan is submitted, while the player reads the result, and its record is saved before the memo shows.
3. **Discover.** The Commerce Office's memo carries the score, any strike, Alma's event and the extra stretch (section 3).
4. **Investigate.** The ledgers now hold every quarter played so far. The quarter's discoveries come from its event (section 5).
5. **Decide.** Up to three picks plus one more move, as in Q2, plus the event's response, if it has one (section 4).
6. **Measure.** The quarter is graded on the same four measures, then the panel checks the removal rule (section 7).

## 2. Alma's events: what ships first

Alma chooses **one event per quarter** from a fixed list of types, and **one measure to stretch**. It writes the story; the numbers come from each type's limits (section 9). The held-course line lives through the same event, so the comparison stays fair.

**Tier 1, for the deadline.** These need no market and no stock. Each one is a multiplier or a cost the engine already has.

| Type | What changes | Limits (*tune*) | Example story |
| --- | --- | --- | --- |
| **Extra stretch** (every quarter, beside the event) | One measure's goal stretches by more than 5% | +10 to 20% instead of 5%; never the same measure two quarters running | `THE COUNCIL HAS READ A STUDY ABOUT FOOT TRAFFIC.` |
| **Genre surge** | One genre's orders rise in one month | +10 to 30%, one month | A book club on the hydroponics deck has started on mysteries. |
| **Genre slump** | One genre's orders fall in one month | −10 to −25%, one month | The station's archive has put its romance collection online for free. |
| **Quiet days** | One weekday's orders fall all quarter | −10 to −25%, one weekday | The Ring C shuttle now docks an hour later on Tuesdays. |
| **Author fares** | An author night's cost changes | $100 to $400 a night, instead of $200 | The shuttle line has repriced its author fares. |
| **Format costs** | One format's cost of goods rises | 60% of list rising to 65 to 70% | A shortage of hardcover board at the printworks. |
| **A quiet quarter** | Nothing but the stretch | At most once in any three quarters | |

**Tier 2, if there's time:** an **Orbitplace lot.** A seller offers a lot of one edition (50 to 300 copies) at 30 to 50% of list, and a rival buyer, played by Alma, may bid against the player. Copies of that edition sold in the quarter, up to the lot's size, cost the lot price instead of 60% of list. Unsold copies are written off at the quarter's end, so the shop still keeps no stock.
- **Response:** `Buy the lot` at the asking price, or a sealed bid between 30% of list and the asking price. The rival's bid is drawn within the same range, from the seed, and the higher bid wins. Ties go to the rival.
- **Why it's tier 2:** it adds a decision type and a result sentence, and its write-off needs Sim to calibrate it.

**Later (the full market in `scoring.md`):** Exchange auctions, blind lots, stock and clutter. Events such as "The Exchange is offline after an incident involving a cargo of novelty space geese; auction prices are expected to double" need the market, so they wait for it.

**Limits on choosing** (the server enforces them, not the prompt):
- No event type two quarters running.
- No event against the measure that's being stretched. The stretch is the quarter's pressure on that measure, and the event's is elsewhere.
- **No piling on:** while the player is on a strike (section 7), Alma may choose only a genre surge, author fares or a quiet quarter. A removal should come from the player's plans, not from Alma's dice.
- **Recovery goals:** if a measure fell by more than 10% against the same quarter a year earlier, the stretch must name it, and the reason is the drop: `HAPPINESS FELL 14%. RESTORE IT.` (`scoring.md`, "Recovery goals").

**Bound:** an event's expected effect on holding course is at most 10% of any measure's anchor; the server rejects a record past that (section 8). The tier-1 limits stay inside it, with the largest swing at 9.8% (format costs, on profit).

**How goals count an event (proposal).** As with the new volume (#107), each goal adds the event's expected effect on holding course. So an event changes what's best, not where 70 sits. The stretch is the exception: it raises one goal on purpose. **Alternative:** don't anchor events, so a bad event lowers everyone's grades, and meeting the goals anyway earns Weathered the Storm. That makes the dice decide strikes, which the removal rule can't tolerate.

## 3. The memo

It arrives the same three ways as before (transmission, strip, bell), on the quarter's first day.

```
LARKSPUR STATION / COMMERCE OFFICE
Quarterly review: Orbital Books, Ring C, Berth 14
{Month} 1, {year}

{Last quarter} overall score: {score} ({grade}). Lowest measure: {measure}.
{Strike line, if any}

{Alma's story: one or two sentences, with the server's figures}

The {boss} has stretched its goal for {measure} to {stretch}% above last year. Its reason: "{STRETCH REASON}"

The Book of the Month calendar for {months} is empty. Submit your picks and a plan when you are ready.
```

| Element | String |
| --- | --- |
| Strike line | `This was a strike: your overall score was under 70. Another one next quarter, and the panel will remove you.` |
| Strike cleared line | `Your strike is cleared.` |
| Transmission, boss line | Alma's, one per quarter, in capitals, reviewed against the rules in section 9 |
| Transmission, boss line when Alma is unavailable | The scripted event's own line (section 9) |
| Strip | `Standing order from the Commerce Office: submit your picks and a plan for {quarter}.` |
| Strip, on a strike | `Standing order from the Commerce Office: one more strike ends your tenure. Submit a plan for {quarter}.` |
| Bell, title | `{Quarter}: {event's short title}` |

**Every event's figures are in the memo.** The player always knows the event's size before deciding, as `scoring.md` says of goals: "The player always knows the target before deciding." Examples, with the server's figures in bold:
- `A book club on the hydroponics deck has started on mysteries. The Council expects mystery orders to rise **20%** in **August**.`
- `The Ring C shuttle now docks an hour later on Tuesdays. The Council expects Tuesday orders to fall **15%** this quarter.`

## 4. The decision

The Q2 form, each quarter: up to three picks (one a month) and up to one more move (author nights or the sale). A tier-2 lot adds its own row. Holding course is still "no picks and no other move".

| Element | String |
| --- | --- |
| Scene heading | `PLAN FOR {QUARTER}` |
| Form serial | `LKS-{year}-Q{n}-{0000 + quarter number}` |
| Form footer | `Three picks and one move maximum. Filed requisitions are final.` |
| Lot row, label | `ORBITPLACE LOT (OPTIONAL)` |
| Lot row, options | `No bid`, `Buy the lot: {n} copies of {title} ({format}) at {price} each`, `Bid: {price} each` |

**The bosses' brief** keeps the five-boss scene. The Administrator's and the stretched boss's facts change with the quarter, and the stretched boss's line is Alma's. The other boss lines rotate through a fixed set, so the scene doesn't repeat word for word every quarter. Plot writes eight per boss, for 40 in all, after David approves this design.

## 5. Investigating once the 2193 discoveries run out

Discoveries A to F stay with Q1 and Q2. From Q3 on, each quarter offers **up to three discoveries**:

1. **The event's discovery**, from a template for its type. The evidence rules are M1's: only views the player produced, before the plan is submitted, nonempty and not truncated, and the server decides.

| Event | Found when the player has seen | Found text |
| --- | --- | --- |
| Genre surge or slump | Units by title within that genre, for the same quarter a year earlier, with at least 10 titles | `You looked inside {genre}, title by title.` |
| Quiet days | Orders by weekday, for at least one past quarter | `You found the {weekday} pattern in last year's orders.` |
| Author fares | Your author nights' extra orders by quarter, or by night, for any quarter you ran them. If you never have, there's no discovery | `You checked what an author night brings in.` |
| Format costs | Units or revenue by format, for the same quarter a year earlier | `You checked how much of the shop is {format}.` |
| Orbitplace lot | Units by month for the lot's edition, over at least the last four quarters | `You checked the lot's title before bidding.` |
| A quiet quarter | Nothing: there's no event discovery | |

2. **Your last quarter, on the record:** one measure with the last quarter and the same quarter a year earlier both visible. This is F, generalized. (*Found text:* `You compared {last quarter} with {the quarter a year before}.`)
3. **Your weakest measure:** a view of the measure that bound last quarter, by month or by title, for the last quarter. (*Found text:* `You looked into {measure}, last quarter's lowest.`)

`{found} of {total} found.` Not-found texts follow the same pattern as M1's: one plain sentence saying where to look, never the answer.

**Why the event is the source:** the 2193 data can't surprise a player twice, but Alma's events make each quarter ask a new question of the same ledger. A mystery surge asks which mysteries are quiet and well rated, a Tuesday slump asks what author nights do on Tuesdays, and a lot asks whether a title sells. The player's own quarters add to the ledger, so the answers change as the game goes on.

**Dewey stays blind to Alma.** Dewey sees the ledger, which holds each quarter's sales, but not the event records, the memos or Alma's parameters. A player can tell Dewey about the event and ask for a lookup, and Dewey answers from the data like any other question.

## 6. The running record (replacing the half-year review)

The half-year review comes off Q2's result screen. Every result screen from Q2 on ends with the **service record**:

| Element | String |
| --- | --- |
| Heading | `Service record` |
| Table | Columns `Quarter`, `Profit`, `Readers served`, `Happiness`, `Culture`, `Overall`, `Event`. One row per quarter played, newest first. Each cell is a score and grade, as in the half-year review: `83 (B)`. A strike quarter's `Overall` reads `66 (D), strike` |
| Tenure line | `Manager since January 1, 2194: {n} quarters. Average overall score: {mean} ({grade}).` |
| Best quarter line | `Best quarter: {quarter}, {score} ({grade}).` |
| Primary button | `Continue to {next quarter}` |
| Secondary buttons | `See the assumptions`, `Back to the ledgers` |

**The annual review.** After each Q4 the record adds a year line, `{year}: average overall score {mean} ({grade})`, and the Administrator speaks. This keeps the old review's bands as a once-a-year moment, using `q2.md`'s lines:

| Average overall for the year | Administrator |
| --- | --- |
| 80 or above | `{YEAR} SCORE: {score}. FOUR GOOD QUARTERS IN A ROW. WE DID NOT KNOW THIS WAS PERMITTED. WE ARE DOING MAGNUM.` |
| 70 to 79 | `{YEAR} SCORE: {score}. THE SHOP CONTINUES. THIS IS ALSO A LOOK.` |
| Below 70 | `{YEAR} SCORE: {score}. THE ADMINISTRATOR WILL NEED TO SIT DOWN AGAIN.` |

`scoring.md`'s annual awards (the year's certificates, given unanimously by every boss) belong here once certificates are built. They aren't built yet.

**Saved games.** Every quarter is saved with its plan, result and Alma record (section 9), so the record, the ledgers and a replay all read from the save.

## 7. Removal

**Proposal: two strikes in a row.**
- A quarter whose overall score is **under 70** (a D or an F) is a **strike.**
- A quarter at **70 or above** clears it.
- A **second strike in a row** ends the game: the panel removes the player.
- Q1 counts. So holding course twice (about 66 each time) removes a player at the end of Q2. Coasting is a bad job, and that's what David asked the bosses to catch ("make coasting impossible", 30 Oct).

Why this rule:
- It's easy to say, and the memo can say it in a line.
- A single bad quarter, such as trying the sale once, is survivable, so the player can experiment and recover.
- The player is always warned one quarter ahead.
- With section 2's "no piling on" rule, Alma can't hand the second strike out by itself.

**Alternatives:**
- **A. Average below 70 over the last four quarters** (after at least four). It's more forgiving and slower, and much harder to explain in a memo.
- **B. Any F (under 60) removes at once.** One sale ends the game (Q1's sale scores 38 to 45). That's funny the first time and punishing after.
- **C. Three strikes in any four quarters.** It's in between, but needs a counter the player has to track.

**Calibrated (section 8):** with no ratchet, quiet picks plus author nights every quarter was removed in 1 of 20 games over five years. Holding course, the sale and the trap picks are removed at the end of Q2 2194, every time. The cost is in Q3 and Q4: a player making one sensible move each quarter is usually removed at Q4 2194. Under C, nobody making a sensible move is removed in the first year.

**The removal screen.** It replaces the result screen's buttons once the panel has voted. The whole board speaks, in report-card order, and the facts are plain.

| Element | String |
| --- | --- |
| Heading | `The panel has voted` |
| The Station Administrator | `THE PANEL HAS CONVENED. THE VOTE WAS UNANIMOUS. IT IS ALWAYS UNANIMOUS. WE CHECKED.` |
| The Commerce Office | `TWO QUARTERS BELOW STANDARD. THE LEDGER HAS NOTED IT. THE LEDGER NOTES EVERYTHING. IT IS NOT A GOOD LOOK.` |
| The Throughput Subcommittee | `YOUR KEYS HAVE BEEN COLLECTED. YOU DID NOT HAVE KEYS. WE COLLECTED THEM ANYWAY.` |
| The Readers' Guild survey drone | `THE DRONE WILL MISS YOU. THE DRONE HAS NO FEELINGS. THE DRONE WILL MISS YOU ANYWAY.` |
| The Ministry of Culture | `MR. ZOOLANDER WAS ALSO ASKED TO LEAVE ONCE. HE CAME BACK WITH A LOOK. WE DO NOT EXPECT THIS OF YOU.` |
| Fact strip (plain) | `You were removed after two quarters in a row with an overall score under 70: {quarter} ({score}) and {quarter} ({score}). You ran Orbital Books for {n} quarters, from Q1 2194 to {last quarter}.` |
| Then | The service record, with a final row: `Removed by the panel, {date}.` |
| Primary button | `Play again` (a new game from January 1, 2194, with a new seed) |
| Secondary button | `Back to the ledgers` (read-only: the station stays open to look at, but no plan can be filed) |

**The strike memo's boss line** (the Administrator, after a quarter under 70): `OVERALL SCORE: {score}. THAT IS A STRIKE. ONE MORE, AND THE PANEL CONVENES. THE PANEL HAS ALREADY BOOKED THE ROOM.`

**The strike-cleared line:** `THE STRIKE IS CLEARED. WE HAVE UPDATED THE SPREADSHEET. THE SPREADSHEET IS RELIEVED.`

## 8. Model (Sim)

*Written by Sim, November 2, 2026. The numbers come from a prototype of the engine below, run over seeds 1 to 20 and 20 quarters (Q1 2194 to Q4 2198), with section 2's tier-1 limits and choosing rules. Its anchors averaged 8 of the 20 `EFFECT_SEEDS`. The prototype isn't committed. The build PR turns it into code, with these bands as its tests.*

### The baseline, every quarter

- **Q1 and Q2 2194 don't change.** Their draws, fingerprints and calibration stay as built.
- **From Q3 2194, each quarter replays 2193's same quarter,** with M1's rules: the 364-day replay, 2193's Books of the Month removed, and ±3% daily noise. There's no trend. A trend would compound away from the data, and the anchor below would cancel it anyway.
- **Every year has its own draws.** A quarter's streams are named by year and quarter: `q3:noise` in 2194, as now, and `2195:q1:noise` from 2195. One seed per game still decides everything.
- **The new volume** sells at its post-launch rate from 2195 on, 4.5 copies a day from January 1, with no launch weeks. That's the rate `new-volume`'s Q2 assumption already states.
- **Holding course** is no picks and no other move, from Q2 2194 on. The old manager's schedule ran only in Q1 2194, so Q1 2195's holding course has an empty calendar.

### Events are conditions on the baseline

Each quarter's event record becomes one plain `conditions` object. The engine applies it to the baseline, after the new volume and before the levers, so holding course lives through it too.

| Condition | Engine effect | Event types |
| --- | --- | --- |
| `genre: { genre, month, factor }` | Each order with a line in that genre, in that month, is dropped (factor below 1) or cloned (above 1) with probability \|factor − 1\|. This is the daily noise's drop-or-clone, on its own `alma` stream. | Genre surge, genre slump |
| `weekday: { weekday, factor }` | The same, for every order on that weekday, all quarter | Quiet days |
| `fare` | Each author night costs `fare` instead of $200 | Author fares |
| `cogs: { format, rate }` | That format's copies cost `rate` × list instead of 60% | Format costs |

A quiet quarter and the stretch have no conditions. The stretch changes only the goal: anchor + max(stretch × \|anchor\|, step), in place of 5%.

### Goals: anchored, no ratchet (decision 7)

Each measure's **anchor**, the result that scores 70, is:

> 2193's same quarter as sold + the new volume's expected effect on holding course + the event's expected effect on holding course.

"Expected effect" means the mean, over `EFFECT_SEEDS` (101 to 120, as in #142), of holding course with the condition minus without it. The goal is the anchor plus 5%, or plus Alma's stretch for the stretched measure. That's the recipe Q1 and Q2 already use, so their anchors don't change.

**The three goal rules, measured** (median overall score over the 20 seeds, Q1 2195 to Q4 2195):

| Anchor | Hold course | Picks only | Author nights only | Quiet picks + author nights |
| --- | --- | --- | --- | --- |
| **No ratchet** (proposal) | 68, 66, 64, 62 | 71, 71, 68, 66 | 76.5, 73, 69, 68 | 85, 78.5, 72, 72 |
| **Full ratchet** (last year = the player's own quarter, events anchored) | 63, 70, 69, 70 | 70, 68, 69, 69 | 64, 69, 68.5, 69.5 | 70, 68, 68, 69 |
| **Half ratchet** (half of last year's gain over the anchor, never less) | 66, 66, 64, 62 | 70, 70, 68, 66 | 69.5, 71, 68.5, 68 | 76.5, 72.5, 70, 71 |

- **A full ratchet flattens the card.** From Q2 2195, every plan's median is 68 to 70, holding course and the sale included. Last year's result becomes this year's floor whatever the player did, so the card stops telling plans apart. Under two-in-a-row, the good plan is removed in 15 of 20 games by the end of 2195.
- **A half ratchet** keeps the plans apart, but still removes 7 of 20 good players within five years under two-in-a-row (below).
- **No ratchet** keeps every quarter's bands where Q1 and Q2 put them. Alma's stretches and events vary the quarters, so the difficulty doesn't need to compound.

### Event bounds

The swing of each type's expected effect on holding course, as a share of the quarter's anchor without the event (the measured range over 20 seeds, Q3 2194 to Q4 2198):

| Type, at section 2's limits | Profit | Readers served | Happiness | Culture |
| --- | --- | --- | --- | --- |
| Genre surge, +10 to 30% | 0 to +5.3% | 0 to +4.6% | −0.2 to +0.5% | 0 |
| Genre slump, −10 to −25% | −2.7 to 0% | −2.3 to 0% | −0.3 to +0.2% | −0.9 to −0.1% |
| Quiet days, −10 to −25% | −5.4 to −1.1% | −5.4 to −1.1% | under 0.1% | −2.2 to −0.4% |
| Format costs, 65 to 70% | −9.8 to −0.2% (largest for hardcovers, then mass market paperbacks) | 0 | 0 | 0 |
| Author fares, $100 to $400 | 0 for holding course; the good plan's profit lift ranges from −0.6% to +10.4% | 0 | 0 | 0 |

- **The bound:** the server rejects an event record whose expected effect on holding course is more than **10% of any measure's anchor**. It checks this when the record is chosen, with the same seeds as the anchor, and a rejected record falls back like any invalid one. Every tier-1 type fits by construction: the largest swing measured is 9.8%.
- **Because the goals are anchored, an event can't cause a strike by itself.** Holding course scores the same with or without it, and so does a plan that ignores it, within noise. What an event changes is what's best. Author fares, for example, move the author-night plan's profit lift over holding course from 2.2% (median) to anywhere between −0.6% and +10.4%.
- **Culture under a surge:** a genre surge adds orders but almost no Culture. The clones repeat titles already sold that day, and each title counts once a day.
- **Tier 2's lot** isn't calibrated. Its bound, when it's built:
  - its size is at most 1.5 times the edition's copies in the same quarter of 2193;
  - and the lot's price is at most 4% of the quarter's profit anchor (*tune*), which caps the write-off. The server checks both, like the other bound.
  - Holding course doesn't bid, so the lot adds nothing to the anchor.

### Removal, calibrated (decision 6)

The rules applied to the same runs, with no ratchet. Each cell is how many of the 20 seeds were removed by the end of 2194, 2195, 2196 and 2198, and the median quarter of removal. "Quiet picks + author nights" chooses, each month, the best-rated hardcover that sold 2 copies or fewer in that month of 2193, which is Q2's quiet-picks idea in any quarter.

| Plan, every quarter | Two strikes in a row (proposal) | Three strikes in any four (C) |
| --- | --- | --- |
| Hold course | 20, 20, 20, 20 of 20; Q2 2194 | 20 of 20; Q3 2194 |
| The sale | 20 of 20; Q2 2194 | 20 of 20; Q3 2194 |
| Bestseller picks (Q2's trap) | 20 of 20; Q2 2194 | 20 of 20; Q3 2194 |
| Author nights only | 17, 20, 20, 20; Q4 2194 | 2, 4, 9, 10; Q1 to Q2 2196 |
| Picks only (quiet) | 16, 19, 20, 20; Q4 2194 | 0 of 20 |
| Quiet picks + author nights | 0, 0, 1, 1 of 20; Q1 2196 | 0 of 20 |

**How often a reasonable plan collects a strike,** from Q3 2194 on (the share of quarters under 70, and the score range):

| Plan | Q1 | Q2 | Q3 | Q4 |
| --- | --- | --- | --- | --- |
| Quiet picks + author nights | 1% (69–89) | 3% (67–83) | 10% (66–77) | 23% (64–82) |
| Picks only | 0% (70–75) | 0% (70–74) | 83% (67–72) | 99% (64–70) |
| Author nights only | 8% (66–85) | 9% (63–79) | 79% (63–71) | 95% (60–73) |
| Hold course | 100% (68–69) | 100% (64–67) | 100% (62–66) | 100% (60–63) |

- **Two strikes in a row meets section 7's target.** The good plan was removed in 1 of 20 games over five years, by a Q4-then-Q1 pair. Holding course, the sale and the trap picks are removed at the end of Q2 2194, every time.
- **The cost: Q3 and Q4 are the hard quarters.** 2193's Q3 and Q4 had busy Books of the Month (December's sold 173 extra copies), so their anchors sit well above an empty calendar, and Q2's two levers are weaker there. A player making one sensible move each quarter is usually removed at Q4 2194. The event discoveries (section 5) should help a player who uses them: the prototype's good plan ignores the event, so these bands are a floor.
- **C (three in any four) is the forgiving alternative.** It removes coasting a quarter later and spares the one-move players, except author nights only, half of whom go within five years. If David wants "a bad job" to mean D's every quarter, not one move a quarter, C is the rule.
- **"No piling on" can't change these numbers.** With anchored goals, events don't cause strikes, so the rule only keeps the story kind.
- **Two in a row under 60** was also measured. It removes only the sale and half the trap-pick players, so coasting survives forever. It isn't a candidate.

### What the engine exposes

- One pure call per quarter: `simulateTurn({ year, quarter, seed, plan, conditions, stretch })`, returning Q2's result shape (lines, the holding-course lines, the outcome and the report card). There's no I/O, as now. Frank's save supplies the year, quarter, seed, plan and the event record. Replaying the saved plans and records reproduces every score.
- The quarter's anchor is computed and cached per (quarter, conditions). That takes 40 holding-course runs. The prototype ran about 20 a quarter in 0.15 s, so this should take well under a second, but the server should still compute it when Alma's record is saved, behind the result screen.
- `conditionsOf(event)` maps an event record's type and params to `conditions`. It's the only place the engine reads Alma's record, so Sage's validator and the engine agree on one schema.
- **Assumptions panel:** each condition adds one *assumed* rule in the quarter's assumptions. For example: "Mystery orders in August were 20% higher than the replay: Alma's event, counted in the goals."

## 9. Alma's engine (Sage)

*Written by Sage, November 2, 2026; Plot's answers to Sage's questions are folded in.*

**Runtime.** Alma runs as headless Claude Code, on the server only, from the same spawn code as Dewey (`src/assistant/server/claudeCode.server.ts`), moved into a shared helper. It's locked down like Dewey, minus the tools:
- `--tools ""`, and an empty `--strict-mcp-config` (no MCP server at all), with no `--allowedTools`;
- `--permission-mode dontAsk`, `--setting-sources ""`, `--disable-slash-commands`, `--no-session-persistence`;
- a temporary empty working directory and a minimal environment, with no query token, because Alma has nothing to look up.

Like Dewey, it fails closed on the init line: the run is killed unless the tools list is empty, no MCP server is listed, and skills and slash commands are empty. The model comes from `ORBITAL_ALMA_MODEL` (default `sonnet`, as Dewey's). `ORBITAL_ALMA_PROVIDER=scripted` forces the fallback. Vitest and e2e always use it, so automated runs never call the model.

**When it runs.** Alma runs when the previous quarter is committed, at the plan submit that produces the result. It works in the background while the player reads the result screen. Arriving in the new quarter only reads the record. If the record isn't ready by then, the loader waits out the rest of the budget, then falls back. The record is saved before the memo shows, and a reload never re-rolls it. **Alma starts at Q3 2194:** Q1 and Q2 stay fixed, so it first runs when the Q2 plan is submitted.

**Timeout.** Dewey's replies with tools took 2 to 14 s in Probe's runs, under a 120 s cap. Alma makes one call with no tools and a short output, so each attempt gets 30 s, with one retry, and only on invalid output, not after a timeout. The worst case is 60 s, mostly hidden behind the result screen.

**What Alma sees.** An input builder, a pure function over the save, with a test that pins its keys:
- each past quarter's plan, as structured choices (lever ids, and picked titles from the catalog);
- each quarter's scores, grades and strikes;
- the past event records (type, params, stretch and source, but not the text).

Nothing the player typed ever reaches Alma: no Dewey conversation, no investigations, no discoveries. Plans are fixed choices, so there's no prompt-injection path from the player. The rules and the type list sit in `--system-prompt`, and the state goes in on stdin.

**What Dewey sees.** Dewey's prompt and tool server never read the event log. If an event changes the simulated sales, Dewey sees those sales through the query layer, as data, like any other sales. It never sees an event's type, params or text. A test pins that Dewey's prompt builder takes no save fields.

**Output and validation.** The result must parse as exactly one JSON object, with no extra keys:

`{ type, params, stretch: { measure, reason }, story, bossLine }`

- `type` must be in section 2's list, and the choosing rules must hold (no repeat type, no event against the stretched measure, no piling on during a strike, the recovery rule).
- Each param must fit its type's schema: an enum from a fixed list (a genre, a weekday, a format, an edition), or an integer within the type's limits. There are no free numbers and no clamping: out of range means invalid.
- `stretch.measure` must be a report-card measure.
- **The text has three fields, each with its own voice:**
  - `story`: plain prose for the memo, one or two sentences;
  - `stretch.reason`: the boss's reason, in capitals ("THE COUNCIL HAS READ A STUDY ABOUT FOOT TRAFFIC.");
  - `bossLine`: the transmission's line, in capitals.
- **Checks on every text field:** numbers appear only as slots (`{{param}}`), which the server renders from params, formatted for each type, like Dewey's refs. Outside slots, the number half of Dewey's lexical ban applies (`figures.server.ts`): no digits, number words, fraction words, `$` or `%`. Its direction and comparison words don't: Alma's own event is the story's truth, so "surge" and "slump" are fine. There's also a character cap per field, no emoji, email redaction and no `@` at all (Claude Code puts the account's email into the model's context, the same risk as Dewey's).
- **Zoolander only in `bossLine`.** Because the fields are separate, this can be checked: `story` and `stretch.reason` are rejected if they name him.
- Any failure invalidates the whole record. Sentences aren't dropped, since a story with a hole makes no sense. Then one retry, then the scripted fallback.

**The log and replay.** The save gets `events[]`, one record per quarter: `{ quarter, source: "alma" | "scripted", type, params, stretch, story, bossLine, model, promptVersion, attempts, failure? }`. The simulation reads only the type, the params and the stretch, plus the save's seed. So replaying the plans and the log reproduces every score without calling the model. Frank owns the save and the simulation's hooks, so Sage agrees the record's shape and where the effect applies with him and Sim.

**The scripted fallback.** A list in the same schema, picked by the save's seed and the quarter, that follows the same choosing rules. Plot writes its text: one entry per tier-1 type and value (each genre, weekday and format). A test checks that every entry passes the validator, so the fallback can never be invalid. The player can't tell a scripted quarter from Alma's.

**Sellers and rival buyers.** `scoring.md` has Alma play every seller and rival buyer. For the take-home that's only tier 2's Orbitplace lot, and it needs no extra call. The lot's edition, size and asking price are params of the quarter's event, and the rival's bid is drawn from the seed within the type's limits. Playing negotiations turn by turn waits for the full market.

**Analytics and privacy.**
- Alma's input holds no player text, and its output is game content kept in the save, not analytics. So no `agent_text` hold is needed.
- The event is `alma_event_chosen`: `{ quarter, source, type, ms, attempts, failure code }`, with no text, sent like any other event.
- The privacy page needs a line: like Dewey, Alma sends game state (plans and scores, nothing typed) to Claude through Claude Code, under the signed-in account. Sage makes that edit in the build PR.

**Build order (Sage).** The first PR is the runtime, the validator, the scripted fallback and the log, with a stand-in type list until this design is approved.

## Decisions for David

1. **The game runs until removal,** with Alma from Q3 2194 on. Q1 and Q2 stay as built, except that the half-year review becomes the service record (sections 1 and 6).
2. **Tier 1 ships first:** the extra stretch every quarter, plus one of a genre surge, a genre slump, quiet days, author fares, format costs or a quiet quarter. The Orbitplace lot with a rival bid is tier 2, and the full market waits (section 2).
3. **Goals count each event's expected effect, except the stretch** (section 2). The alternative: unanchored events, with Weathered the Storm for beating them.
4. **No piling on:** on a strike, Alma may choose only a mild event (section 2).
5. **Each quarter's discoveries come from its event,** plus "your last quarter on the record" and "your weakest measure" (section 5).
6. **Removal is two strikes in a row,** a strike being an overall score under 70 (section 7). Calibrated: the good plan survives 19 of 20 five-year games, and holding course is removed at the end of Q2 2194; one move a quarter is usually removed at Q4 2194 (section 8). The alternatives are A (four-quarter average), B (any F) and C (three in four), which spares one-move players.
7. **Goals don't ratchet:** every year's goals start from 2193's replay of that quarter, plus events and stretch, so a strong year doesn't raise the bar for the next (section 8). The alternatives are a full ratchet, which flattens every plan to 68 to 70 from 2195, and a half ratchet, which removes 7 of 20 good players within five years (section 8).
8. **The service record replaces the half-year review,** with an annual review after each Q4 (section 6).
