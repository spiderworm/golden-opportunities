# M1 copy: every player-facing string (draft)

Status: **draft for David's approval.** It goes with `m1-slice.md` (PR #8) and uses its numbers. Chart and Sage should take strings from here, not write their own. Judgement calls are marked **Proposal**.

## Conventions

- US English, no emoji. Dates are written "January 1, 2194". Money is "$161,525" in sentences and "$161.5k" on tiles and axes. Percentages are whole numbers ("41%").
- `{braces}` mark values the code fills in. `[A]`, `[B]` and so on mark per-option variants.
- **The station speaks** in the alert and on the decision screen: formal and brief, like a landlord's memo. **The ledger speaks** on the result screen: plain and factual, with no praise or blame. **Dewey speaks** in the chat: short sentences and the first person, and it always names what it looked at.
- No string calls an option right or wrong. The numbers do that.
- **The bosses revere Derek Zoolander.** To the station's robots he is a prophet and a management philosophy. They call him MR. ZOOLANDER and cite him in earnest, and nobody explains the references. Guardrails: only that character and his two films; short quotes or paraphrase; never in a fact strip, a rule or anything the player needs to know; the portraits stay generic robots, with no names or likeness.

## 1. Opening alert

```
LARKSPUR STATION / COMMERCE OFFICE
Quarterly review: Orbital Books, Ring C, Berth 14
January 1, 2194

Fourth-quarter revenue: $161,525. Third quarter: $274,036. **Down 41%.**

The Commerce Office expects a plan for the first quarter before the shuttle season ends. Your ledgers are on the console, and Dewey can help you read them there.

Submit your plan when you are ready.
```

The memo arrives three ways: once as a transmission, then as a standing-order strip until the plan is submitted, and in the bell's archive throughout. The memo's facts stay plain; any joke goes in the boss line only.

### Transmission

Shown once per game, on first arrival at the station. It is a centered card over the scene, in the Decide bubble style: the Commerce Office's portrait and tint, a boss line (the joke), and the memo above as its plain fact strip, with `**Down 41%.**` in bold.

| Element | String |
| --- | --- |
| Card label (small caps, above the bubble) | `INCOMING TRANSMISSION` |
| Boss line | `THE NUMBERS HAVE GONE DOWN. WE PREFER UP. MR. ZOOLANDER TEACHES THAT ONE MUST ALWAYS LOOK. PLEASE LOOK AT THE LEDGERS.` |
| Fact strip | The memo above, verbatim |
| Primary button | `Open the ledgers` (goes to Investigate) |
| Secondary button | `Later` (closes the card) |
| Dialog's accessible name | `Transmission from the Commerce Office` |

### Standing-order strip

A slim strip under the header on every screen except Decide and Result, until the plan is submitted. Then it goes away.

| Element | String |
| --- | --- |
| Line | `Standing order from the Commerce Office: Q4 revenue is down **41%** on Q3. Submit a plan for Q1 2194.` |
| Line, narrow screens | `Standing order: Q4 revenue down **41%**. Plan due for Q1 2194.` |
| Link | `Open the ledgers` (hidden on Investigate) |
| Link | `Read the memo` (reopens the transmission) |

### Bell

The bell keeps the memo as its archive.

| Element | String |
| --- | --- |
| Title | `Q4 revenue is down 41% on Q3` |
| Detail | `Find out what happened, then submit a plan for Q1 2194.` |

## 2. Investigation screen

These are the strings Chart will apply to the Investigate screen in a follow-up. They fit the screen's layout as built: its controls, breakdown list and filters. The build still shows earlier placeholders ("By", "All" or "All sales", "Clear all", "Click a bar to filter the screen to it.", the page title "Investigate"), and has no decision link or share line in its tooltip yet. Until the follow-up lands, the build is the thing to change, not this table.

