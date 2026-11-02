// A sensible player's plan for any quarter, for scripts and tests that need a long game the panel won't end:
// endless.md section 8's "quiet picks + author nights", removed in at most 1 of 20 five-year games.
import type { BookshopData, DeepReadonly } from "~/bookshop/types";
import { ratingsOf } from "./measures";
import { monthsOf, type QuarterNumber } from "./model";
import { q2Candidates } from "./q2";
import { quarterNumber, type QuarterId } from "./quarters";
import { RELEASE } from "./release";
import type { Plan, Q2Plan } from "./types";

/** A quiet pick sold at most this many copies in its month of 2193. */
const QUIET_COPIES = 2;

const copiesByMonth = new WeakMap<DeepReadonly<BookshopData>, Map<string, number>>();

/**
 * Q1 2194: M1's re-pick plus author nights. Every quarter after: for each month, the best-rated hardcover
 * that sold 2 copies or fewer in that month of 2193 (a different title each month, the new volume never),
 * plus author nights. The same every year, so `seed` doesn't change it; it's there for callers that vary it.
 */
export function goodPlan(_seed: number, quarter: QuarterId, data: DeepReadonly<BookshopData>): Plan | Q2Plan {
  if (quarter === "2194-Q1") return { levers: ["repick", "events"] };
  let copies = copiesByMonth.get(data);
  if (!copies) {
    copiesByMonth.set(data, (copies = new Map()));
    for (const l of data.saleLines) copies.set(`${l.isbn}:${l.date.slice(5, 7)}`, (copies.get(`${l.isbn}:${l.date.slice(5, 7)}`) ?? 0) + 1);
  }
  const ratings = ratingsOf(data);
  const used = new Set<string>();
  const picks = monthsOf(quarterNumber(quarter) as QuarterNumber).map((month) => {
    const best = q2Candidates(data)
      .filter((c) => c.format === "Hardcover" && c.isbn !== RELEASE.edition.isbn && !used.has(c.bookId) && (copies.get(`${c.isbn}:${month}`) ?? 0) <= QUIET_COPIES)
      .sort((a, b) => ratings.average(b.bookId) - ratings.average(a.bookId) || b.listPrice - a.listPrice || a.title.localeCompare(b.title, "en-US"))[0];
    used.add(best.bookId);
    return best.isbn;
  });
  return { picks, levers: ["events"] };
}
