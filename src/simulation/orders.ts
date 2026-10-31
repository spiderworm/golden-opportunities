// The simulation works in orders (one order is one visit) and turns them into
// sale lines only at the end.
import type { DeepReadonly, SaleLine } from "~/bookshop/types";
import type { SimulatedLine } from "./types";

export interface Item {
  isbn: string;
  bookId: string;
  genre: string | null;
  listPrice: number;
  discount: number;
  /** A real sale line of the same edition, for its joined catalog fields. */
  template: DeepReadonly<SaleLine>;
}

export type OrderKind = "replay" | "pick-extra" | "event";

export interface Order {
  /** YYYY-MM-DD */
  day: string;
  items: Item[];
  kind: OrderKind;
  /** A visit the station-wide sale brought in. */
  saleClone?: boolean;
}

export const itemOf = (line: DeepReadonly<SaleLine>): Item => ({
  isbn: line.isbn,
  bookId: line.book.id,
  genre: line.genre,
  listPrice: line.listPrice,
  discount: line.discount,
  template: line,
});

export const cloneOrder = (order: Order, changes: Partial<Order> = {}): Order => ({
  ...order,
  items: order.items.map((i) => ({ ...i })),
  ...changes,
});

/** Real sale lines grouped into their orders, in the order they first appear. */
export function ordersOf(lines: readonly DeepReadonly<SaleLine>[]): Order[] {
  const byId = new Map<string, Order>();
  for (const line of lines) {
    let order = byId.get(line.orderId);
    if (!order) byId.set(line.orderId, (order = { day: line.date, items: [], kind: "replay" }));
    order.items.push(itemOf(line));
  }
  return [...byId.values()];
}

/** Sale lines in the query layer's shape, numbered by day, then by order. Ids after Q1 name their quarter. */
export function linesOf(orders: readonly Order[], year: number, quarter = 1): SimulatedLine[] {
  const [tag, short] = quarter === 1 ? [`${year}`, `${year}`] : [`${year}-q${quarter}`, `${year}Q${quarter}`];
  const sorted = orders.map((order, index) => ({ order, index })).sort((a, b) => (a.order.day < b.order.day ? -1 : a.order.day > b.order.day ? 1 : a.index - b.index));
  const lines: SimulatedLine[] = [];
  sorted.forEach(({ order }, o) => {
    const orderId = `S${short}-${String(o + 1).padStart(6, "0")}`;
    for (const item of order.items) {
      const n = lines.length + 1;
      const month = Number(order.day.slice(5, 7));
      lines.push({
        ...item.template,
        id: `sim-${tag}:${n}`,
        sourceSheet: "simulation",
        sourceRow: n,
        date: order.day,
        quarter: Math.floor((month - 1) / 3) + 1,
        discount: item.discount,
        itemId: `I${short}-${String(n).padStart(6, "0")}`,
        orderId,
        revenue: item.listPrice * (1 - item.discount),
      });
    }
  });
  return lines;
}