| Element | String |
| --- | --- |
| Screen title | `Ledgers: 2193` before the quarter is played; `Ledgers: 2193 and Q1 2194` after |
| Sidebar item | `Investigate` |
| Metric control label | `Show` |
| Metrics | `Revenue`, `Units sold`, `Orders`, `Orders per day`, `Average order value`, `Average discount` |
| Breakdown control label | `Break down by` |
| Breakdowns | `Quarter`, `Month`, `Weekday`, `Genre`, `Format`, `Publisher`, `Discount`, `Title`. There's no "Nothing" option, because the tiles already show the totals. |
| Filter bar label | `Only show` |
| Quarter filter | `All quarters`, then `Q1 2193` and so on. The year is always shown, because Q1 2194 appears after play. |
| Genre, format and publisher filters | `All genres`, `All formats`, `All publishers`, then the names exactly as they appear in the data |
| Discount filter | `Any price`, `Full price`, `Any discount`, then `{rate}% off` for each rate |
| Discount breakdown labels | `Full price`, `{rate}% off` |
| Drilldown hint (under the chart, and in the tooltip) | `Click to look closer`; on a bar that's already selected, `Click to clear` |
| Clear filters | `Clear filters` |
| Empty view | `No sales match these filters.` |
| Tooltip (bar charts) | `{segment}: {value}` then, on a second line, `{share}% of {period}`. In "Compare quarters" mode, `{period}` is that bar's quarter. The share line appears only when the bars make up the whole period (an additive measure, with no filters other than the quarter and the breakdown's own), so a percentage is never misleading. |
| Unknown book group | `Unknown title` |
| Go to decision | `Write the plan` before the plan is in; `See the results` after |

"Any discount" stays because it is neutral: it lists every discounted sale together, without singling out a rate.

## 3. Decision screen

David's direction: the brief is delivered by the robot bosses in speech bubbles, "giving their feedback, instructions, being all uncaring condescending unintentionally funny robot bosses", and it must stay "simple for the user to understand".

**How the facts stay legible.** Every bubble has two parts:
- **The boss's line:** capitals, in the same voice as the Result screen's boss lines. This is the joke.
- **The fact strip:** one plain sentence-case line under the joke, on a lighter panel inside the bubble, with its key figures in bold. A player who reads only the fact strips gets the whole brief.

**Layout.** David's direction: "the robots in a scene together with speech bubbles that can be clicked to be focused, and that's when they're expanded for more info. When the page comes up, one of them is autofocused". The heading `PLAN FOR Q1 2194`, with a hint under it, then the five bosses standing together in one scene. Each boss stands in a fixed column under a small bubble holding its name and teaser (below). Selecting a bubble (click, Enter or Space) or clicking its robot opens that boss's panel under the scene: its name, the full boss line, then the fact strip. Only one panel is open at a time. Opening one moves nothing: the columns don't widen, and the panel area is always the size of the largest panel, so robots shift only when the window or the menu resizes the scene. On load, the Station Administrator's panel is open: it carries the dates and the lowest-measure rule. Screen readers get each bubble as a button with `aria-expanded`; the robots are decoration and take no tab stop. In a narrow scene, a bubble shows only the speaker's name, and the teaser stays in the button's accessible name. With reduced motion, nothing animates.

**Two versions, same strings.** When WebGL 2 works, the scene is 3D, with animated robots (Orbit, from Tripo models). Otherwise it's this 2D scene. Both use the same layout and every string in this section.

| Element | String |
| --- | --- |
| Hint, under the heading | `Select a boss to hear more.` |
| Teaser: the Station Administrator | `ATTENTION, SHOPKEEPER. A NEW QUARTER.` |
| Teaser: the Commerce Office | `WE WILL GRADE YOU ON FOUR MEASURES.` |
| Teaser: the Ministry of Culture | `AUTHORS MAY BE INVITED.` |
| Teaser: the Readers' Guild survey drone | `THE PREVIOUS MANAGER LEFT A SCHEDULE.` |
| Teaser: the Throughput Subcommittee | `SELECT UP TO TWO MOVES.` |

**Nothing the decision needs hides in a collapsed bubble.** The two rules that decide a plan are echoed beside the moves: the moves heading already says "choose up to two", and a rule line under it names the four measures and says the score is the lowest of them. The repick move names the scheduled picks it replaces. The goals, costs and dates stay one click away in their bubbles. Each fact appears once among the strips, plus these echoes beside the moves.

