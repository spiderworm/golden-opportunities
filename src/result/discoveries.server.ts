// The discoveries' words (docs/design/m1-copy.md, section 6, for Q1; q2.md, section 6, for Q2). Server-only: the
// found text is the answer, and the hint says where it is, so neither may ship
// in the browser's code. The result loader sends each player only what they
// have earned, and only after the quarter has played out.
import type { DiscoveryId } from "~/game/types";
import type { LaterDiscoveryId } from "~/game/later-discoveries";
import type { QuarterId } from "~/simulation/quarters";
import { FORMAT_WORDS, GENRE_WORDS } from "~/simulation/words";
import { quarterName } from "~/game/event-title";
import type { ResultQuarter } from "./copy";

/** A–C are Q1's, D–F Q2's (the game's ids). Q1's discoveries stay on Q1's screen: they don't carry over. */
export type { DiscoveryId };

const Q1: { id: DiscoveryId; found: string; notFound: string }[] = [
  {
    id: "A",
    found: "The whole store slowed. Every genre fell by a similar share, and orders fell while order size held.",
    notFound: "Compare Q3 and Q4 by genre, and look at average order value.",
  },
  { id: "B", found: "Weekdays emptied; weekends held.", notFound: "Break Q3 and Q4 down by weekday." },
  {
    id: "C",
    found: "Nonfiction's rise was one discounted title, and every month had one: the Book of the Month.",
    notFound: "Look closer at the one genre that grew, then break it down by discount.",
  },
];

const Q2: { id: DiscoveryId; found: string; notFound: string }[] = [
  {
    id: "D",
    found: "A pick added about the same number of copies whether the title was busy or quiet. On a busy title, the discount mostly went on copies that would have sold anyway.",
    notFound: "Look at last year's picks month by month: one that sells a lot, and one that doesn't.",
  },
  { id: "E", found: "Ratings differ a lot from title to title, and they aren't the same as sales.", notFound: "Look at the average rating, title by title." },
  { id: "F", found: "You compared your first quarter with last year's.", notFound: "Put Q1 2193 and Q1 2194 side by side." },
];

const DISCOVERIES: Record<ResultQuarter, typeof Q1> = { "2194-Q1": Q1, "2194-Q2": Q2 };

export interface EarnedDiscovery {
  id: DiscoveryId | LaterDiscoveryId;
  found: boolean;
  /** What was found, or where to look when it wasn't. */
  text: string;
}

/** Q1's and Q2's discoveries, each as found or as where to look. From Q3 on, see laterDiscoveries. */
export function earnedDiscoveries(found: readonly DiscoveryId[], quarter: QuarterId = "2194-Q1"): EarnedDiscovery[] {
  const list: (typeof Q1) | undefined = DISCOVERIES[quarter as ResultQuarter];
  return (list ?? []).map((d) => (found.includes(d.id) ? { id: d.id, found: true, text: d.found } : { id: d.id, found: false, text: d.notFound }));
}

/** A discovery the quarter offered, with what its texts need (Frank's laterOffers: quarters and names, no figures). */
export interface LaterOffer {
  id: LaterDiscoveryId;
  params: Readonly<Record<string, string>>;
}

const MEASURE_NAMES: Record<string, string> = { profit: "Profit", readers: "Readers served", happiness: "Happiness", culture: "Culture" };
const genre = (p: LaterOffer["params"]) => GENRE_WORDS[p.genre ?? ""] ?? p.genre ?? "";
const format = (p: LaterOffer["params"]) => FORMAT_WORDS[p.format ?? ""] ?? p.format ?? "";

/**
 * Where to look for last quarter's weakest measure: the ledger view that shows it (#220), one per measure.
 * Happiness is average rating, which isn't dated, so it's never "by month".
 */
function weakestHint(measure: string, last: string): string {
  switch (measure) {
    case "profit":
      return `Look at revenue for ${quarterName(last)}, by month or by title.`;
    case "readers":
      return `Look at orders for ${quarterName(last)}, by month or by title.`;
    case "happiness":
      return "Look at average rating, title by title.";
    default:
      return `Look at units by title for ${quarterName(last)}.`;
  }
}

/** Each offer's found and not-found text (endless.md section 5; endless-copy.md section 4). */
function laterTexts(offer: LaterOffer): { found: string; notFound: string } {
  const p = offer.params;
  switch (offer.id) {
    case "record":
      return { found: `You compared ${quarterName(p.last!)} with ${quarterName(p.yearBefore!)}.`, notFound: `Compare a measure for ${quarterName(p.last!)} with ${quarterName(p.yearBefore!)}.` };
    case "weakest":
      return { found: `You looked into ${MEASURE_NAMES[p.measure!] ?? p.measure}, last quarter's lowest.`, notFound: weakestHint(p.measure!, p.last!) };
    case "event":
      switch (p.type) {
        case "genre_surge":
        case "genre_slump":
          return { found: `You looked inside ${genre(p)}, title by title.`, notFound: `Break ${genre(p)} down by title for ${quarterName(p.yearBefore!)}.` };
        case "quiet_days":
          return { found: `You found the ${p.weekday} pattern in last year's orders.`, notFound: "Break a past quarter's orders down by weekday." };
        case "format_costs":
          // Plot's wording (#223), which reads for every format.
          return { found: `You checked how many of the shop's sales are ${format(p)} copies.`, notFound: `Break ${quarterName(p.yearBefore!)} down by format.` };
        default:
          return { found: "You found the quarter's event in the ledgers.", notFound: "Look for the quarter's event in the ledgers." };
      }
  }
}

/**
 * From Q3 on, the quarter's own discoveries (endless.md section 5): the ones it offered, in order, each as found
 * or as where to look. The footer's total is how many it offered (2 or 3).
 */
export function laterDiscoveries(found: readonly LaterDiscoveryId[], offers: readonly LaterOffer[]): EarnedDiscovery[] {
  return offers.map((offer) => {
    const texts = laterTexts(offer);
    return found.includes(offer.id) ? { id: offer.id, found: true, text: texts.found } : { id: offer.id, found: false, text: texts.notFound };
  });
}
