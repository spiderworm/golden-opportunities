// The M1 model (docs/design/m1-slice.md section 4; the order rules are in
// docs/design/scoring.md, "M1's reduced report card"): a quarter of 2194
// replays the same quarter of 2193, without 2193's Books of the Month, then
// each option pulls its levers. M1 plays Q1; every function takes the quarter.
import type { BookshopData, DeepReadonly, SaleLine } from "~/bookshop/types";
import { cloneOrder, itemOf, ordersOf, type Item, type Order } from "./orders";
import { integer, pick, roundRandomly, sampleIndexes, stream, weightedIndex, type Random } from "./random";
import { has } from "./plan";
import type { Plan } from "./types";

export const YEAR = 2194;
export const HISTORY_YEAR = 2193;
export type QuarterNumber = 1 | 2 | 3 | 4;
/** Q1's months, January to March. */
export const MONTHS = ["01", "02", "03"] as const;
/** A quarter's three months, as MM. */
export const monthsOf = (quarter: QuarterNumber): string[] =>
  [0, 1, 2].map((i) => String(3 * (quarter - 1) + i + 1).padStart(2, "0"));
/**
 * A seeded stream's name in a quarter. Q1 keeps M1's names, so its draws never
 * change; later quarters draw from their own streams.
 */
export const streamName = (quarter: QuarterNumber, name: string) => (quarter === 1 ? name : `q${quarter}:${name}`);
export const PICK_DISCOUNT = 0.15;
export const SALE_DISCOUNT = 0.15;
/** The share of orders a station-wide sale clones (*assumed*). */
export const SALE_RESPONSE = 0.2;
export const NOISE = 0.03;
export const EVENT_NIGHTS = 12;
export const EVENT_ORDERS = { min: 30, max: 70 } as const;

/** Extra copies each 2193 Book of the Month sold, January to December (m1-slice section 2). */
export const OBSERVED_EXTRAS = [43, 55, 58, 57, 19, 44, 62, 56, 36, 37, 34, 173] as const;

interface PickSpec {
  title: string;
  format: string;
}
const MALLEMAROKING = { title: "The Mallemaroking", format: "Mass market paperback" };
const RYSTWYTH = { title: "Rystwyth", format: "Hardcover" };
const PORTMEIRION = { title: "Portmeirion", format: "Mass market paperback" };
/** January to March 2194. */
export const SCHEDULED_PICKS: readonly PickSpec[] = [MALLEMAROKING, RYSTWYTH, PORTMEIRION];
export const QUIET_PICKS: readonly PickSpec[] = [
  { title: "Kalakalal Avenue", format: "Hardcover" },
  { title: "Can I Be Honest?", format: "Hardcover" },
  { title: "Who Did You Think You Were Kidding?", format: "Hardcover" },
];

const DAY = 86_400_000;
const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);
const timeOf = (day: string) => Date.parse(`${day}T00:00:00Z`);
const monthOf = (day: string) => day.slice(5, 7);

/** Every day of a quarter (Q1 by default) in a year. */
export function quarterDays(year: number, quarter: QuarterNumber = 1): string[] {
  const days: string[] = [];
  const first = 3 * (quarter - 1);
  for (let t = Date.UTC(year, first, 1); t < Date.UTC(year, first + 3, 1); t += DAY) days.push(dayOf(t));
  return days;
}

/** The 2193 day a 2194 day replays: 364 days earlier (same weekday), a week further back if that leaves the month. */
export function replayedDay(day: string): string {
  const back = dayOf(timeOf(day) - 364 * DAY);
  return monthOf(back) === monthOf(day) ? back : dayOf(timeOf(day) - 371 * DAY);
}

export interface History {
  quarter: QuarterNumber;
  /** The quarter's three months, as MM. */
  months: readonly string[];
  /** The quarter of 2193 as it was sold. */
  lastYear: readonly DeepReadonly<SaleLine>[];
  /** A sale line for each edition sold in 2193. */
  template: (isbn: string) => DeepReadonly<SaleLine>;
  isbnOf: (spec: PickSpec) => string;
  /** The 2193 Book of the Month edition, by month (01 to 12). */
  observedPick: (month: string) => string;
}

