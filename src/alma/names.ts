// Names in Alma's flavor must match the chosen candidate (endless.md section 9, Probe's finding 1): no genre,
// weekday, format or month from the fixed lists other than the candidate's own, in any of their forms, and no
// catalog title. The server's fact sentence names the real ones, so a wrong genre or day in the flavor would
// contradict it.

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
  "Mass market paperback": ["mass market paperback", "mass market paperbacks", "mass-market paperback", "mass-market paperbacks"],
  Graphic: ["graphic novel", "graphic novels"],
  "Board book": ["board book", "board books"],
};
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekdayForms = (d: string) => [d.toLowerCase(), `${d.toLowerCase()}s`];
// "May" and "March" are ordinary words too ("the bosses may", "a march"), so months count only capitalized in
// prose, and in the capitals fields every month counts but those two.
const monthForms = (m: string) => [m];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const anyOf = (forms: string[], flags: string) => (forms.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${forms.map(escape).sort((a, b) => b.length - a.length).join("|")})(?![\\p{L}\\p{N}])`, flags) : null);

/** The month names of a quarter's three months, "2194-Q3" → July, August, September. */
export const quarterMonths = (quarter: string) => MONTHS.slice((Number(quarter.slice(-1)) - 1) * 3, Number(quarter.slice(-1)) * 3);

/** Why a field names something the candidate doesn't, or null. `titles` are the catalog's titles. */
export function nameProblem(text: string, candidate: Candidate, quarter: string, titles: readonly string[], capitals: boolean): string | null {
  const own: string[] = [];
  const others: string[] = [];
  for (const [value, forms] of Object.entries(GENRE_FORMS)) (candidate.params.genre === value ? own : others).push(...forms);
  for (const [value, forms] of Object.entries(FORMAT_FORMS)) (candidate.params.format === value ? own : others).push(...forms);
  for (const day of WEEKDAYS) (candidate.params.weekday === day ? own : others).push(...weekdayForms(day));
  const month = typeof candidate.params.month === "number" ? quarterMonths(quarter)[candidate.params.month - 1] : undefined;
  const months: string[] = [];
  for (const m of MONTHS) (m === month ? own : months).push(...monthForms(m));

  // The candidate's own names come out first, so "science fiction" for SciFi/Fantasy doesn't read as Fiction.
  let rest = text;
  const mine = anyOf(own, "giu");
  if (mine) rest = rest.replace(mine, " ");
  if (anyOf(others, "iu")?.test(rest)) return "names another value";
  const monthPattern = capitals ? anyOf(months.filter((m) => m !== "May" && m !== "March"), "iu") : anyOf(months, "u");
  if (monthPattern?.test(rest)) return "names another month";
  if (anyOf([...titles], "iu")?.test(rest)) return "names a title";
  return null;
}
