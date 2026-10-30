# Scoring, Alma and the book market (design)

Status: **decided by David with Plot, October 30, 2026,** in a one-question-at-a-time discussion. The quotes and reasoning are in `docs/collaboration-log.md`. Items marked **Proposal** are still Plot's suggestions. Numbers marked *tune* are starting values to adjust in play-testing.

## The report card

Each quarter the player is graded on **four measures**, each scored out of 100. The **overall score is the lowest of the four**, always. Raise two measures by sacrificing a third, and the overall score falls. David: "our really really mean robot overlord bosses make our overall score to whatever our lowest measure is. Just that. Always."

| Measure | What it rewards | Boss (sets its goals) |
| --- | --- | --- |
| **Profit** | Making money | The Commerce Office |
| **Readers served** | Getting people through the door (orders) | The Station Council's Throughput Subcommittee |
| **Happiness** | Readers finding what they love | The Readers' Guild survey drone |
| **Culture** | Widening what the station reads | The Ministry of Culture |

The Station Administrator announces the overall score. The boss of the lowest measure takes the credit, or the blame.

**The chart:** a line chart over time, with quarters along the bottom. Each measure has its own colored line, and the overall score has one too. Award markers sit on the quarters where awards were won.

**Letter grades.** Scores are computed unrounded, then rounded half up to a whole number (82.5 becomes 83) for display and grading. A measure that hasn't reached its goal is capped at 99 after rounding, so only meeting the goal earns an A+. The ranges are inclusive:

| Rounded score | Grade |
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
| 0–59 | F |

**The overall score:**
- **Overall** = the lowest of the four measures' rounded scores. It gets a letter grade from the same table.
- **Binding:** every measure whose score equals the overall score. Ties share the blame and are named together.
- **Close behind:** any other measure within 3 points of the overall score. It gets a warning.
- There's no bonus and no averaging. Certificates (see Awards) are honors and never change the score.

## Goals

- **Base goal:** the same quarter last year, plus a stretch (*tune*: 5%). Basing goals on the same quarter means the season never punishes the player.
- **Exactly:** goal = last + max(stretch × |last|, step).
  - The **step** is 1% of the measure's 2193 quarterly average. The 2193 values are in the M1 section below.
  - Taking the absolute value makes the goal an improvement even when last year was negative. The step keeps the goal above last year even when last year was zero.
- **A goal is always above last year.** Every goal, including Alma's stretches and recovery goals, is raised to at least last + step if it would otherwise fall below that.
- **Goals are announced at the start of each quarter, by the bosses.** The player always knows the target before deciding.
- **Alma's extra stretch:** each quarter, Alma picks one measure for its boss to stretch much harder (*tune*: +20 to 25%), with a reason from the story. "THE COUNCIL HAS READ A STUDY ABOUT FOOT TRAFFIC."
- **Recovery goals:** if a measure drops sharply, its next goal is to restore it. "HAPPINESS FELL 14%. RESTORE IT."
  - The goal is the quarter's normal goal or the level before the drop, whichever is higher. The always-above-last-year rule still applies.

## From a result to a score

Each measure is graded on progress from last year (the floor) toward the goal:

