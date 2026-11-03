// Sale lines rolled up at the grain queries can tell apart (docs/design/rollups.md): every sales dimension comes
// from the edition, the month, the weekday and the discount, so lines that share those give the same facts. Each
// cell keeps one of its lines as its sample, for the dimensions, and how many lines and distinct orders it holds.
// An order sits on one date (Sim, #251), so its lines share a month and weekday; the orders that span several
// cells (several editions, or one at two discounts) are kept, so distinct orders stay exact for any group.

import type { DeepReadonly, SaleLine } from '../bookshop/types';

export interface SaleCell {
  /** One of the cell's lines: every line in the cell has its dimensions. */
  line: DeepReadonly<SaleLine>;
  /** How many lines the cell holds. */
  lines: number;
  /** How many distinct orders have a line in it. */
  orders: number;
}

export interface SaleCells {
  cells: readonly SaleCell[];
  /** Each order with lines in more than one cell, as the indexes of its cells. */
  spanning: readonly (readonly number[])[];
  /** How many lines were rolled up. */
  lines: number;
}

const WEEKDAY = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Rolls sale lines up into cells, one per edition, list price, month, weekday and discount. */
export function rollUpSales(sales: readonly DeepReadonly<SaleLine>[]): SaleCells {
  const index = new Map<string, number>();
  const cells: { line: DeepReadonly<SaleLine>; lines: number; orders: Set<string> }[] = [];
  const orderCells = new Map<string, Set<number>>();
  for (const sale of sales) {
    const key = `${sale.isbn}\0${sale.listPrice}\0${sale.date.slice(0, 7)}\0${WEEKDAY(sale.date)}\0${sale.discount}`;
    let at = index.get(key);
    if (at === undefined) { at = cells.length; index.set(key, at); cells.push({ line: sale, lines: 0, orders: new Set() }); }
    const cell = cells[at]!;
    cell.lines++;
    cell.orders.add(sale.orderId);
    let touched = orderCells.get(sale.orderId);
    if (!touched) orderCells.set(sale.orderId, (touched = new Set()));
    touched.add(at);
  }
  const spanning = [...orderCells.values()].filter(touched => touched.size > 1).map(touched => [...touched]);
  return { cells: cells.map(({ line, lines, orders }) => ({ line, lines, orders: orders.size })), spanning, lines: sales.length };
}
