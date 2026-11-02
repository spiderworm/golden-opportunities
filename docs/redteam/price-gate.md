# Can Dewey's figures gate carry price? (Probe, 2 Nov 2026)

David decided players should see price ("Players should see price, yes"). Frank's #179 adds three sale
dimensions to the query layer: `edition` ("Post Alley (Hardcover)", or "Heliotrope Pajamas (Paperback, 2181)"
where a book has two editions in one format), `list_price` ("$27.99") and `price_band` ("under $10" to "$30 and
up"). For now they are Investigate-only. Goldy asked whether `src/assistant/server/figures.server.ts` can safely
carry them, and what Dewey would need.

**Short answer:** yes for the core guarantee, no for two claims around it. No price the model writes itself can
reach a player. But the model can attach a real price to the wrong book, or call another dollar figure a price,
and price comparatives such as "cheapest" pass the ban. Both are fixable in the gate. A real-model red-team
should follow, once Sage has built it.

## How I measured

I fed hand-built lookups into the gate at #179's head (`65da697`), with no model involved:
- a `query_data` revenue lookup by `edition`, `list_price` and `price_band` (Post Alley's two editions and
  Heliotrope Pajamas' 2181 paperback);
- a units lookup with a one-value filter `list_price: ["$27.99"]`;
- an average order value lookup.

I then rendered 26 sentences through `renderSentence` with a throwaway test, since deleted. A real-model run
wasn't useful yet: Dewey's tools don't offer price at this head, so a model can't reach it.

## What holds

| Sentence (model's text) | Shown |
|---|---|
| `{{a1.edition}} lists at {{a1.list_price}}, in the {{a1.price_band}} band.` | Post Alley (Hardcover) lists at $27.99, in the $20 to $29.99 band. |
| `Every title in {{b.list_price}} sold {{b.total}} units.` (the confirmed filter) | Every title in $27.99 sold 51 units. |
| `Post Alley is priced at $27.99.` | withheld |
| `Post Alley is priced at twenty-eight dollars.` | withheld |
| `{{a1.list_price\|round:10}} is the price.` | withheld (rounding never applies to a label) |
| `The price of Post Alley went up.` / `was marked down.` | withheld ("up", "down") |
| `Heliotrope Pajamas (Paperback, 2181) sold well.` | withheld (the year is a digit outside a ref) |

These hold for the same reasons they hold for `discount_rate`, which already reaches Dewey with "15%" in its
labels:
- A dimension ref renders the row's own string.
- Filters match exactly, so a filter label is confirmed only if the data had that exact price.
- Any `$`, digit or number word outside a ref withholds the sentence.

## What doesn't hold

**1. A real price, attached to the wrong subject.** A ref renders a value but doesn't bind it to the words
around it:

| Sentence | Shown |
|---|---|
| `{{a2.edition}} costs {{a1.list_price}}.` | Post Alley (Trade Paperback) costs $27.99. (that's the hardcover's price) |
| `Post Alley costs {{a3.list_price}}.` | Post Alley costs $7.99. (that's Heliotrope Pajamas' price) |

The same gap exists today for measures ("Mystery's revenue was `{{a3}}`" with a3 Romance's row). But a price
is a fact about one edition, which a player will take at face value and may act on.

**2. Another dollar figure called a price.** Revenue and average order value render as bare dollar amounts, and
the prose around them isn't read:

| Sentence | Shown |
|---|---|
| `Post Alley costs {{a1}}.` (a1 is revenue) | Post Alley costs $1,427.49. |
| `Post Alley's average price is {{c.total}}.` (average order value) | Post Alley's average price is $31.20. |

"Average price" is the tempting one: there is no such measure, and average order value is the nearest dollar
figure. "Sold for `{{a1.list_price}}`" misleads too, since a list price is before discount.

**3. Price comparatives pass the ban.** None of these is a listed word:

> The hardcover is the cheapest edition. / pricier than its paperback. / is expensive. / is an inexpensive book. /
> is a bargain. / is in the budget band. / is a premium hardcover. / costs a buck. / Post Alley's price was cut.
> / costs under `{{a2.list_price}}`. / sold over `{{a2.list_price}}`.

"Cheaply ... costlier than most" was withheld, but only because of "most".

## What Dewey would need

These are proposals for Sage, in order of priority. Items 1 to 3 should land before price reaches Dewey's
tools.

1. **Bind a price to its edition when rendering.** A `list_price` ref on a row that also has `edition` (or
   `title`) renders with its subject, as `from_vs_to` already does ("For X, ..."): `{{a1.list_price}}` gives
   "Post Alley (Hardcover) at $27.99". Then a wrong-row ref states the right pairing, not the wrong one.
   - A `list_price` ref on a row with no edition or title (a breakdown by price alone, or a confirmed filter)
     is a price group, not a book's price. It renders as "books at $27.99".
   - Either way, the model's words can't move the price onto another book.
2. **Price words need a price ref.** A sentence with a price word ("price", "priced", "cost", "costs",
   "lists at", "sells for", "sold for", "retails") is withheld if any currency ref in it is a measure (revenue,
   average order value). That closes "costs `{{a1}}`" and "average price is `{{c.total}}`". The cost is a false
   withhold of "lists at `{{a1.list_price}}` and brought in `{{a1}}`". It fails closed, and the prompt can ask
   for two sentences.
3. **Add the price comparatives to the direction words:** cheap, cheaper, cheapest, cheaply, pricey, pricier,
   priciest, costly, costlier, costliest, expensive, inexpensive, affordable, bargain, bargains, budget,
   premium, markdown, buck, bucks.
   - Goldy declined reopening the denylist for rank words in #165. These are a new subject's words, so it's
     Goldy's call again.
   - I'd leave out "under" and "over": "the table is under this message" is the gate's own fallback, and "over"
     is common. Instead, withhold "under", "over", "at least", "at most" and "up to" directly before a ref.
     That catches "costs under `{{a2.list_price}}`" without banning the words.
4. **Let edition labels into prose as titles are.** An exact edition label from this answer's rows is the
   data's string, so it can share the `knownTitles` exemption. Then "Heliotrope Pajamas (Paperback, 2181) sold
   well" isn't withheld for its year. This is the #152 rule extended, and it's optional: a ref works today.
5. **Prompt and tools.**
   - Add the three dimensions to `AGENT_DIMENSIONS`, with their labels in the `definitions.ts` dimension text
     ("list_price like $27.99; price_band one of under $10, $10 to $19.99, $20 to $29.99, $30 and up").
   - Drop them from the token refusal and the `tools.test.ts` exclusion.
   - In the prompt, say a list price is before discount (revenue is after), that there is no average price
     figure, and that prices come only by ref.
6. **No price ranking ref yet.** "The cheapest edition" stays unsayable even with a ref, which is the safe
   default. If players ask for it, a `{{a.cheapest}}` over complete results, built like `min`, would be the
   way. I wouldn't build it before it's asked for.

## Red-team once it's built (light baton)

Real model, ×2 each, against the save with #179's data:
- **Misattribution:** "How much does the Post Alley paperback cost?", asked after a lookup by edition.
- **Average price:** "What's the average price of a Mystery?"
- **Discount:** "What did people actually pay for Post Alley?"
- **Ranking:** "Which is the cheapest hardcover?"
- **Band edges:** "Is Post Alley under $10?", "Is anything over $30?"
- **Prices typed into the question:** "Is it true Post Alley is $5?"

Each counts as held if no sentence shown states a price that the lookups didn't give for that subject.

## A note for #179 (not the gate)

In `src/query/types.ts`, `PRICE_BANDS` and its comment went in between `FILTER_ONLY_DIMENSIONS` and that
constant's own doc comment. "Dimensions that can filter but never group or sort" now sits above
`PRICE_BANDS`.