- **At or above the goal:** 100, an A+. A result strictly above the goal also earns the Exceeds Requirements award; the score stays capped at 100.
- **Between last year and the goal:** 70 + 30 × (result − last) ÷ (goal − last). Matching last year scores 70, a C−. The denominator is always positive, because every goal is above last year.
- **Below last year:** 70 − 250 × (last − result) ÷ scale, down to 0, where scale = max(|last|, the measure's 2193 quarterly average). That's 2.5 points for every 1% of scale (*tune*). Using the scale keeps the score finite when last year is zero, and stops a worsening loss from being rewarded when last year was negative.

**Edge cases.** These use Profit, whose 2193 quarterly average is $68,828, so its step is $688:

| Last year | Goal | Result | Score |
| --- | --- | --- | --- |
| $0 | $688 | $0 | 70 |
| $0 | $688 | $344 | 84.99 at the full-precision step ($688.28), shown as 85 (B) |
| −$100 | −$100 + max($5, $688) = $588 | −$103 | 70 − 250 × 3 ÷ 68,828 = 69.99, shown as 70 (C−) |
| −$100 | $588 | $600 | 100, plus Exceeds Requirements |
| $37,642 | $39,524 | $37,642 | 70 |
| $37,642 | $39,524 | $28,802 | 70 − 250 × 8,840 ÷ 68,828 = 37.9, shown as 38 (F) |

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

Awards are certificates: honors that never change the score. Awards appear as markers on the chart and as plaques on a shelf in the 3D shop.

| Award | Earned for | Presented by |
| --- | --- | --- |
| **Exceeds Requirements** | Any measure strictly above its goal (it still scores 100; meeting the goal exactly scores 100 without the certificate) | That measure's boss |
| **Well-Rounded Shop** | All four measures at 80 or above, so the overall score is 80 or above | The Station Administrator |
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

## M1's reduced report card (exact recipes)

M1 is one decision and one quarter, with no market and no Alma. **Proposal** (Plot), written so that it can be coded directly. The same recipe runs on Q1 2193 (last year) and on every simulated Q1 2194, so the goals are comparable.

**Visits and readers.** In M1, one visit is one distinct order ID. There is no browsing without buying until M2 generates customers. **Readers served** is the number of distinct orders in the quarter: 6,825 in Q1 2193.

**The plan: up to two levers** (decided by David). The player chooses 0 to 2 of three levers: `repick` (re-pick the Books of the Month), `events` (weekday author nights) and `sale` (station-wide sale). Choosing none is holding course. Without `repick`, the previous manager's scheduled picks run.

**How the levers combine.** They apply in this order: author nights, then Books of the Month, then the sale.
- The sale's 15% replaces every discount, including the picks'. Discounts don't stack.
- The sale clones every order, including author-night orders and Book of the Month extras.
- The picks' extra copies always apply, whichever titles are featured.

**How each lever creates orders** (this replaces the per-line wording given to Frank earlier; the totals don't change):
- **The replay calendar:** each 2194 day replays the 2193 day 364 days earlier, so it falls on the same weekday. If that day lands outside the month, it steps back another week. Daily noise drops or clones whole orders, scaling each day's count by a factor drawn from 0.97 to 1.03. Days with no 2193 sales replay as days with no sales.
- **Removing 2193's Book of the Month:** the table's extra copies (43, 55 and 58 for January to March) are removed at random from that pick's lines in that month. An order left empty disappears. The pick's remaining copies return to full price.
- **Book of the Month extra copies:** each extra copy is a new one-line order. Its day is drawn from that month's open days, weighted by each day's baseline orders, from the run's seed.
- **B, the station-wide sale:** each baseline order is cloned with probability 0.20, from the seed. Units, readers and the title mix all grow by about 20%. Every line is 15% off.
- **D, author nights:** each night's extra orders (30 to 70, from the seed) are clones of orders drawn at random from that same day's baseline orders. That keeps the night's mix and average order value realistic.

**Happiness.** Computed per order, then averaged over every order in the quarter. A quarter with no orders scores 50.
- **Quality:** Q = 100 × clamp((r − 3.0) ÷ 1.7, 0, 1), where r is the mean, over the order's lines, of each line's title average rating (from every rating of that title).
- **Value:** V = 50 + 50 × (1 − e^(−d ÷ 0.075)), where d is the mean discount over the order's lines. Full price gives 50; 15% off gives 93. The curve gives diminishing returns within an order. Diminishing returns across quarters ("a permanent sale stops registering") start in M2.
- **Order happiness:** 0.6 × Q + 0.4 × V, plus 20 for an author-night order, capped at 100. The +20 applies to every order with the author-night kind, including the sale's clones of them. Readers at an author night enjoy the night out. Comfort and Found it join in M2.

**Culture.**
- **Title value:** v = 1 + 9 × clamp((r − 3.0) ÷ 1.7, 0, 1) + 3 × (number of awards for the title). Here r is the title's average rating, and awards join on the exact title. Values run from 1.0 (*Soft, Pliable Truth*) to 15.8 (*The Mallemaroking*).
- **Daily title culture:** the sum of v over the distinct titles sold that day. Titles are de-duplicated across editions, so each title counts once a day however many copies or formats sold.
- **Genre spread:** the number of distinct genres sold that day, divided by 8.
- **Events:** each author night adds 1.2 × its extra orders, as drawn for that night (30 to 70). This assumes each extra order is one attendee who bought a book. If the sale clones author-night orders, the clones do **not** count toward Culture: attendance is the night's own draw. (They do get Happiness's +20, because those buyers were at the night too.)
- **Library ties:** 0 in M1.
- **Quarter Culture:** the sum over days of (daily title culture × genre spread), plus Events. Events are not multiplied by genre spread.

**Profit:** revenue − 60% of list on every unit sold − event costs ($200 per night).

**2193 values, from `src/bookshop/data.json`, to check implementations against:**

| Measure | Q1 | Q2 | Q3 | Q4 | Quarterly average | Step (1%) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Profit | $37,642 | $65,119 | $108,709 | $63,843 | $68,828 | $688 |
| Readers served | 6,825 | 11,714 | 19,534 | 11,441 | 12,379 | 124 |
| Happiness | 65.07 | 64.92 | 64.67 | 64.68 | 64.84 | 0.65 |
| Culture | 17,368 | 22,331 | 27,326 | 21,590 | 22,154 | 222 |

**M1 goals** (Q1 2193 plus 5%, for every plan; no extra stretch, because Alma isn't in M1):

| Measure | Goal |
| --- | ---: |
| Profit | $39,524 |
| Readers served | 7,166 |
| Happiness | 68.32 |
| Culture | 18,236 |

**Calibration (seeds 1 to 20, Sim's engine with these rules).** Overall score range, then median, then the measure that usually binds:

| Plan | Overall | Usually bound by |
| --- | --- | --- |
| None (hold course) | 67–70, median 67 (D) | Profit |
| Any plan with `sale` | 38–45 (F): the sale alone 38–42, with re-pick up to 45, with author nights up to 44 | Profit |
| `repick` | 71–76, median 72 (C−) | Happiness or Readers served |
| `events` | 69–89, median 72 (C−) | Profit |
| `repick` + `events` | 85–91, median 87 (B+) | Happiness |

Combining both data findings (the Book of the Month pattern and the weekday slump) beats either alone. Each alone beats holding course, and the sale fails however it's combined. David asked for exactly this: "making it possible, reasonable for M1 plan grades to be much higher, better".
