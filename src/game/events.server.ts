// A save's events for its time series (src/query/events.ts; David, 3 Nov 2026): the new volume's release, each
// Book of the Month pick, and the player's moves, labeled in Plot's copy. Only played quarters have any, so a marker
// never tells the player about a quarter they haven't reached (no spoilers): a quarter's picks and moves were
// filed in its plan, and its plan was played. 2193 has none: its picks are what discovery D is about.
import type { BookshopData, DeepReadonly, JoinedBook } from "../bookshop/types";
import { MOVES } from "../decide/copy";
import { editionDimensions } from "../query/run-query.server";
import { byDate, type ViewEvent } from "../query/events";
import { leversFor, monthsOf, type QuarterNumber } from "../simulation/model";
import { isQ2Plan } from "../simulation/plan";
import { RELEASE, RELEASE_DAY, releaseBook } from "../simulation/release";
import type { LeverId } from "../simulation/types";
import type { GameSave } from "./types";

const MOVE_NAMES = new Map<LeverId, string>(MOVES.map((m) => [m.id, m.title]));

/** Every edition the game can pick or release, by ISBN, with its book and publisher's name. */
function editions(data: DeepReadonly<BookshopData>) {
  const byIsbn = new Map<
    string,
    { book: DeepReadonly<JoinedBook>; isbn: string; format: string; publisher: string }
  >();
  const publisher = (id: string) => data.publishers.find((p) => p.id === id)?.name ?? id;
  for (const book of [...data.joinedBooks, releaseBook(data)])
    for (const e of book.editions)
      byIsbn.set(e.isbn, {
        book,
        isbn: e.isbn,
        format: e.format,
        publisher: publisher(e.publisherId),
      });
  return byIsbn;
}

/** A pick's line, Plot's copy: the edition by title and format, `Portmeirion, mass market paperback`. */
const pickLabel = (title: string, format: string) => `${title}, ${format.toLowerCase()}`;

/** The save's events, in date order: for each played quarter, its release, its picks month by month, its moves. */
export function eventsForSave(save: GameSave, data: DeepReadonly<BookshopData>): ViewEvent[] {
  const all = editions(data);
  const about = (isbn: string) => {
    const e = all.get(isbn);
    return e
      ? {
          dimensions: editionDimensions(e.book, e.isbn, e.publisher),
          awards: e.book.awards.map((a) => a.name),
        }
      : {};
  };
  const events: ViewEvent[] = [];
  for (const played of save.played) {
    const year = played.period.slice(0, 4);
    const q = Number(played.period.slice(-1)) as QuarterNumber;
    const months = monthsOf(q).map((m) => `${year}-${m}`);
    const start = `${months[0]}-01`;
    // Each month's pick: Q1's from the schedule (or the re-pick), later quarters' as the player chose them.
    const plan = played.outcome.plan;
    const picks = isQ2Plan(plan) ? plan.picks : leversFor(plan).picks;
    picks.forEach((pick, i) => {
      if (pick === null || !months[i]) return;
      const isbn =
        typeof pick === "string"
          ? pick
          : [...all.values()].find((e) => e.book.title === pick.title && e.format === pick.format)
              ?.isbn;
      const edition = isbn ? all.get(isbn) : undefined;
      if (!edition) return;
      events.push({
        date: `${months[i]}-01`,
        precision: "month",
        kind: "pick",
        label: pickLabel(edition.book.title, edition.format),
        ...about(edition.isbn),
      });
    });
    if (played.period === "2194-Q1") {
      const series = releaseBook(data).series;
      events.push({
        date: RELEASE_DAY,
        precision: "day",
        kind: "release",
        label: `${RELEASE.book.title}, ${series?.name ?? "series"} volume ${RELEASE.info.volume}`,
        ...about(RELEASE.edition.isbn),
      });
    }
    // Each move at its quarter's start; holding course isn't a move, so it has no marker (Plot).
    for (const lever of plan.levers)
      events.push({
        date: start,
        precision: "quarter",
        kind: "move",
        label: MOVE_NAMES.get(lever as LeverId) ?? lever,
      });
  }
  return events.sort(byDate);
}