export function historyOf(data: DeepReadonly<BookshopData>, quarter: QuarterNumber = 1): History {
  const months = monthsOf(quarter);
  const [from, to] = [`${HISTORY_YEAR}-${months[0]}-01`, quarter === 4 ? `${HISTORY_YEAR + 1}-01-01` : `${HISTORY_YEAR}-${monthsOf((quarter + 1) as QuarterNumber)[0]}-01`];
  const templates = new Map<string, DeepReadonly<SaleLine>>();
  const picks = new Map<string, Set<string>>();
  for (const line of data.saleLines) {
    if (!templates.has(line.isbn)) templates.set(line.isbn, line);
    if (line.discount === PICK_DISCOUNT) {
      const month = monthOf(line.date);
      picks.set(month, (picks.get(month) ?? new Set()).add(line.isbn));
    }
  }
  return {
    quarter,
    months,
    lastYear: data.saleLines.filter((l) => l.date >= from && l.date < to),
    template: (isbn) => {
      const line = templates.get(isbn);
      if (!line) throw new Error(`No 2193 sale of edition ${isbn}`);
      return line;
    },
    isbnOf: ({ title, format }) => {
      const book = data.joinedBooks.find((b) => b.title === title);
      const edition = book?.editions.find((e) => e.format === format);
      if (!edition) throw new Error(`No ${format} edition of ${title}`);
      return edition.isbn;
    },
    observedPick: (month) => {
      const isbns = [...(picks.get(month) ?? [])];
      if (isbns.length !== 1) throw new Error(`Expected one Book of the Month in month ${month}, found ${isbns.length}`);
      return isbns[0];
    },
  };
}

/** The quarter of 2193 without its Books of the Month: the extra copies removed, the rest back at full price. */
export function unpromoted(history: History, seed: number): Order[] {
  const removed = new Set<DeepReadonly<SaleLine>>();
  const restored = new Set<DeepReadonly<SaleLine>>();
  history.months.forEach((month) => {
    const isbn = history.observedPick(month);
    const lines = history.lastYear.filter((l) => l.isbn === isbn && monthOf(l.date) === month);
    const random = stream(seed, `unpromote:${month}`);
    const out = new Set(sampleIndexes(random, lines.length, OBSERVED_EXTRAS[Number(month) - 1]));
    lines.forEach((line, i) => (out.has(i) ? removed : restored).add(line));
  });
  // An order left empty disappears.
  return ordersOf(history.lastYear.filter((l) => !removed.has(l))).map((order) => ({
    ...order,
    items: order.items.map((item) =>
      restored.has(item.template) && item.discount === PICK_DISCOUNT ? { ...item, discount: 0 } : item,
    ),
  }));
}

/** The quarter of 2194 as it would go with no Book of the Month: each day replays its 2193 day, with ±3% noise on orders. */
export function baseline(history: History, seed: number): Order[] {
  const byDay = new Map<string, Order[]>();
  for (const order of unpromoted(history, seed)) byDay.set(order.day, [...(byDay.get(order.day) ?? []), order]);
  const random = stream(seed, streamName(history.quarter, "noise"));
  const orders: Order[] = [];
  for (const day of quarterDays(YEAR, history.quarter)) {
    const source = byDay.get(replayedDay(day)) ?? [];
    const factor = 1 - NOISE + 2 * NOISE * random();
    const target = roundRandomly(random, source.length * factor);
    const kept = target < source.length ? sampleIndexes(random, source.length, target).map((i) => source[i]) : [...source];
    while (kept.length < target) kept.push(pick(random, source));
    orders.push(...kept.map((o) => cloneOrder(o, { day })));
  }
  return orders;
}

