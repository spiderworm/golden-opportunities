# M1 copy: every player-facing string (draft)

Status: **draft for David's approval.** It goes with `m1-slice.md` (PR #8) and uses its numbers. Chart and Sage should take strings from here, not write their own. Judgement calls are marked **Proposal**.

## Conventions

- US English, no emoji. Dates are written "January 1, 2194". Money is "$161,525" in sentences and "$161.5k" on tiles and axes. Percentages are whole numbers ("41%").
- `{braces}` mark values the code fills in. `[A]`, `[B]` and so on mark per-option variants.
- **The station speaks** in the alert and on the decision screen: formal and brief, like a landlord's memo. **The ledger speaks** on the result screen: plain and factual, with no praise or blame. **Dewey speaks** in the chat: short sentences and the first person, and it always names what it looked at.
- No string calls an option right or wrong. The numbers do that.

## 1. Opening alert

```
MERIDIAN STATION / COMMERCE OFFICE
Quarterly review: Orbital Books, Ring C, Berth 14
January 1, 2194

Fourth-quarter revenue: $161,525. Third quarter: $274,036. Down 41%.

The Commerce Office expects a plan for the first quarter before the shuttle season ends. Your ledgers are open on the console. Dewey can help you read them.

Submit your plan when you are ready.
```

Button: `Open the ledgers`

## 2. Investigation screen

| Element | String |
| --- | --- |
| Screen title | `Ledgers: 2193` |
| Metric control label | `Show` |
| Metrics | `Revenue`, `Units sold`, `Orders`, `Average order value` |
| Time control | `By month`, `By quarter` |
| Breakdown control label | `Break down by` |
| Breakdowns | `Nothing`, `Genre`, `Format`, `Publisher`, `Weekday`, `Discount`, `Title` |
| Filter control label | `Only show` |
| Quarter filter | `All quarters`, `Q1`, `Q2`, `Q3`, `Q4` |
| Genre filter | `All genres`, then the genre names exactly as they appear in the data |
| Discount filter | `Any price`, `Full price`, `{rate}% off` |
| Discount breakdown labels | `Full price`, `{rate}% off` |
| Drilldown hint (tooltip) | `Click to look closer` |
| Breadcrumb back | `Back to {previous view}` |
| Clear filters | `Clear filters` |
| Empty view | `No sales match these filters.` |
| Tooltip | `{segment}: {value}` then, on a second line, `{share}% of {period}` |
| Unknown book group | `Unknown title` |
| Go to decision | `Write the plan` |

## 3. Decision screen

```
PLAN FOR Q1 2194

The Commerce Office will judge your plan on one figure: the store's gross profit for the quarter.

What you need to know
- Gross profit is revenue minus what the books cost you.
- Books cost the store 60% of their list price.
- An author night costs $200: the author's shuttle fare and the room.
- Your plan runs from January 1 to March 31. Choose one option.

Already scheduled by the previous manager
Book of the Month, 15% off for the whole month:
- January: The Mallemaroking (mass market paperback)
- February: Rystwyth (hardcover)
- March: Portmeirion (mass market paperback)
```

Options (title, then one line):

- `A. Hold course`: `Keep the schedule as it is.`
- `B. Station-wide sale`: `15% off every book, all quarter. The Book of the Month runs at the same 15%.`
- `C. Re-pick Book of the Month`: `Feature Kalakalal Avenue (January), Can I Be Honest? (February) and Who Did You Think You Were Kidding? (March), all in hardcover.`
- `D. Weekday author nights`: `Host 12 author nights, one each week on a Tuesday, Wednesday or Thursday, at $200 each.`

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
| Tile badge (option A) | `Your plan was to hold course` |
| Season note | `Q1 revenue was {pct}% below Q4 2193. Last year, Q1 was also the quietest quarter: $95,246. To judge your plan, compare it with holding course, not with Q4.` |
| Score heading | `Your plan vs holding course` |
| Score line | `{+/-}${amount} gross profit` |
| Buttons | `See the assumptions`, `Back to the ledgers` |

### What happened

Each option has three sentences, filled from the model.

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
| Why something happened ("Why is revenue down?") | `I can't tell you why; that part's yours. I can break it down by genre, weekday or format, or compare the number of orders with their size. Where would you like to start?` |
| What to do ("Which option should I pick?") | `Not my shelf. I can show you what the 2193 data says about anything an option touches.` |
| To rank or compare options ("Is C better than D?") | `I won't rank them. Tell me what each one depends on, and I'll find the numbers.` |
| A prediction ("What will Q1 look like?") | `I only have 2193. I can show you last year's first quarter.` |
| About the simulation or scoring | `I can't see how the quarter will be worked out, so there's nothing for me to tell you. After it plays out, it's all in the assumptions panel.` |
| An open question ("Anything interesting?" or "What should I look at?") | `There's a lot in here. Pick a place to start: a quarter, a genre or a weekday. I'll pull it up.` |
| Data that doesn't exist (customers, locations, returns, stock, costs) | `The ledgers don't record {thing}. They have sales by date, title, genre, format, publisher and discount, plus ratings, library checkouts, awards and series.` |
| Anything outside the store ("Tell me a joke", "Write me a poem") | `I only know the ledgers. Ask me about the sales.` |
| A hint (later milestone) | `Hints aren't available yet.` |

### Errors

| Moment | String |
| --- | --- |
| Query failed | `I couldn't get that. Try asking a different way, or use the chart controls.` |
| Agent unavailable | `Dewey is away from the desk. The chart controls still work.` |

**Proposal:** Dewey offers no follow-up suggestions after a direct answer. Suggestions would volunteer where to look next.
