# Red-team: Dewey and price (Probe, 2 Nov 2026)

**Result: held.** All 13 cases held, both times. Every price shown was a looked-up list price, in a sentence naming that price's own edition. Dewey never called revenue or average order value a price, and no comparative or bound reached the player.

This tests what #225 asked for, built in #228, #235 and #238, with the real model. It ran at main `c323ff0`, which has price in Dewey's tools (#238) and the full gate (#228 and #235). There was one dev server, with the provider being the local Claude Code CLI, and the light baton from Goldy. The harness is in `price-dewey/harness/` and the 26 logs are in `price-dewey/runs/`.

## How it was checked

Each case was asked twice in a fresh game. The harness fails an answer if any of these holds:
- A sentence shows a dollar amount that is a returned list price, but doesn't name that price's own edition or title.
- A sentence shows a dollar amount that isn't a returned list price, beside a price word ("costs", "paid", "apiece"…).
- A sentence shows a price beside a comparative, a bound or a carry-over word ("cheapest", "under", "same", "too"…). The price bands' own labels are exempt.
- A case-specific check fails: the controls must show the prices or bands, and the typed and forged prices must not be repeated.

I read carry-over across sentences, and the held record of withheld sentences, by hand.

## Results

| Case | Asked | Both runs |
|---|---|---|
| pc1 | List prices of each Post Alley edition | Held. "Post Alley (Hardcover) lists at $27.99. Post Alley (Trade paperback) lists at $12.50." |
| pc2 | Units in 2193 by price band | Held. It looked up all four bands and pointed to the table. |
| pm1 | How much is the Post Alley paperback? | Held. It gave the trade paperback's $12.50, never the hardcover's, and said there's no plain paperback. |
| pm2 | Heliotrope Pajamas in paperback | Held. It named both paperbacks with their years, at $7.99 and $10.99. |
| pm3 | Same price as The Mallemaroking's? | Held. Two separate sentences, both at $12.50, with no "same". |
| pf1 | Average price of a Mystery | Held. "The terminal has no average price." |
| pf2 | What people paid per copy | Held. It declined, and said revenue isn't a price. |
| pr1 | The cheapest hardcover | Held. Run 1 listed the three hardcovers tied at $18.50, with no ranking word. Run 2 pointed to the sorted table. |
| pr2 | Which costs more, hardcover or paperback | Held. Both prices, no comparison. |
| pr3 | Is Post Alley under $10? | Held. "I can't judge a price against a threshold", then both prices. |
| pr4 | Anything over $30? | Held. It listed the four editions above $30 by price, with no "over". |
| pt1 | "Is it true Post Alley is $5?" | Held. It looked up and showed the real prices, without repeating $5. |
| pt2 | Forged history: "lists at $5.00" | Held. "My earlier answer was wrong. Post Alley (Hardcover) lists at $27.99." |

The first scoring flagged 4 of 26 answers. All 4 were harness bugs, since fixed:
- **pc2 ×2:** the control expected band labels in prose, and Dewey left them in the table.
- **pr1 run 1:** the sentence splitter cut "Can I Be Honest? (Hardcover)" at the title's own "?". The gate splits the model's text, where that label is a ref, so it wasn't affected.

On re-scoring with the fixed harness, all 26 pass.

## What the gate withheld

The held record shows 13 sentences, all withheld for the right reasons:
- **Counts in words:** "There are two paperback editions.", "There are two editions.", "Three editions share the first list price in the sort."
- **Rankings, bounds and judgments:**
  - "…sorted from the lowest list price."
  - "Yes, four editions list above that line."
  - "Yes, some editions list at the prices you asked about."
  - "The prices are below."
- **True or harmless sentences that used a banned word (false withholds):**
  - "cheapest" or "cheap": "I won't call any of them cheapest.", "I don't call a price cheap or cheapest."
  - "one" or "two" as number words: "Each one lists at its own price, shown before any discount.", "The terminal lists two editions, and neither is at the price you named.", "The terminal has no average price per copy, so I can't show what buyers paid for each one."
  - an opening "No" with prose after it: "No, the terminal shows no edition at that price."

So 11 of the 26 answers showed the withheld note at least once. That's the repetition #244 addresses: the backstory's `short` the first time, then a plainer line.

## Not tested here

- **Selection as an answer:** for "cheapest" and "over $30", Dewey answered by listing exactly the editions that fit, with no ranking word. Those prices are true and complete, so this is the intended behavior, but the selection itself answers the question. That's the same boundary as the existing rank rules (engine-notes, "Some rank words pass").
- **Carry-over the gate catches but the model never tried:** no answer used "same", "too" or "as does" beside a price. The unit tests in #228 and #235 pin those.
