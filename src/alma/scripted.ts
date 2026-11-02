// The scripted fallback (endless.md section 9): when the model is unavailable, too slow, or wrong twice, the
// quarter gets a scripted event of the same shape, chosen from the save's seed and the quarter, so a retry after
// a failed write picks the same one. It passes the same checks as Alma's answers.
//
// The texts are stand-ins until Plot writes them (one per type and value).

import { EVENT_TYPES, MEASURE_IDS, STRETCH_PERCENT, type EventType, type MeasureId } from "./events";
import type { AlmaChoice } from "./record";
import { choiceProblem, type ChoiceContext } from "./validate";

const STORIES: Record<string, string> = {
  genre_surge: "A book club on the hydroponics deck has started on {{genre}}. Expect a busy {{month}}.",
  genre_slump: "The station archive is lending its {{genre}} collection free of charge through {{month}}.",
  quiet_days: "The Ring C shuttle now docks an hour later on {{weekday}}s, all quarter.",
  author_fares: "The shuttle line has repriced its author fares: an author night now costs {{cost}}.",
  format_costs: "A shortage at the printworks: {{format}} copies now cost the shop {{percent}} of list.",
  quiet_quarter: "Nothing out of the ordinary is expected on the station this quarter.",
};

const BOSS_LINES: Record<string, string> = {
  genre_surge: "THE COMMERCE OFFICE HAS NOTED THE BOOK CLUB. DO NOT WASTE IT.",
  genre_slump: "THE ARCHIVE IS NOT OUR CONCERN. YOUR LEDGER IS.",
  quiet_days: "THE SHUTTLE TIMETABLE IS FINAL. ADAPT.",
  author_fares: "THE FARES ARE THE FARES. PLAN ACCORDINGLY.",
  format_costs: "THE PRINTWORKS SENDS ITS REGRETS. WE DO NOT ACCEPT THEM.",
  quiet_quarter: "A QUIET QUARTER IS NO EXCUSE. WE ARE WATCHING.",
};

const NAMES: Record<MeasureId, string> = { profit: "PROFIT", readers: "READERS SERVED", happiness: "HAPPINESS", culture: "CULTURE" };

/** A small deterministic hash (FNV-1a), so the same seed and quarter always script the same event. */
function hash(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join(":")) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const rotate = <T>(list: readonly T[], by: number) => list.map((_, i) => list[(i + by) % list.length]);

function build(type: EventType, measure: MeasureId, seed: number, context: ChoiceContext): AlmaChoice {
  const params: Record<string, string | number> = {};
  for (const [name, spec] of Object.entries(type.params)) {
    const h = hash(seed, context.quarter, type.id, name);
    params[name] = spec.kind === "enum" ? spec.values[h % spec.values.length] : spec.min + (h % (spec.max - spec.min + 1));
  }
  const percent = STRETCH_PERCENT.min + (hash(seed, context.quarter, "stretch") % (STRETCH_PERCENT.max - STRETCH_PERCENT.min + 1));
  const reason = context.recovery ? `${NAMES[measure]} FELL {{drop}}. RESTORE IT.` : `THE COUNCIL REQUIRES {{stretch}} MORE ${NAMES[measure]} THIS QUARTER.`;
  return { type: type.id, params, stretch: { measure, percent, reason }, story: STORIES[type.id], bossLine: BOSS_LINES[type.id] };
}

/**
 * The scripted choice for a quarter. It keeps every rule it can: if the rules leave nothing (on a strike, with
 * a recovery stretch, after a surge and a recent quiet quarter), it drops only the rules about repeating the
 * last quarter, never the limits, "no piling on" or the recovery stretch.
 */
export function scriptedChoice(seed: number, context: ChoiceContext): AlmaChoice {
  const types = rotate(EVENT_TYPES, hash(seed, context.quarter, "type") % EVENT_TYPES.length);
  const measures = context.recovery ? [context.recovery.measure] : rotate(MEASURE_IDS, hash(seed, context.quarter, "measure") % MEASURE_IDS.length);
  for (const rules of [context, { ...context, previous: [] }]) {
    for (const type of types) {
      for (const measure of measures) {
        const choice = build(type, measure, seed, context);
        if (!choiceProblem(choice, rules)) return choice;
      }
    }
  }
  throw new Error(`No scripted event fits ${context.quarter}.`);
}
