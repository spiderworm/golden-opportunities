# Scoring, Alma and the book market (design)

Status: **decided by David with Plot, October 30, 2026,** in a one-question-at-a-time discussion. The quotes and reasoning are in `docs/collaboration-log.md`. Items marked **Proposal** are still Plot's suggestions. Numbers marked *tune* are starting values to adjust in play-testing.

## The report card

Each quarter the player is graded on **four measures**, each scored out of 100. The **combined score** is their plain average.

| Measure | What it rewards | Boss (sets its goals) |
| --- | --- | --- |
| **Profit** | Making money | The Commerce Office |
| **Readers served** | Getting people through the door (orders) | The Station Council's Throughput Subcommittee |
| **Happiness** | Readers finding what they love | The Readers' Guild survey drone |
| **Culture** | Widening what the station reads | The Ministry of Culture |

The Station Administrator owns the combined score, and misunderstands it.

**The chart:** a line chart over time, with quarters along the bottom. Each measure has its own colored line, and the combined score has one too. Award markers sit on the quarters where awards were won.

**Letter grades:**

| Score | Grade |
| --- | --- |
| 100 | A+ |
| 93–99 | A |
| 90–92 | A− |
| 87–89 | B+ |
| 83–86 | B |
| 80–82 | B− |
| 77–79 | C+ |
| 73–76 | C |
| 70–72 | C− |
| 60–69 | D |
| Below 60 | F |

## Goals

- **Base goal:** the same quarter last year, plus a stretch (*tune*: 5%). Basing goals on the same quarter means the season never punishes the player.
- **Goals are announced at the start of each quarter, by the bosses.** The player always knows the target before deciding.
- **Alma's extra stretch:** each quarter, Alma picks one measure for its boss to stretch much harder (*tune*: +20 to 25%), with a reason from the story. "THE COUNCIL HAS READ A STUDY ABOUT FOOT TRAFFIC."
- **Recovery goals:** if a measure drops sharply, its next goal is to restore it. "HAPPINESS FELL 14%. RESTORE IT."

## From a result to a score

Each measure is graded on progress from last year (the floor) toward the goal:

- **At or above the goal:** 100, an A+. Going past the goal earns the Exceeds Requirements award; the score stays capped at 100.
- **Between last year and the goal:** 65 + 35 × (result − last year) ÷ (goal − last year). Matching last year scores 65, a D.
- **Below last year:** 65, minus 2.5 points for every 1% below last year (*tune*), down to 0.

**Why not result ÷ goal?** That ratio crowds every grade into the top of the scale. On Q1 profit, the best M1 option and doing nothing came out 4 points apart. Grading progress makes decisions visible on the card. Alma's stretches and events decide how hard each goal is. David's verdict: "Let's try your recommendation, see how well it works out."

## How each measure is computed

**Profit:** revenue minus cost of goods minus spending (events and so on). Once the market exists, cost of goods is what the player actually paid. Until then (M1), it's assumed to be 60% of list price.

**Readers served:** orders in the quarter.

