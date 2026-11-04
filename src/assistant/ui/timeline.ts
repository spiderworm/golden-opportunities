// Dewey's chat on a timeline (David, 3 Nov 2026: "Messages sent in the current quarter should be under "Today".
// Those under previous quarters should be labeled under the first day of that quarter. Every time we advance
// quarters, we should update that chat"). Each reply keeps the quarter it was asked in; the headings are worked
// out from the game's current quarter whenever the chat is drawn, so advancing a quarter needs no migration.
import { formatStationDate } from "~/shell/station-date";

const QUARTER = /^(\d{4})-Q([1-4])$/;

/** Whether a value is a quarter as a reply keeps it ("2194-Q1"). */
export const isQuarter = (value: unknown): value is string =>
  typeof value === "string" && QUARTER.test(value);

/** Whether a value is a game's key as GET /api/assistant gives it: a one-way hash of its save, never the save. */
export const isGameKey = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{16}$/.test(value);

/** When a reply was asked, or where the game is now: its quarter and its game, either unknown. */
export interface Moment {
  quarter?: string;
  game?: string;
}

/**
 * A reply's heading (Plot's copy): "Today" for the current quarter, the first day of an earlier one in the
 * station's date style ("2194 Apr 1"), and "Earlier" for a reply kept before quarters were recorded or from an
 * earlier game.
 */
export function timelineLabel({ quarter, game }: Moment, now: Moment): string {
  if (!quarter || !isQuarter(quarter)) return "Earlier";
  // Another game's turn, from before Play again or Reset game, which keep the chat (Chart, #390).
  if (game && now.game && game !== now.game) return "Earlier";
  const current = now.quarter;
  if (quarter === current) return "Today";
  // A quarter after the current one is from a game before Play again, which keeps the chat (Audit, #390): it's
  // earlier, whatever its date says. "YYYY-Qn" compares in time order as text.
  if (current && quarter > current) return "Earlier";
  const [, year, q] = QUARTER.exec(quarter)!;
  return formatStationDate(`${year}-${String(3 * Number(q) - 2).padStart(2, "0")}-01`);
}

/** The heading to draw before each reply, or null where it continues the one before's group. Oldest first. */
export function timelineHeadings(replies: readonly Moment[], now: Moment): (string | null)[] {
  const labels = replies.map((r) => timelineLabel(r, now));
  return labels.map((label, i) => (i > 0 && labels[i - 1] === label ? null : label));
}
