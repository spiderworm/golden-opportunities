// A quarter's event as the player reads it in a title: the bell's memo, and the service record's Event column
// (endless-copy.md section 1). One definition for the server (the memo, the bell) and the browser (the result
// screen), so the two can't drift (Plot and Audit, #214 and #215). Client-safe: no server imports.
import type { QuarterId } from "../simulation/quarters";
import { FORMAT_WORDS, GENRE_WORDS } from "../simulation/words";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const opening = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "2194-Q3" as "Q3 2194". */
export const quarterName = (quarter: string) => `${quarter.slice(5)} ${quarter.slice(0, 4)}`;

/** An event's type and params, as Alma's record and the service record carry them. */
export interface TitledEvent { type: string; params: Readonly<Record<string, string | number>> }

/**
 * The short title of a quarter's event. Q1 2194 has none ("None"), and Q2 2194's goals were the first to count the
 * new volume ("The new Inspector Ryeslton volume"); from Q3, the event's own title.
 */
export function eventTitle(quarter: QuarterId, event: TitledEvent | null): string {
  if (!event) return quarter === "2194-Q2" ? "The new Inspector Ryeslton volume" : "None";
  const p = event.params;
  // An event's month is its place in the quarter, 1 to 3.
  const month = () => MONTHS[(Number(quarter.slice(-1)) - 1) * 3 + Number(p.month) - 1] ?? "";
  switch (event.type) {
    case "genre_surge":
      return `${opening(GENRE_WORDS[String(p.genre)] ?? String(p.genre))} orders rising in ${month()}`;
    case "genre_slump":
      return `${opening(GENRE_WORDS[String(p.genre)] ?? String(p.genre))} orders falling in ${month()}`;
    case "quiet_days":
      return `Quiet ${p.weekday}s`;
    case "author_fares":
      return `Author nights at $${p.cost}`;
    case "format_costs":
      return `${opening(FORMAT_WORDS[String(p.format)] ?? String(p.format))} costs at ${p.percent}%`;
    case "quiet_quarter":
      return "A quiet quarter";
    default:
      // Alma's types are a fixed list (src/alma/events.ts); a test checks each has a title here.
      return "None";
  }
}

/** A later quarter's memo on the bell (endless-copy.md section 2): its id, title and detail. */
export function bellItem(quarter: QuarterId, event: TitledEvent): { id: string; title: string; detail: string } {
  const name = quarterName(quarter);
  return { id: `${quarter}-memo`, title: `${name}: ${eventTitle(quarter, event)}`, detail: `Read the memo, then submit your picks and a plan for ${name}.` };
}
