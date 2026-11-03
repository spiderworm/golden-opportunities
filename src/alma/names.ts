// Names in Alma's flavor must match the chosen candidate (endless.md section 9, Probe's finding 1): no genre,
// weekday, format or month from the fixed lists other than the candidate's own, in any of their forms, and no
// catalog title. The server's fact sentence names the real ones, so a wrong genre or day in the flavor would
// contradict it.

import type { QuarterId } from "~/simulation/quarters";
import type { Candidate } from "./candidates";

/** Each value's forms a sentence might use: the list's own spelling, lower case, plurals and section 3's words. */
const GENRE_FORMS: Record<string, string[]> = {
  Fiction: ["fiction"],
  Mystery: ["mystery", "mysteries"],
  Romance: ["romance", "romances"],
  "SciFi/Fantasy": ["scifi/fantasy", "scifi", "sci-fi", "science fiction", "fantasy", "fantasies"],
  "Young Adult": ["young adult"],
  Childrens: ["childrens", "children's", "children's book", "children's books"],
  Nonfiction: ["nonfiction", "non-fiction"],
  Memoir: ["memoir", "memoirs"],
};
const FORMAT_FORMS: Record<string, string[]> = {
  Hardcover: ["hardcover", "hardcovers", "hardback", "hardbacks"],
  "Trade paperback": ["trade paperback", "trade paperbacks"],
  Paperback: ["paperback", "paperbacks"],
  "Mass market paperback": [
    "mass market paperback",
    "mass market paperbacks",
    "mass-market paperback",
    "mass-market paperbacks",
  ],
  Graphic: ["graphic novel", "graphic novels"],
  "Board book": ["board book", "board books"],
};
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
// "May" and "March" are ordinary words too ("the bosses may", "march on"): in prose they count only as written
// "May" and "March", and in the capitals fields not at all. Every other month counts in any case.
const WORD_MONTHS = new Set(["May", "March"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The month names of a quarter's three months, "2194-Q3" → July, August, September. */
export const quarterMonths = (quarter: QuarterId) =>
  MONTHS.slice((Number(quarter.slice(-1)) - 1) * 3, Number(quarter.slice(-1)) * 3);

/** Every form, with the value it names: "genre:Mystery", "month:July". */
function forms(capitals: boolean): Map<string, string> {
  const owner = new Map<string, string>();
  for (const [value, list] of Object.entries(GENRE_FORMS))
    for (const f of list) owner.set(f, `genre:${value}`);
  for (const [value, list] of Object.entries(FORMAT_FORMS))
    for (const f of list) owner.set(f, `format:${value}`);
  for (const day of WEEKDAYS)
    for (const f of [day, `${day}s`]) owner.set(f.toLowerCase(), `weekday:${day}`);
  for (const m of MONTHS) if (!WORD_MONTHS.has(m)) owner.set(m.toLowerCase(), `month:${m}`);
  if (!capitals) for (const m of WORD_MONTHS) owner.set(m, `month:${m}`);
  return owner;
}

/**
 * Why a field names something the candidate doesn't, or null. One scan, longest form first, so a longer value
 * that contains the candidate's own ("science fiction" around "fiction", "trade paperback" around "paperback")
 * is read as itself (Probe's review of #178). `titles` are the catalog's titles.
 */
export function nameProblem(
  text: string,
  candidate: Candidate,
  quarter: QuarterId,
  titles: readonly string[],
  capitals: boolean,
): string | null {
  const month =
    typeof candidate.params.month === "number"
      ? quarterMonths(quarter)[candidate.params.month - 1]
      : undefined;
  const own = new Set([
    `genre:${candidate.params.genre}`,
    `format:${candidate.params.format}`,
    `weekday:${candidate.params.weekday}`,
    `month:${month}`,
  ]);
  const owner = forms(capitals);
  const all = [...owner.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${all.map(escape).join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );
  for (const match of text.matchAll(pattern)) {
    const found = match[0];
    // Case-insensitive, except the two months that are words: those are keyed only as written ("May").
    const value = owner.get(found.toLowerCase()) ?? owner.get(found);
    if (!value) continue;
    if (!own.has(value))
      return value.startsWith("month:") ? "names another month" : "names another value";
  }
  for (const title of titles)
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escape(title)}(?![\\p{L}\\p{N}])`, "iu").test(text))
      return "names a title";
  return null;
}