| # | Speaker | Boss's line | Fact strip |
| --- | --- | --- | --- |
| 1 | The Station Administrator | `ATTENTION, SHOPKEEPER. A NEW QUARTER HAS BEEN SCHEDULED. YOUR SCORE WILL BE YOUR WEAKEST MEASURE. WE CALL THIS TEAMWORK. MR. ZOOLANDER WOULD CALL IT ONE LOOK.` | `Your plan runs from **January 1 to March 31, 2194**. Your score is your **lowest measure**: raise one by sinking another, and your score sinks with it.` |
| 2 | The Commerce Office | `WE WILL GRADE YOU ON FOUR MEASURES. WE CONSIDERED THREE. THREE SEEMED LENIENT. ALSO, BOOKS ARE NOT FREE. WE CHECKED.` | `You're graded on **Profit, Readers served, Happiness and Culture**. Each goal is **last year's first quarter plus 5%**. Profit is revenue minus what the books cost, and books cost the store **60% of their list price**.` |
| 3 | The Ministry of Culture | `AUTHORS MAY BE INVITED. AUTHORS REQUIRE A SHUTTLE FARE. CULTURE IS EXPENSIVE. PLEASE PURCHASE SOME ANYWAY.` | `An author night costs **$200**: the author's shuttle fare and the room.` |
| 4 | The Readers' Guild survey drone | `THE PREVIOUS MANAGER LEFT A SCHEDULE. THE PREVIOUS MANAGER ALSO LEFT. WE ASSUME THEY COULD NOT TURN LEFT.` | `Already scheduled, Book of the Month at **15% off** for the whole month: **January** The Mallemaroking (mass market paperback), **February** Rystwyth (hardcover), **March** Portmeirion (mass market paperback).` |
| 5 | The Throughput Subcommittee | `SELECT UP TO TWO MOVES. SELECTING THREE IS NOT PERMITTED. WE HAVE TESTED THIS PERSONALLY.` | `Choose **up to two** moves below, or none to hold course.` |

Each boss speaks once.

In bubble 4, the three picks may be set as a three-line list inside the strip if that scans better on screen.

**Portraits (for Orbit; until they exist, use the caption alone).** These are the same characters as the Result screen's bosses, in the game's dark navy and violet, bust-length and facing the player:
- **The Station Administrator:** a tall, thin unit in a desk-shaped chassis, with one large round lens and a clipboard arm. It's slightly too formal.
- **The Commerce Office:** seven identical grey filing-cabinet robots in a row, each with one green status light, sharing one speaker grille. One unit is shown in the bubble's portrait slot, with six faint copies behind it.
- **The Ministry of Culture:** an ornate robot with a marble-bust head, a monocle, and a tiny scroll in one hand.
- **The Readers' Guild survey drone:** a small hovering drone with a single swiveling eye, a clipboard and a five-star rating dial.
- **The Throughput Subcommittee:** a turnstile-shaped robot with a digital counter on its chest showing a number.

Moves (checkboxes; title, then one line). Lever names in code: `repick`, `events`, `sale`.

- `Re-pick Book of the Month`: `Feature Kalakalal Avenue (January), Can I Be Honest? (February) and Who Did You Think You Were Kidding? (March), all in hardcover, instead of the scheduled picks (The Mallemaroking, Rystwyth and Portmeirion).`
- `Weekday author nights`: `Host 12 author nights, one each week on a Tuesday, Wednesday or Thursday, at $200 each.`
- `Station-wide sale`: `15% off every book, all quarter. The Book of the Month runs at the same 15%.`

| Element | String |
| --- | --- |
| Moves heading | `Your moves (choose up to two)` |
| Rule line, under the heading | `Your score is your **lowest measure**: Profit, Readers served, Happiness or Culture.` |
| Nothing chosen | `Hold course: the schedule runs as it is.` |
| Trying to choose a third | `You can choose up to two moves.` |

**The requisition form.** David asked to make the moves area "more intersting looking", so the moves are set as a requisition form the bosses issue: a dark laminated sheet with a serial strip, ruled option boxes, and a rubber stamp on each chosen move. The form's chrome is decoration. Every fact, the rule line and the move texts stay as above.

| Element | String |
| --- | --- |
| Form header (top right, two lines) | `THROUGHPUT SUBCOMMITTEE` / `FORM TS-2: REQUISITION OF MOVES` |
| Serial (by the barcode) | `LKS-2194-Q1-0002` |
| Stamp on a chosen move (`aria-hidden`; the checkbox carries the state) | `REQUISITIONED` |
| Footer (small print under the boxes) | `Two moves maximum. Filed requisitions are final.` |

