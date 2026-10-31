# M1: a new volume comes out (design draft)

Status: **decided (David, October 31, 2026):** he approved `q2.md` ("127 LGTM"), whose decision 5 ships this volume in Q1 and keeps it selling in Q2, with the goal anchor below. David on new releases during the quarter: "New book releases seems too exciting to pass up tbh". Given the 3 November deadline, this is the cheap version Goldy recommended: one generated release in the simulated Q1 2194, using the existing levers and no new systems. Figures come from `src/bookshop/data.json`. Everything marked **Generated** is scenario fiction, not data.

## The release

**Inspector Ryeslton, volume 3.** The series has 2 of 4 planned volumes out, and it sells: volume 1 sold 4,088 copies in 2193 and volume 2 sold 3,460. *The Aspall Trilogy* (1 of 3 out) sold 261, too few for a release to register.

| Field | Value | Source |
| --- | --- | --- |
| Title | *The Bourton Model Village Poisoning* | **Generated**, in the series' style: volume 1 is *9803 North Millworks Road*, volume 2 *The Winchcombe Railway Museum Heist* |
| Author | Carolyn Segal | From the data (volumes 1 and 2) |
| Genre | Mystery | From the data |
| Publisher | Etaoin Shrdlu Press (ESP) | From the data |
| Edition | Hardcover, $22.99, 312 pages | **Generated.** ESP published both earlier volumes in hardcover at $22.99 first, and a mass market paperback a year or more later |
| Release date | Tuesday, February 4, 2194 | **Generated** |
| Cover line | `Inspector Ryeslton returns. Somebody has poisoned a village. A very small one.` | **Generated** |
| Staff comment | `Ryeslton's best yet, and this time every suspect is one-twelfth scale.` | **Generated.** The earlier volumes have no staff comment |
| Rating, for Happiness and Culture | Volume 2's average, 4.04 (culture value 6.48, no awards) | **Generated**, anchored to volume 2 |

## Expected sales

**Rate:** 4.5 copies a day at full price. That is volume 2's first-quarter rate in 2193 (478 copies over 90 days, 5.3 a day) times 0.85. The 0.85 is the series' own volume-to-volume ratio in 2193: volume 2 sold 85% of volume 1. Other series fall by about as much: *The Mallemaroking Saga* sold 7,334, then 4,636 (63%), then 4,077 (88%).

**Launch:** three times the rate in the first week, and twice the rate in the second. **Generated**: no series released a volume in 2193, so the data can't show a launch.

**In the model:** each copy is a new one-line order at full price. Each day's count is the rate times the launch multiplier, scaled by that day's share of baseline orders, so the release follows the weekday pattern. It draws from its own seeded stream, so holding course and the plan get the same release. Over seeds 1 to 20, the release sells 309 to 319 copies by March 31 (median 313).

## How the player learns of it

- **The arrival memo** gains a plain line: `Etaoin Shrdlu Press reports that the third Inspector Ryeslton mystery arrives on February 4.` The player can investigate the series before deciding.
- **On the Decide screen,** the survey drone's fact strip names the volume, its date and its price, and the Commerce Office's strip says the goals count it. The strings are in `m1-copy.md`.

## How it meets the levers

There are no new rules. The existing ones already reach the release:
- **The sale** takes 15% off the new hardcover, and it clones release orders like any other order. That gives away margin on copies that would have sold at full price, so the sale does a little worse than before (see the calibration below). That is the M1 lesson again.
- **Author nights** clone orders from their own day. After February 4, those orders include release copies, so a night in launch week brings some in.
- **Re-pick** is unchanged. The release isn't a Book of the Month in M1. Choosing picks, the release among them, belongs to the later "pick the books" investigation in `arc.md`.

The plan is still up to two moves.

## Scoring: the goals count the release

The release adds orders, profit and culture to every plan, holding course included. Measured on Sim's engine (seeds 1 to 20), adding it with unchanged goals breaks the calibration:

| Plan | Without the release | With the release, goals unchanged | With the release, goals counting it |
| --- | --- | --- | --- |
| Hold course | 67–70, median 67 | 77–81, median 80 | 67–70, median 67 |
| `repick` | 71–76, median 72 | 69–72, median 69 | 71–76, median 73 |
| `events` | 69–89, median 72 | 93–99, median 94 | 69–90, median 73 |
| `sale` | 38–42, median 39 | 46–50, median 47 | 35–40, median 36 |
| `repick` + `events` | 85–91, median 87 | 81–87, median 82 | 85–91, median 87 |
| `repick` + `sale` | 39–45, median 41 | 47–52, median 48 | 37–42, median 38 |
| `events` + `sale` | 38–44, median 39 | 47–52, median 47 | 36–42, median 37 |

With unchanged goals, author nights alone outscores the strong plan, and holding course beats re-pick. The release's profit covers the nights' $2,400 in costs, and its full-price orders pull the happiness average down.

**Proposal: the goals count the release.** Each measure's anchor (what scores 70) is last year's Q1 plus the release's expected effect on a quarter of holding course. The goal is that anchor plus the usual stretch.
- **Where the anchor applies** (Sim's note): it replaces last year everywhere the score uses it, in the 70 point, in the stretch (the goal is anchor + max(5% of |anchor|, 1% of the quarterly average)), and in the penalty below it (70 − 250 × (anchor − r) ÷ max(|anchor|, quarterly average)). The calibration above was measured that way. The quarterly average stays 2193's.
- **Expected effect** is the mean, over a fixed set of seeds (101 to 120, independent of the player's seed), of holding course with the release minus holding course without it. Sim computes it the same way. On those seeds it is profit +$2,889, readers +314, culture +308 and happiness −0.45.
- **Goals, approximately:** profit $42,558 (was $39,524), readers served 7,496 (was 7,166), happiness 67.85 (was 68.32) and culture 18,560 (was 18,236).
- **Calibration holds.** Every band in the table above matches the current one to within a point or two. Re-pick plus author nights is still the strong plan, and the sale still fails, a little harder.

In the story, the Commerce Office knows the volume is coming and plans for it. That is the bosses' forecast, not Dewey's.

## Dewey

Dewey may report:
- the release date, edition and price;
- the series' past sales, by volume, quarter and edition;
- the series' book-tour count (19).

Dewey never forecasts how volume 3 will sell, never applies the 2193 volume-to-volume ratios to it, and doesn't know the goals' breakdown (it sees what the player sees). Asked for a forecast, it uses the existing refusal and redirect, and offers the series' past sales instead.

## The result screen

One sentence in "What happened", for every plan, before the moves' sentences:
> The third Inspector Ryeslton mystery came out on February 4 and sold {copies} copies by March 31.

With the sale, add: `{saleCopies} of them were 15% off in the sale.`

Two lines join the assumptions panel (strings in `m1-copy.md`). They cover the release's sales rate and launch, and the goals counting it.

## For implementation

- **Frank:** the generated book and edition records above, flagged as generated, so charts, the ledger and Dewey's queries can join the release's 2194 lines.
- **Sim:** the release orders (their own stream, `release`), the anchor offsets, a test that the calibration bands hold, and the result facts (`copies`, and `saleCopies` for a plan with the sale).
- **Chart:** the strings in `m1-copy.md`.