/** Tuesday to Thursday of each week of a quarter of 2194 that has one: 13 weeks in Q1. */
export function eventWeeks(quarter: QuarterNumber = 1): string[][] {
  const weeks = new Map<number, string[]>();
  for (const day of quarterDays(YEAR, quarter)) {
    const weekday = new Date(timeOf(day)).getUTCDay();
    if (weekday < 2 || weekday > 4) continue;
    const monday = Math.floor((timeOf(day) - ((weekday + 6) % 7) * DAY) / DAY);
    weeks.set(monday, [...(weeks.get(monday) ?? []), day]);
  }
  return [...weeks.values()];
}

export interface Run {
  orders: Order[];
  /** The edition featured each month of the quarter, or null for none. */
  picks: readonly (string | null)[];
  /** Author nights held, by day, with the orders each added. */
  nights: { day: string; orders: number }[];
}

export interface Levers {
  /** Each month's Book of the Month, or null for none. */
  picks: readonly (PickSpec | null)[];
  /** Share of orders a station-wide sale clones, or null for no sale. */
  sale: number | null;
  events: boolean;
}

export function leversFor(plan: Plan, saleResponse = SALE_RESPONSE): Levers {
  return {
    picks: has(plan, "repick") ? QUIET_PICKS : SCHEDULED_PICKS,
    sale: has(plan, "sale") ? saleResponse : null,
    events: has(plan, "events"),
  };
}

/**
 * Pulls the levers on the baseline, in a fixed order: author nights, then the
 * Books of the Month, then the sale. Each lever draws from its own stream, so
 * plans share every draw they have in common.
 */
export function run(history: History, base: readonly Order[], seed: number, levers: Levers): Run {
  const orders = base.map((o) => cloneOrder(o));

  const nights: Run["nights"] = [];
  if (levers.events) {
    const random = stream(seed, streamName(history.quarter, "events"));
    const weeks = eventWeeks(history.quarter);
    for (const w of sampleIndexes(random, weeks.length, EVENT_NIGHTS)) {
      const day = pick(random, weeks[w]);
      const count = integer(random, EVENT_ORDERS.min, EVENT_ORDERS.max);
      const sameDay = base.filter((o) => o.day === day);
      // A guard: a Tuesday to Thursday with no 2193 sales draws from the whole quarter.
      const pool = sameDay.length > 0 ? sameDay : base;
      for (let i = 0; i < count; i++) orders.push(cloneOrder(pick(random, pool), { day, kind: "event" }));
      nights.push({ day, orders: count });
    }
  }

  const picks = levers.picks.map((spec) => (spec ? history.isbnOf(spec) : null));
  history.months.forEach((month, m) => {
    const isbn = picks[m];
    if (isbn === null) return;
    for (const order of orders)
      if (monthOf(order.day) === month) for (const item of order.items) if (item.isbn === isbn) item.discount = PICK_DISCOUNT;
    // Scheduled and re-picked titles draw the same count and days from the same stream; only the title differs.
    const random = stream(seed, `pick-extra:${month}`);
    const extra = pick(random, OBSERVED_EXTRAS);
    const days = quarterDays(YEAR, history.quarter).filter((d) => monthOf(d) === month);
    const weights = days.map((d) => base.filter((o) => o.day === d).length);
    const template = history.template(isbn);
    for (let i = 0; i < extra; i++) {
      const item: Item = { ...itemOf(template), discount: PICK_DISCOUNT };
      orders.push({ day: days[weightedIndex(random, weights)], items: [item], kind: "pick-extra" });
    }
  });

  if (levers.sale !== null) {
    const random = stream(seed, streamName(history.quarter, "sale"));
    // One draw per order, so a larger response clones a superset of a smaller one's orders.
    // Clones keep their kind: an author night's clone is still an author-night visit.
    const clones = orders.filter(() => random() < levers.sale!).map((o) => cloneOrder(o, { saleClone: true }));
    orders.push(...clones);
    // The sale's 15% replaces every discount, the picks' included.
    for (const order of orders) for (const item of order.items) item.discount = SALE_DISCOUNT;
  }

  return { orders, picks, nights };
}