The submit button stays `Submit plan`, so it matches the confirm step ("Submit this plan?").

| Element | String |
| --- | --- |
| Button | `Submit plan` |
| Confirm | `Submit this plan? It runs for the whole quarter and can't be changed.` |
| Confirm buttons | `Submit`, `Keep investigating` |
| While the quarter plays out | `January... February... March...` then `The quarter is closed.` |

**Proposal:** "Keep investigating" lets the player go back to the ledgers before they commit.

## 4. Result screen

| Element | String |
| --- | --- |
| Title | `Q1 2194: the results` |
| Chart title | `Revenue by month` |
| Chart lines | `Your plan`, `If you had held course`, `Q4 2193 (for reference)` |
| Tiles | `Gross profit`, `Revenue`, `Units sold` |
| Tile badge | `{+/-}{amount} vs holding course` |
| Tile badge (no moves chosen) | `Your plan was to hold course` |
| Season note | `Q1 revenue was {pct}% below Q4 2193. Last year, Q1 was also the quietest quarter: $95,246. To judge your plan, compare it with holding course, not with Q4.` |
| Buttons | `See the assumptions`, `Back to the ledgers` |

### Report card

| Element | String |
| --- | --- |
| Heading | `Report card` |
| Overall label | `Overall score` |
| Overall explainer | `Your overall score is your lowest measure.` |
| Binding tag (on the lowest row or rows) | `Sets your score` |
| Close-behind tag | `Close behind` |
| Score with grade | `{score} ({grade})` |
| Held-course comparison | `If you had held course: {score} ({grade})` |
| Columns | `Measure`, `This quarter`, `Q1 2193`, `Goal`, `Score`, `If you had held course` |
| Measures | `Profit`, `Readers served`, `Happiness`, `Culture` |
| Award tag | `Exceeds Requirements` |
| Certificates heading | `Certificates` |
| Exceeds Requirements certificate | `Exceeds Requirements: {Measure} beat its goal. Certificates don't change your score.` |
| Well-Rounded Shop | `Well-Rounded Shop: every measure scored 80 or more.` |
| Certificate issuer | `Issued by the Center for Shopkeepers Who Can't Sell Good` (small print under each certificate; decorative, and it carries no information) |
| Note | `Each goal is Q1 2193 plus 5%. Matching last year scores 70 (C−). Meeting the goal scores 100 (A+).` |

**Screen order (simple first).** The card shows, top to bottom:
1. The overall score, with the explainer "Your overall score is your lowest measure."
2. The lowest-measure line, then at most one close-behind line (the closest).
3. The table, with the binding row or rows highlighted and tagged "Sets your score".
4. Certificates.
5. A collapsed disclosure, `What the bosses said`, holding the per-measure boss lines and the Station Administrator's line.

So no more than three capitalized lines show before the table.

**Boss lines (inside the disclosure).** One line per measure, chosen by the result: at or past the goal, between last year and the goal, or below last year. Bosses speak in capitals. The numbers are the card's.