**Happiness:** the watcher AI's estimate, averaged over every visit. In the story, the shop's sensors (the survey drone's eyes) follow each visitor from the door to the exit. In the simulation, each visit's happiness is computed directly from four ingredients:

| Ingredient | What it means | Grounding |
| --- | --- | --- |
| **Quality** | Bought books they'll love | The rating of the copies bought (real data) |
| **Value** | Felt the price was fair | Discounts, with diminishing returns |
| **Comfort** | The crowd and the clutter suited them | Each generated customer has a temperament: crowds bother some and energize others, and heavy readers lean toward bothered. Clutter works the same way: a little charms some readers, and a lot bothers nearly everyone. |
| **Found it** | If they came for a title, it was there | Generated visit intents plus stock. A miss hits sharply. |

The watcher's voice narrates a few representative visits each quarter, and its log can be investigated like any other data.

**Culture:**
- **Title culture:** each title has a hidden culture value, from its average rating (stretched across the scale) plus a bonus for each award. Each title contributes at most **once a day**. That cap is what rewards breadth: a bestseller and a quiet gem count the same on a day they both sell. In 2193 a title sold on 60% of its possible days, so there's room to grow. Under a weekly or monthly cap there wouldn't be (90% and 99%).
- **Genre spread:** each day's title culture is multiplied by the share of the 8 genres that sold that day.
- **Events:** author nights and readings, weighted by attendance.
- **Library ties:** partnerships with the station's seven libraries.

Culture values stay hidden. Each quarter the Ministry announces its top contributors, so players learn what counts from the outcomes.

## Awards

Awards are honors, not points, with one exception: Well-Rounded Shop adds **+3** to that quarter's combined score, still capped at 100. Awards appear as markers on the chart and as plaques on a shelf in the 3D shop.

| Award | Earned for | Presented by |
| --- | --- | --- |
| **Exceeds Requirements** | Any measure past its goal | That measure's boss |
| **Well-Rounded Shop** | All four measures at 80 or above in a quarter | The Station Administrator |
| **Comeback** | Restoring a measure that dropped sharply the quarter before | The boss who set the recovery goal |
| **Weathered the Storm** | Meeting goals in a quarter Alma hit with a major event | The Commerce Office |
| **Annual awards** | The same awards over a whole year, at an annual review where every boss gives a verdict | All the bosses, unanimously |

## The bosses

The bosses are heartless groupthink robots who are unintentionally hilarious. David: "we've got a real winning formula on our hands." The numbers they quote are real, and their reasoning is a spreadsheet with a voice. They speak in capitals, in short declaratives, with their votes always unanimous. Each boss is one Tripo model, and the Commerce Office is seven copies of the same unit.

> "WE HAVE REVIEWED YOUR QUARTER. PROFIT ROSE 4%. WE ARE PLEASED. NEXT QUARTER, WE REQUIRE 9%. THIS IS ALSO PLEASING."

## Alma, the event director

**Almanac ("Alma")** is a separate behind-the-scenes LLM. Players never meet it; they feel its work through events, the market and the bosses' memos. Dewey can't see it, and never will (David: "Dewey must remain blind, absolutely").

What Alma does:
- **Sets up situations:** seasonal swings with surprises, and major events. For example: "The Exchange is offline after an incident involving a cargo of novelty space geese; auction prices are expected to double."
- **Picks the extra-stretch measure** each quarter, and gives the bosses their reasons.
- **Plays every seller and rival buyer** in the market.

Rules that keep it fair and explainable (**Proposal**, carried over from the earlier discussion):
- **Events come from a list of types, each with set limits.** Alma writes the story text freely but can't invent numbers outside those limits. Every event appears afterwards in the assumptions panel.
- **Holding course lives through the same events,** so the comparison line stays fair.
- **Each game's events are logged,** so a game can be replayed exactly. A scripted list of events stands in if the LLM is unavailable.
- **Alma watches decisions, results and pacing,** not what the player looked at while investigating.

## The book market

- **The Exchange (auctions):** single titles, or bulk lots that are either listed ("show") or unseen ("blind"). The player bids, and finds out whether they won when the auction ends.
- **Orbitplace (fixed-price sales):** one-off listings, first come, first served.
- **Dewey can suggest bids and buy on autopilot,** using only a fixed rule it shows every time, based on last year's sales (David: "the weakest of algorithms ever"). The game starts with buying handed to Dewey, and the player can take over at any time. Dewey's autopilot is also the "held course" line for buying. This is the one exception to Dewey's limits, and it's recorded in `docs/requirements.md`.
- **There's no shelf-capacity system.** Overflow piles up on top of shelves, then on the floor, and the 3D shop shows it. Clutter feeds into Comfort, and unsold stock ties up money.

## What this means for M1 (Proposal, for Goldy to scope)

M1 is still one decision and one quarter, with no market and no Alma. Its result screen would show the report card in a reduced form:
- **Profit and Readers served:** as designed in `m1-slice.md`.
- **Culture:** title culture and genre spread from the real ratings and awards, plus Events from option D.
- **Happiness:** Quality and Value only. Comfort needs generated customers, and Found it needs stock; both arrive with the market in M2.
- **Goals:** last year's Q1 plus 5% on every measure, with no extra stretch. Alma isn't there yet to set one.

This puts every M1 option on the card in a distinct shape. The sale lifts Readers served and sinks Profit. The quiet picks lift Profit and Culture. The author nights lift Readers served and Culture, but gamble on Profit.
