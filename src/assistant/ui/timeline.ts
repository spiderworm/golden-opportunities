// Dewey's chat on a timeline (David, 3 Nov 2026: "Messages sent in the current quarter should be under "Today".
// Those under previous quarters should be labeled under the first day of that quarter. Every time we advance
// quarters, we should update that chat"). Each reply keeps the quarter it was asked in; the headings are worked
// out from the game's current quarter whenever the chat is drawn, so advancing a quarter needs no migration.
import { formatStationDate } from "~/shell/station-date";

const QUARTER = /^(\d{4})-Q([1-4])$/;

/** Whether a value is a quarter as a reply keeps it ("2194-Q1"). */
export const isQuarter = (value: unknown): value is string =>
  typeof value === "string" && QUARTER.test(value);

/**
 * A reply's heading (Plot's copy): "Today" for the current quarter, the first day of an earlier one in the
 * station's date style ("1 Apr 2194"), and "Earlier" for a reply kept before quarters were recorded.
 */
export function timelineLabel(quarter: string | undefined, current: string | undefined): string {
  if (!quarter || !isQuarter(quarter)) return "Earlier";
  if (quarter === current) return "Today";
  const [, year, q] = QUARTER.exec(quarter)!;
  return formatStationDate(`${year}-${String(3 * Number(q) - 2).padStart(2, "0")}-01`);
}

/** The heading to draw before each reply, or null where it continues the one before's group. Oldest first. */
export function timelineHeadings(
  replies: readonly { quarter?: string }[],
  current: string | undefined,
): (string | null)[] {
  return replies.map((r, i) => {
    const label = timelineLabel(r.quarter, current);
    return i > 0 && timelineLabel(replies[i - 1]!.quarter, current) === label ? null : label;
  });
}
