// How each measure is computed (docs/design/scoring.md, "M1's reduced report card").
// The same recipe runs on 2193's real orders and on every simulated quarter.
import type { BookshopData, DeepReadonly } from "~/bookshop/types";
import type { MeasureId } from "./types";
import type { Order } from "./orders";
import { RELEASE } from "./release";

export const COST_OF_GOODS = 0.6;
export const EVENT_COST = 200;
export const GENRES = 8;
/** Happiness added to an author-night visit: readers enjoy the night out. */
export const EVENT_HAPPINESS = 20;
/** Culture per extra order at an author night: one attendee who bought a book. */
export const CULTURE_PER_ATTENDEE = 1.2;

export interface Ratings {
  /** A title's average over every rating, by book ID. */
  average: (bookId: string) => number;
  /** The title's hidden culture value. */
  culture: (bookId: string) => number;
}

/** Rating stretched across the scale: 3.0 and below is 0, 4.7 and above is 1. */
const stretch = (rating: number) => Math.min(1, Math.max(0, (rating - 3.0) / 1.7));

export function ratingsOf(history: DeepReadonly<BookshopData>): Ratings {
  const sums = new Map<string, { total: number; count: number }>();
  for (const r of history.ratings) {
    const s = sums.get(r.bookId) ?? { total: 0, count: 0 };
    s.total += r.rating;
    s.count += 1;
    sums.set(r.bookId, s);
  }
  const all =
    history.ratings.reduce((t, r) => t + r.rating, 0) / Math.max(1, history.ratings.length);
  const awards = new Map(history.joinedBooks.map((b) => [b.id, b.awards.length]));
  // A guard only: every title sold in 2193 has ratings. The new volume is rated like volume 2.
  const average = (bookId: string) => {
    const s = sums.get(bookId === RELEASE.book.id ? RELEASE.ratedLike : bookId);
    return s ? s.total / s.count : all;
  };
  return {
    average,
    culture: (bookId) => 1 + 9 * stretch(average(bookId)) + 3 * (awards.get(bookId) ?? 0),
  };
}

/** What an event changes about costs (endless.md section 2): the author-night fare, and one format's cost of goods. */
export interface Costs {
  fare?: number;
  cogs?: { format: string; rate: number };
}

export interface Ledger {
  revenue: number;
  units: number;
  orders: number;
  costOfGoods: number;
  eventCosts: number;
  grossProfit: number;
}

export function ledger(orders: readonly Order[], events = 0, costs: Costs = {}): Ledger {
  let revenue = 0;
  let list = 0;
  // List price of the format whose cost an event changed: summed apart, so the usual sum is unchanged.
  let changed = 0;
  let units = 0;
  for (const order of orders)
    for (const item of order.items) {
      revenue += item.listPrice * (1 - item.discount);
      if (costs.cogs && item.template.format === costs.cogs.format) changed += item.listPrice;
      else list += item.listPrice;
      units += 1;
    }
  const costOfGoods = COST_OF_GOODS * list + (costs.cogs ? costs.cogs.rate * changed : 0);
  const eventCosts = (costs.fare ?? EVENT_COST) * events;
  return {
    revenue,
    units,
    orders: orders.length,
    costOfGoods,
    eventCosts,
    grossProfit: revenue - costOfGoods - eventCosts,
  };
}

/** One visit is one order: Quality and Value only in M1 (Comfort and Found it arrive in M2), plus the night out. */
export function orderHappiness(order: Order, ratings: Ratings): number {
  const n = order.items.length;
  const rating = order.items.reduce((t, i) => t + ratings.average(i.bookId), 0) / n;
  const discount = order.items.reduce((t, i) => t + i.discount, 0) / n;
  const quality = 100 * stretch(rating);
  const value = 50 + 50 * (1 - Math.exp(-discount / 0.075));
  return Math.min(
    100,
    0.6 * quality + 0.4 * value + (order.kind === "event" ? EVENT_HAPPINESS : 0),
  );
}

export function happiness(orders: readonly Order[], ratings: Ratings): number {
  if (orders.length === 0) return 50;
  return orders.reduce((t, o) => t + orderHappiness(o, ratings), 0) / orders.length;
}

/** Each title counts once a day, times that day's genre spread; author nights add their attendance. */
export function culture(orders: readonly Order[], ratings: Ratings, eventOrders = 0): number {
  const days = new Map<string, { titles: Set<string>; genres: Set<string> }>();
  for (const order of orders) {
    let day = days.get(order.day);
    if (!day) days.set(order.day, (day = { titles: new Set(), genres: new Set() }));
    for (const item of order.items) {
      day.titles.add(item.bookId);
      if (item.genre) day.genres.add(item.genre);
    }
  }
  let total = 0;
  for (const day of days.values()) {
    let titles = 0;
    for (const id of day.titles) titles += ratings.culture(id);
    total += (titles * day.genres.size) / GENRES;
  }
  return total + CULTURE_PER_ATTENDEE * eventOrders;
}

export function measures(
  orders: readonly Order[],
  ratings: Ratings,
  events = 0,
  eventOrders = 0,
  costs: Costs = {},
): Record<MeasureId, number> {
  return {
    profit: ledger(orders, events, costs).grossProfit,
    readers: orders.length,
    happiness: happiness(orders, ratings),
    culture: culture(orders, ratings, eventOrders),
  };
}
