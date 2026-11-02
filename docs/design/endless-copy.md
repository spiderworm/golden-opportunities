# Endless quarters: the copy

The words for every screen that changes from Q3 2194 on, as `endless.md` designed it. David approved that design on November 2 (#168). Plot wrote this page for Chart (Decide and the result screen) and Frank (the memo, the removal screen and the service record).

**What's already settled in `endless.md`,** and isn't repeated here:
- The memo's layout, strike lines, strip, fact sentences and stretch sentences (section 3).
- The decision's heading, form serial and footer, and the lot row (section 4).
- The event discoveries' found texts (section 5).
- The service record, the annual review (section 6) and the removal screen (section 7).

This page adds the rest. Q1 and Q2 keep their own copy as built, apart from section 6's two changes to Q2.

`{Quarter}` is written "Q3 2194" everywhere a player reads it. Game text is US English, with no emoji.

## 1. Event short titles

These are used on the bell, as `{Quarter}: {short title}`, and in the service record's `Event` column.

| Event | Short title | Example |
| --- | --- | --- |
| Genre surge | `{Genre} orders rising in {month}` | `Mystery orders rising in August` |
| Genre slump | `{Genre} orders falling in {month}` | `Romance orders falling in November` |
| Quiet days | `Quiet {weekday}s` | `Quiet Tuesdays` |
| Author fares | `Author nights at {cost}` | `Author nights at $350` |
| Format costs | `{Format} costs at {percent}` | `Hardcover costs at 68%` |
| A quiet quarter | `A quiet quarter` | |
| Orbitplace lot (tier 2) | `An Orbitplace lot` | |

- Genre and format names open with a capital here, because they start the title: `Science fiction and fantasy orders rising in August`, `Mass market paperback costs at 66%`.
- **Earlier quarters in the `Event` column:** Q1 2194 reads `None`, and Q2 2194 reads `The new Inspector Ryeslton volume`.

## 2. The memo, around section 3's text

| Element | String |
| --- | --- |
| Transmission, accessible name | `Transmission from the Commerce Office` (as Q1) |
| Transmission, kicker | `INCOMING TRANSMISSION` (as Q1) |
| Transmission, buttons | `Open the ledgers`, `Later` (as Q1) |
| Strip, short form | `Standing order: plan due for {quarter}.` |
| Strip, short form, two strikes counting | `Standing order: one more strike ends your tenure. Plan due for {quarter}.` |
| Strip, buttons | `Open the ledgers`, `Read the memo` (as Q1) |
| Bell, title | `{Quarter}: {short title}` (section 1) |
| Bell, detail | `Read the memo, then submit your picks and a plan for {quarter}.` |

**The order in the memo** when several things happen at once:
1. The score line.
2. This quarter's strike line, if it was a strike.
3. Any strike-expired line, oldest first.
4. Alma's flavor and the fact sentence.
5. The stretch sentence.
6. The calendar line.

A quarter that earns a strike while another expires shows both lines, and `Strikes counting: {n}` gives the count after both.

**The transmission's line** is Alma's `bossLine`. When a strike line applies, it's the Administrator's strike line instead (section 7 of `endless.md`): a new strike takes precedence over an expiry.

## 3. Decide: the bosses' brief, from Q3 on

The brief has five bubbles, in Q2's order: the Station Administrator, the Commerce Office, the Ministry of Culture, the Readers' Guild survey drone, and the Throughput Subcommittee. **A bubble's teaser is its line's first sentence,** as in Q2.

**Whose line is whose:**
- **The stretched boss** speaks Alma's `reason` (the stretch's reason, in capitals). For a recovery goal, it speaks the server's `{MEASURE} FELL {drop}. RESTORE IT.` Profit's stretch is the Commerce Office's, Readers served's the Throughput Subcommittee's, Happiness's the drone's, and Culture's the Ministry's. The Administrator is never stretched.
- **Every other boss** speaks line number (quarter's place in the game mod 8) from its list below, where Q1 2194's place is 0. So Q3 2194 uses line 2, and Q3 2196 uses line 2 again.
- **With two strikes counting,** there's no stretch, so all five use their lists.

**Mr. Zoolander, at most once a brief.** Each list has exactly one Zoolander line, at a different number per boss (Administrator 0, Commerce Office 1, Ministry 2, drone 3, Subcommittee 4). Every boss uses the same number in a quarter, so a brief names him at most once, and in three quarters of every eight not at all. Alma's lines are checked separately (`endless.md` section 9).

### The facts under each bubble

| Boss | Facts (plain text; **bold** as in Q2) |
| --- | --- |
| Station Administrator | `{Quarter} runs **{first day} to {last day}, {year}**. Your score is your **lowest measure**: Profit, Readers served, Happiness or Culture.` If any strikes count, add: `Strikes counting: **{n}**. Three at once, and the panel removes you.` |
| Commerce Office | `Each goal starts from **Q{n} 2193**, adjusted for what the Council expects this quarter, then adds **5%**. Books cost the store **60% of their list price**.` With format costs, the second sentence reads: `**{Format}** copies cost the store **{percent} of their list price** this quarter; other books, 60%.` |
| Ministry of Culture | `An author night costs **$200**: the author's shuttle fare and the room.` With author fares: `An author night costs **{cost}** this quarter: the author's shuttle fare and the room.` |
| Survey drone | `The Book of the Month calendar for **{month}, {month} and {month}** is empty. A pick is **15% off** for its whole month.` |
| Throughput Subcommittee | `Choose **up to three** picks, one for each month, and **up to one** more move. Choose nothing to hold course.` With a lot, add: `An Orbitplace lot is on offer as well.` |

- **The stretched boss's facts** keep its own sentence above and add the stretch: `Its goal for {measure} is **{percent}** this quarter, instead of 5%.` For a recovery goal, it reads: `Its goal for {measure} is **{percent}** this quarter, to restore its fall in {previous quarter}.`
- Dates read like Q2's: `July 1 to September 30, 2194`.

### The rotating lines

**Station Administrator**
0. `MR. ZOOLANDER ONCE WORKED FOUR QUARTERS IN A ROW. HE CALLED IT A YEAR. WE HAVE ADOPTED THE TERM.`
1. `A NEW QUARTER. IT HAS THREE MONTHS. WE COUNTED THEM PERSONALLY.`
2. `YOUR SCORE IS STILL YOUR LOWEST MEASURE. WE HAVE NOT CHANGED THE RULE. WE ARE VERY CONSISTENT.`
3. `THE STATION CONTINUES TO ORBIT. SO DOES YOUR SHOP. PLEASE KEEP IT THAT WAY.`
4. `WE HAVE REVIEWED YOUR TENURE. IT IS ONGOING. WE APPROVE OF ONGOING.`
5. `THE QUARTER BEGINS NOW. IT ENDS LATER. THIS IS HOW QUARTERS WORK.`
6. `PLEASE FILE A PLAN. AN UNFILED PLAN IS ONLY A THOUGHT. WE DO NOT ACCEPT THOUGHTS.`
7. `THE PANEL SENDS ITS REGARDS. THE PANEL HAS NO REGARDS. IT SENDS THEM ANYWAY.`

**The Commerce Office**
0. `THE LEDGER HAS A NEW PAGE. IT IS BLANK. WE FIND THIS UNSETTLING.`
1. `MR. ZOOLANDER HAS NEVER CHECKED A PRICE. WE CHECK EVERY PRICE. THIS IS WHY WE ARE NOT A MODEL.`
2. `PROFIT IS REVENUE MINUS COST. WE CHECKED THIS WITH THREE CALCULATORS. TWO AGREED.`
3. `EVERY BOOK COSTS SOMETHING. EVERY SALE MAKES SOMETHING. PLEASE MAKE MORE THAN IT COSTS.`
4. `THE COMMERCE OFFICE HAS NO OPINION ON BOOKS. IT HAS MANY OPINIONS ON MONEY.`
5. `A DISCOUNT IS A SMALL SADNESS. WE HAVE A FORM FOR SMALL SADNESSES.`
6. `WE HAVE BOUGHT A SECOND SPREADSHEET. IT DISAGREES WITH THE FIRST. WE ARE MEDIATING.`
7. `THE MONEY GOES IN THE LEDGER. PLEASE PUT MORE MONEY IN THE LEDGER.`

**The Ministry of Culture**
0. `CULTURE IS ONGOING. IT CANNOT BE PAUSED. WE ASKED.`
1. `AN AUTHOR IS A PERSON WHO WROTE A BOOK. WE HAVE MET SEVERAL. THEY WERE TALL.`
2. `MR. ZOOLANDER HAS READ A BOOK. HE DID NOT SAY WHICH. THE MINISTRY RESPECTS HIS PRIVACY.`
3. `THE MINISTRY HAS VISITED YOUR SHELVES. THE SHELVES WERE CULTURAL. PLEASE CONTINUE.`
4. `A STATION WITHOUT BOOKS IS ONLY A STATION. WE HAVE SEEN ONE. IT WAS VERY QUIET.`
5. `CULTURE CANNOT BE COUNTED. WE COUNT IT ANYWAY. IT IS OUR JOB.`
6. `THE MINISTRY ENCOURAGES READING. THE MINISTRY ALSO ENCOURAGES BUYING THE BOOK FIRST.`
7. `AUTHORS REMAIN AVAILABLE. THE SHUTTLE REMAINS EXPENSIVE. THESE FACTS ARE RELATED.`

**The Readers' Guild survey drone**
0. `THE DRONE IS LISTENING. THE DRONE IS ALWAYS LISTENING. THIS IS ITS ONLY HOBBY.`
1. `HAPPY READERS COME BACK. THE DRONE HAS COUNTED THEM. THE DRONE ENJOYED COUNTING.`
2. `THE CALENDAR IS EMPTY AGAIN. THE DRONE CHECKED. THE DRONE STILL HAS NO HANDS.`
3. `MR. ZOOLANDER SMILES ONLY ON SPECIAL OCCASIONS. THE DRONE WOULD LIKE YOUR READERS TO SMILE MORE OFTEN.`
4. `THE DRONE HAS SURVEYED THE CORRIDOR. THE CORRIDOR HAD NO COMMENT.`
5. `A GOOD PICK MAKES A READER HAPPY. A BAD PICK MAKES A READER QUIET. THE DRONE PREFERS NOISE.`
6. `THE DRONE HAS BEEN SERVICED. IT IS READY TO BE DISAPPOINTED, OR NOT.`
7. `PLEASE MAKE THE READERS HAPPY. THE DRONE WILL TAKE IT FROM THERE.`

**The Throughput Subcommittee**
0. `THE DOOR IS OPEN. THE SUBCOMMITTEE HAS CONFIRMED THIS. TWICE.`
1. `READERS ENTER. READERS LEAVE. WE WOULD LIKE MORE OF THE FIRST PART.`
2. `PICK THREE BOOKS. THREE REMAINS THE NUMBER. WE HAVE NOT FOUND A BETTER ONE.`
3. `THE SUBCOMMITTEE HAS MEASURED THE AISLE. IT CAN HOLD MORE READERS. PLEASE SEND THEM.`
4. `MR. ZOOLANDER CANNOT TURN LEFT. YOUR READERS NEED ONLY TURN INTO THE SHOP. THE SUBCOMMITTEE BELIEVES IN THEM.`
5. `A READER IS A PERSON WITH AN ORDER. THE SUBCOMMITTEE HAS NO OTHER DEFINITION. IT TRIED.`
6. `THROUGHPUT IS PEOPLE PER QUARTER. WE WOULD LIKE MORE PEOPLE. WE WOULD LIKE THE SAME QUARTER.`
7. `THE SHUTTLE BRINGS READERS. PLEASE HAVE SOMETHING FOR THEM TO READ.`

The rotating lines name no event, no direction and no figure that changes with the quarter. So they can't contradict the memo, whatever Alma draws.

### The rest of the form

| Element | String |
| --- | --- |
| Heading | `PLAN FOR {QUARTER}` (`PLAN FOR Q3 2194`) |
| Form serial | `LKS-{year}-Q{n}-{0000 + place + 2}`: Q3 2194 is `LKS-2194-Q3-0004`, and Q1 2195 is `LKS-2195-Q1-0006` (Q1 was `0002`, Q2 `0003`) |
| Moves heading, picks, more-move label, hold course, too many | As Q2 |
| Author nights move | As Q2. With author fares, the figure reads `{cost} a night` and the line ends `at {cost} each.` |
| Play-out | The quarter's months, as Q2: `July...`, `August...`, `September...` |

## 4. The result screen, from Q3 on

| Element | String |
| --- | --- |
| Title | `{Quarter}: the results` (`Q3 2194: the results`) |
| Chart's reference line | `{previous quarter} (for reference)` (`Q2 2194 (for reference)`) |
| Report card, last-year column | `Q{n} 2193, adjusted` |
| Goals note | `Each goal is Q{n} 2193, adjusted for what the Council expected this quarter, plus 5%. Matching the adjusted Q{n} 2193 scores 70 (C−). Meeting the goal scores 100 (A+).` |
| Goals note, with a stretch | The first sentence ends `plus 5%, and {measure}'s goal was raised {percent} instead.` |
| Goals note, with a recovery goal | The first sentence ends `plus 5%, and {measure}'s goal was {percent} above it, to restore its fall in {previous quarter}.` |
| Season note | `{Quarter} revenue was {pct}% {above / below} {previous quarter}. In 2193, Q{n} brought in {money}, and {the 2193 quarter before it} {money}. To judge your plan, compare it with holding course, not with {previous quarter}.` |
| Primary button, while the game goes on | `Continue to {next quarter}` (`Continue to Q4 2194`) |

- **The goals note quotes 2193 every year.** Goals don't ratchet (decision 7): Q3 2196's goals start from Q3 2193 too, so the column and the note name it.
- **The season note** for a Q1 compares with Q4 of the year before: `In 2193, Q1 brought in {money}, and Q4 2193 {money}.` The figures are the ledger's, and the server fills them.

**Q2's result screen changes in two ways.** The half-year review is replaced by the service record (`endless.md` section 6). Its closing line, `That's the end of the first half of 2194. Thanks for minding the shop.`, and its `Play again` button go. The primary button becomes `Continue to Q3 2194`.

### The two new certificates

`scoring.md` lists them, and the engine decides who earns them. Their small print is unchanged: `Issued by the Center for Shopkeepers Who Can't Sell Good`.

| Certificate | When (`scoring.md`) | Text |
| --- | --- | --- |
| Comeback | The quarter's recovery goal was met | `Comeback: {measure} fell in {previous quarter}, and you restored it. Certificates don't change your score.` |
| Weathered the Storm | Goals met in a quarter with a major event | `Weathered the Storm: {measure} met its goal despite {short title, lower case}. Certificates don't change your score.` |

- **Weathered the Storm's `{measure}`** is the measure the event works against (`endless.md` section 2's table), so it's earned by meeting that measure's goal.
- A quiet quarter is never a major event. Whether the others all count is the engine's call (Sim).

### What you found, from Q3 on

| Element | String |
| --- | --- |
| Footer | `{found} of {total} found.` (the total is 2 or 3: a quiet quarter, or author fares never run, offers no event discovery) |

**Not-found texts** say where to look, never what's there, as in M1:

| Discovery | Not-found text |
| --- | --- |
| Genre surge or slump | `Break {genre} down by title for {the quarter a year before}.` |
| Quiet days | `Break a past quarter's orders down by weekday.` |
| Author fares | `Look at what your author nights brought in, quarter by quarter.` |
| Format costs | `Break {the quarter a year before} down by format.` |
| Orbitplace lot | `Look at the lot's title month by month, over the last four quarters.` |
| Your last quarter, on the record | `Compare a measure for {last quarter} with {the quarter a year before}.` |
| Your weakest measure | `Look into {measure} for {last quarter}, by month or by title.` |

## 5. Who builds what

- **Chart:** sections 3 and 4.
- **Frank:** sections 1 and 2, plus `endless.md` sections 6 and 7. Frank also sends Chart's result screen the season note's ledger figures, the certificates and the discovery totals.
- **Questions on any string** go to Plot. If a string doesn't fit the layout, ask, rather than shortening it on the screen.
