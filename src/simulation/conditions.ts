// Alma's event as conditions on a quarter (docs/design/endless.md, sections 2 and 8): plain multipliers
// on the baseline, applied after the new volume and before the levers, so holding course lives through
// them too, and costs for the ledger. The engine reads only an event record's type, params, stretch and
// drop (src/alma/record.ts), so a replay of the save gives the same quarter.
import type { Costs } from "./measures";
import { cloneOrder, type Order } from "./orders";
import { stream } from "./random";
import { streamName, type History } from "./model";
import type { MeasureId } from "./types";

/** What the engine reads of an Alma record. */
export interface TurnEvent {
  type: string;
  params: Readonly<Record<string, string | number>>;
  /** None while two strikes count. For a recovery goal (`drop` set), `percent` is its cap, 20. */
  stretch: { measure: MeasureId; percent: number } | null;
  /** A recovery goal's fall, in whole percent: the goal is the anchor times (1 + drop / 100), within the cap. */
  drop?: number;
}

/**
 * The measures each event type works against (endless.md section 2's table, from Sim's bounds): those its
 * expected effect lowers on holding course, plus Profit for author fares. Alma's events.ts keeps the same
 * table for its choosing rules; a test checks they agree.
 */
export const AGAINST: Readonly<Record<string, readonly MeasureId[]>> = {
  genre_surge: [],
  genre_slump: ["profit", "readers", "culture"],
  quiet_days: ["profit", "readers", "culture"],
  author_fares: ["profit"],
  format_costs: ["profit"],
  quiet_quarter: [],
};

export interface Conditions {
  /** Orders with a line in this genre, in this month (MM), are dropped or cloned to this factor. */
  genre?: { genre: string; month: string; factor: number };
  /** Orders on this weekday (0 is Sunday), all quarter. */
  weekday?: { weekday: number; factor: number };
  costs: Costs;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The event's conditions in its quarter. Throws for a type or param the engine doesn't know: the record was checked when saved. */
export function conditionsOf(event: TurnEvent | null, history: History): Conditions {
  if (!event) return { costs: {} };
  const p = event.params;
  const month = () => history.months[Number(p.month) - 1];
  const percent = Number(p.percent) / 100;
  switch (event.type) {
    case "genre_surge":
      return { genre: { genre: String(p.genre), month: month(), factor: 1 + percent }, costs: {} };
    case "genre_slump":
      return { genre: { genre: String(p.genre), month: month(), factor: 1 - percent }, costs: {} };
    case "quiet_days":
      return { weekday: { weekday: WEEKDAYS.indexOf(String(p.weekday)), factor: 1 - percent }, costs: {} };
    case "author_fares":
      return { costs: { fare: Number(p.cost) } };
    case "format_costs":
      return { costs: { cogs: { format: String(p.format), rate: percent } } };
    case "quiet_quarter":
      return { costs: {} };
    default:
      throw new Error(`Unknown event type ${event.type}`);
  }
}

/** Whether the conditions change any order, as opposed to only costs. */
export const changesOrders = (c: Conditions) => c.genre !== undefined || c.weekday !== undefined;

/**
 * Each order's factor from the conditions: below 1 it's dropped with probability 1 − factor, above 1 it's
 * cloned with probability factor − 1, the daily noise's drop-or-clone. One draw per order, on its own stream.
 */
export function applyConditions(history: History, base: readonly Order[], seed: number, c: Conditions): Order[] {
  if (!changesOrders(c)) return [...base];
  const random = stream(seed, history.streamOf(streamName(history.quarter, "alma")));
  const orders: Order[] = [];
  for (const order of base) {
    let factor = 1;
    if (c.genre && order.day.slice(5, 7) === c.genre.month && order.items.some((i) => i.genre === c.genre!.genre)) factor *= c.genre.factor;
    if (c.weekday && new Date(`${order.day}T00:00:00Z`).getUTCDay() === c.weekday.weekday) factor *= c.weekday.factor;
    const r = random();
    if (factor < 1) {
      if (r < factor) orders.push(order);
    } else {
      orders.push(order);
      if (r < factor - 1) orders.push(cloneOrder(order));
    }
  }
  return orders;
}
