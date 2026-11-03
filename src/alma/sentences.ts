// The server's sentences for the memo (endless.md section 3): every figure and direction of the quarter's event
// and stretch, written from the record's params, never from Alma's text. Alma's flavor goes before the fact
// sentence; the stretch sentence follows.

import type { MeasureId } from "./events";
import { quarterMonths } from "./names";
import { FORMAT_WORDS, GENRE_WORDS } from "~/simulation/words";
import type { AlmaRecord } from "./record";

export const MEASURE_NAMES: Record<MeasureId, string> = {
  profit: "Profit",
  readers: "Readers served",
  happiness: "Happiness",
  culture: "Culture",
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The event's fact sentence, from the record's type and params. */
export function factSentence(record: Pick<AlmaRecord, "quarter" | "type" | "params">): string {
  const p = record.params;
  const month = typeof p.month === "number" ? quarterMonths(record.quarter)[p.month - 1] : "";
  switch (record.type) {
    case "genre_surge":
      return `The Council expects ${GENRE_WORDS[p.genre as string]} orders to rise ${p.percent}% in ${month}.`;
    case "genre_slump":
      return `The Council expects ${GENRE_WORDS[p.genre as string]} orders to fall ${p.percent}% in ${month}.`;
    case "quiet_days":
      return `The Council expects ${p.weekday} orders to fall ${p.percent}% this quarter.`;
    case "author_fares":
      return `An author night costs $${p.cost} this quarter, instead of $200.`;
    case "format_costs":
      return `${capital(FORMAT_WORDS[p.format as string])} copies cost the shop ${p.percent}% of their list price this quarter, instead of 60%.`;
    case "quiet_quarter":
      return "The Council expects no change in the shop's trade this quarter.";
    default:
      throw new Error(`No fact sentence for ${record.type}.`);
  }
}

/** The stretch sentence: `boss` is the one that owns the measure (the memo's caller knows which). */
export function stretchSentence(
  record: Pick<AlmaRecord, "stretch" | "drop" | "reason">,
  boss: string,
): string {
  if (!record.stretch)
    return "With two strikes counting, the bosses have held every goal at the usual 5% this quarter.";
  const name = MEASURE_NAMES[record.stretch.measure];
  if (record.drop !== undefined) {
    return `${name} fell ${record.drop}% against the same quarter a year earlier. The ${boss} requires it restored: "${name.toUpperCase()} FELL ${record.drop}%. RESTORE IT."`;
  }
  return `The ${boss} has raised its goal for ${name} by ${record.stretch.percent}% this quarter, instead of the usual 5%. Its reason: "${record.reason ?? ""}"`;
}