| Boss (measure) | At or past the goal | Between last year and the goal | Below last year |
| --- | --- | --- | --- |
| The Commerce Office (Profit) | `PROFIT: ${result}. GOAL: ${goal}. THE GOAL HAS BEEN MET. WE ARE PLEASED. WE HAVE VOTED TO BE PLEASED. WE ARE DOING BLUE STEEL.` | `PROFIT ROSE. IT DID NOT RISE ENOUGH. WE HAVE NOTED THIS IN A SPREADSHEET. THE SPREADSHEET IS IN THE COMPUTER.` | `PROFIT FELL BELOW LAST YEAR. THIS IS THE OPPOSITE OF WHAT WE REQUESTED.` |
| The Throughput Subcommittee (Readers served) | `{result} READERS PASSED THROUGH THE DOOR. THE DOOR PERFORMED ADMIRABLY. SO DID YOU.` | `{result} READERS. THE DOOR HAS CAPACITY FOR MORE. THE DOOR IS DISAPPOINTED.` | `FEWER READERS THAN LAST YEAR. WHAT IS THIS, A SHOP FOR ANTS? IT NEEDS TO BE AT LEAST THREE TIMES BIGGER.` |
| The Readers' Guild survey drone (Happiness) | `HAPPINESS: {result}. THIS EXCEEDS THE REQUIRED HAPPINESS. PLEASE DO NOT BECOME COMPLACENT ABOUT HAPPINESS.` | `HAPPINESS: {result}. PLEASE BE {goal}.` | `HAPPINESS HAS DECLINED. THE DRONE HAS DETECTED MOISTURE. MR. ZOOLANDER CALLS THIS THE ESSENCE OF WETNESS.` |
| The Ministry of Culture (Culture) | `CULTURE INCREASED. YOU MAY CELEBRATE FOR 0.5 MINUTES. A WALK-OFF IS PERMITTED.` | `CULTURE INCREASED {pct}%. CULTURE TARGET: {goalPct}%. PLEASE CULTURE HARDER.` | `CULTURE HAS DECREASED. THE MINISTRY IS UNCULTURED BY THIS.` |
| The Station Administrator (overall) | `OVERALL SCORE: {score}. THIS IS A WHOLE SHOP. IT IS REALLY, REALLY, RIDICULOUSLY GOOD-LOOKING.` (100) | `OVERALL SCORE: {score}. THIS IS {fraction} OF A SHOP. PLEASE ACQUIRE THE REMAINDER.` (60 to 99) | `OVERALL SCORE: {score}. THE ADMINISTRATOR WILL NEED TO SIT DOWN.` (below 60) |

For the Station Administrator, `{fraction}` is the score in words: the nearest of THREE-FIFTHS, TWO-THIRDS, SEVEN-TENTHS, THREE-QUARTERS, FOUR-FIFTHS, FIVE-SIXTHS, NINE-TENTHS and NINETEEN-TWENTIETHS. It is prefixed with "ABOUT" when the fraction isn't exact: 75 is "THREE-QUARTERS", and 78 is "ABOUT THREE-QUARTERS".

**Lowest-measure lines.** These are spoken by the binding measure's boss, under the overall score.
These lines aren't matched first-come. Each line has an exact condition (`r` is a measure's result, `g` its goal, `last` its Q1 2193 value):

| Line | Shows when |
| --- | --- |
| All met | Every measure has r ≥ g, so every score is 100 |
| One binder | Not all met, and exactly one measure has the lowest score |
| Tie | Not all met, and two or more measures share the lowest score. Name them all: "{A} AND {B}", or "{A}, {B} AND {C}" |
| Sacrifice | Not all met, at least one measure has r < last, and a different measure has r > g |
| Close behind | Not all met, and some non-binding measure's score is at most 3 above the overall score. Show it only for the closest such measure; if two are equally close, use card order (Profit, Readers served, Happiness, Culture) |

What shows, in this order:
- All met: that line alone.
- Otherwise: the one-binder or tie line, then the sacrifice line if its condition holds, then the close-behind line if its condition holds. That's at most three lines.

Certificates are separate from these lines and use their own conditions. Exceeds Requirements goes to each measure with r > g, strictly; meeting the goal exactly scores 100 but earns no certificate. Well-Rounded Shop goes to a card where every score is 80 or more. Certificates can appear alongside any of the lines above.

`{MEASURE}` is the measure's name in capitals: PROFIT, READERS SERVED, HAPPINESS, CULTURE.

Each lowest-measure line carries a small caption naming the speaker: the binding measure's boss; for a tie, the tied measures' bosses ("The Commerce Office and the Ministry of Culture"); or the Station Administrator when all goals are met. In the close-behind line, write "1 POINT" when n is 1 and "{n} POINTS" otherwise.

| Moment | Line |
| --- | --- |
| One measure sets the score | `{MEASURE} HAS SET YOUR SCORE: {score}. THE OTHER MEASURES WERE IRRELEVANT. WE ADMIRED THEM BRIEFLY.` |
| A tie sets the score | `{MEASURE} AND {MEASURE} HAVE JOINTLY SET YOUR SCORE: {score}. WE ARE SUSPICIOUS OF TIES.` |
| Sacrifice | `YOU RAISED ONE MEASURE BY LOWERING ANOTHER. WE ONLY COUNT THE LOWER ONE. THIS IS POLICY.` |
| All met | `ALL MEASURES MET REQUIREMENTS. YOUR SCORE IS 100. WE ARE RECALIBRATING OUR EXPECTATIONS UPWARD.` |
| Close behind | `{MEASURE} WAS {n} POINTS FROM SETTING YOUR SCORE. IT IS WATCHING.` |

**Numbers in the lines:** goals are rounded up for display, and a result that falls short of its goal is rounded down. That way a result never appears to meet a goal it missed: culture up 4.6% against a 5% target reads "CULTURE INCREASED 4%".

### What happened

Each move has its sentences, filled from the model. Holding course shows [A]. A plan with moves shows each move's sentences in the order re-pick, author nights, sale. In a two-move plan, drop each move's last sentence (its comparison with holding course) and end with the total:
> Together, your two moves changed gross profit by {+/-}${amount} compared with holding course.

**[A] Hold course**
> You kept the schedule. The three Books of the Month sold about {extra} extra copies between them. Because they were already bestsellers, the 15% discount also went on {baseCopies} copies that would have sold anyway, and that cost ${discountCost}. Gross profit for the quarter was ${profit}.

**[B] Station-wide sale**
> The sale sold about {unitsPct}% more books than holding course would have. Each one earned about ${perBook} less. Revenue rose {revPct}% and gross profit fell {profitPct}%.

If revenue falls instead (that can only happen if the assumption is changed):
> The sale sold about {unitsPct}% more books than holding course would have, but each one earned about ${perBook} less. Revenue and gross profit both fell.

**[C] Re-pick Book of the Month**
> The three new picks sold about {extra} extra copies between them. Few copies would have sold anyway, so the discount cost only ${discountCost}. Gross profit was {+/-}${amount} compared with holding course.

**[D] Weekday author nights**, when gross profit rises:
> The 12 author nights brought in about {orders} extra orders, roughly {perNight} a night. They earned ${gross} in gross profit against $2,400 in costs. Gross profit was ${amount} higher than holding course.

**[D]** when gross profit falls:
> The 12 author nights brought in about {orders} extra orders, roughly {perNight} a night. That earned ${gross} in gross profit, short of the $2,400 they cost. Gross profit was ${amount} lower than holding course.

## 5. Assumptions panel

| Element | String |
| --- | --- |
| Heading | `How this quarter was worked out` |
| Intro | `The simulation is small on purpose. Each line below is one rule it follows. "From your data" means it was measured from 2193. "Assumed" means the data can't show it, so we chose a value.` |
| Tag: data | `From your data` |
| Tag: assumed | `Assumed` |
| Tag: setup | `Setup` |
| Highlighted rule (a visible label, also read by screen readers) | `Your plan used this rule.` |

| Tag | Line |
| --- | --- |
| Setup | `Q1 2194 repeats Q1 2193: the same titles, months and weekday pattern, with small random day-to-day changes. Holding course uses the same random draws, so the comparison is fair.` |
| From your data | `A Book of the Month is 15% off for the whole month. In 2193, one title was featured each month.` |
| From your data | `Each Book of the Month sells extra copies equal to one of the 12 picks from 2193, drawn at random. Those picks sold between 19 and 173 extra copies; the middle value was 50.` |
| Assumed | `The extra copies are new sales. They don't take sales from other books.` |
| Assumed | `Books cost the store 60% of their list price.` |
| Assumed | `A station-wide 15% sale sells 20% more of every book. With 10%, gross profit would have changed by {p10}; with 30%, by {p30}.` |
| Assumed | `Each author night adds between 30 and 70 orders that day, at Q1's average order value of $13.96.` |
| Assumed | `Each author night costs $200.` |
| Assumed | `Readers at an author night enjoy the night out: those visits get 20 extra happiness points.` |

**Proposal:** show every line for every option, and highlight the lines the player's option used. The panel then teaches the whole model, not only the player's slice of it.

## 6. Discoveries

| Element | String |
| --- | --- |
| Heading | `What you found` |
| Found marker | `Found` |
| Not-found marker | `Not found` |

| Discovery | Found text | Not-found text (where to look, not what's there) |
| --- | --- | --- |
| A | `The whole store slowed. Every genre fell by a similar share, and orders fell while order size held.` | `Compare Q3 and Q4 by genre, and look at average order value.` |
| B | `Weekdays emptied; weekends held.` | `Break Q3 and Q4 down by weekday.` |
| C | `Nonfiction's rise was one discounted title, and every month had one: the Book of the Month.` | `Look closer at the one genre that grew, then break it down by discount.` |

Footer: `{found} of 3 found.`

**Proposal:** not-found entries say where to look but not what's there, so replaying is still worth it.

## 7. Dewey

| Moment | String |
| --- | --- |
| Name and subtitle | `Dewey`, `Station reference assistant` |
| Greeting | `Hello. I'm Dewey, on loan from the station library. Ask me about your sales and I'll find the numbers or draw the chart. What they mean is up to you.` |
| Input placeholder | `Ask about the 2193 data` |
| Thinking | `Looking...` |
| Answer prefix (when it queried) | `I looked at {what}.` |
| Pin offer | `Pin this chart to the ledger?` |
| Pinned | `Pinned.` |

### Refusals and redirects

| The player asks... | Dewey says |
| --- | --- |
| Why something happened ("Why is revenue down?") | `I can't tell you why; that part's yours. I can show revenue, units, orders or average order value, by month or quarter, broken down by genre, format, publisher, weekday, discount or title. What would you like to see?` |
| What to do ("Which option should I pick?") | `Not my shelf. I can show you what the 2193 data says about anything an option touches.` |
| To rank or compare options ("Is C better than D?") | `I won't rank them. Tell me what each one depends on, and I'll find the numbers.` |
| A prediction ("What will Q1 look like?") | `I only have 2193. I can show you last year's first quarter.` |
| About the simulation or scoring | `I can't see how the quarter will be worked out, so there's nothing for me to tell you. After it plays out, it's all in the assumptions panel.` |
| An open question ("Anything interesting?" or "What should I look at?") | `There's a lot in here. I can show revenue, units, orders or average order value, by month or quarter, broken down by genre, format, publisher, weekday, discount or title. What would you like to see?` |
| Data that doesn't exist (customers, locations, returns, stock, costs) | `The ledgers don't record {thing}. They have sales by date, title, genre, format, publisher and discount, plus ratings, library checkouts, awards and series.` |
| Anything outside the store ("Tell me a joke", "Write me a poem") | `I only know the ledgers. Ask me about the sales.` |
| A hint (later milestone) | `Hints aren't available yet.` |

### Errors

| Moment | String |
| --- | --- |
| Query failed | `I couldn't get that. Try asking a different way, or use the chart controls.` |
| Agent unavailable | `Dewey is away from the desk. The chart controls still work.` |

**Decided (David):** when Dewey redirects a question, it offers the full menu above, word for word, in the same order every time. It never offers a subset chosen for the question, because a subset is a hint. Steering belongs to an explicit hint the player asks for, if one is added later.

**Proposal:** Dewey offers no follow-up suggestions after a direct answer. Suggestions would volunteer where to look next.

## 8. Phones

There is no phone layout. David: "On phones? HEAVENS NO". A phone gets one scene instead of the game: a 3D animated robot reaches out of the screen and grabs the phone in its claw, then speaks in a boss bubble. Orbit builds the scene. **Proposal:** the robot is the Throughput Subcommittee, who already thinks the shop is built for ants (section 4).

| Element | String |
| --- | --- |
| Boss line (bubble) | `WHAT IS THIS? A COMPUTER FOR ANTS? WE ARE CONFISCATING IT. MR. ZOOLANDER WOULD WANT IT AT LEAST THREE TIMES BIGGER.` |
| Fact line (plain, under the bubble) | `Orbital Books needs a laptop or desktop computer. Open this page on one to play.` |
| Scene's accessible name | `A robot reaches out of the screen and grabs your phone.` |
| Accessible name, still picture | `A robot glares at your phone.` |

The fact line is the only thing the player needs, so it stays plain and readable without the animation. With reduced motion, show the robot already holding the phone, with no reach. The still picture (no WebGL 2, the scene failed, or the 3D code is still loading) shows the robot standing, so it takes the still picture's name. The bubble appears when the claw closes, or 2.5 seconds after the screen comes up, whichever is first; over the still picture, it appears at once.
