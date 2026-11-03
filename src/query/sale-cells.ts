// Sale lines rolled up at the grain queries can tell apart (docs/design/rollups.md): every sales dimension comes
// from the edition, the month, the weekday and the discount, so lines that share those give the same facts. Each
// cell keeps one of its lines as its sample, for the dimensions, and how many lines and distinct orders it holds.
// An order sits on one date (Sim, #251), so its lines share a month and weekday; the orders that span several
// cells (several editions, or one at two discounts) are kept, so distinct orders stay exact for any group.
// Each order's lines per cell are kept too, so the spread of order totals is exact for any group (Sim, evidence).

import type { DeepReadonly, SaleLine } from "../bookshop/types";

export interface SaleCell {
  /** One of the cell's lines: every line in the cell has its dimensions. */
  line: DeepReadonly<SaleLine>;
  /** How many lines the cell holds. */
  lines: number;
  /** How many distinct orders have a line in it. */
  orders: number;
  /**
   * The sum over those orders of their lines in it, squared. Every line in a cell has the same revenue, so an order
   * held in one cell totals its lines times that, and these give the sum of its orders' totals squared.
   */
  squares: number;
}

export interface SaleCells {
  cells: readonly SaleCell[];
  /** Each order with lines in more than one cell, as the indexes of its cells. */
  spanning: readonly (readonly number[])[];
  /** Each spanning order's lines in each of its cells, in `spanning`'s order. */
  spanningLines: readonly (readonly number[])[];
  /** How many lines were rolled up. */
  lines: number;
}

const WEEKDAY = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Rolls sale lines up into cells, one per edition, list price, month, weekday and discount. */
export function rollUpSales(sales: readonly DeepReadonly<SaleLine>[]): SaleCells {
  const index = new Map<string, number>();
  const cells: { line: DeepReadonly<SaleLine>; lines: number; orders: Set<string> }[] = [];
  const orderCells = new Map<string, Map<number, number>>();
  for (const sale of sales) {
    const key = `${sale.isbn}\0${sale.listPrice}\0${sale.date.slice(0, 7)}\0${WEEKDAY(sale.date)}\0${sale.discount}`;
    let at = index.get(key);
    if (at === undefined) {
      at = cells.length;
      index.set(key, at);
      cells.push({ line: sale, lines: 0, orders: new Set() });
    }
    const cell = cells[at]!;
    cell.lines++;
    cell.orders.add(sale.orderId);
    let touched = orderCells.get(sale.orderId);
    if (!touched) orderCells.set(sale.orderId, (touched = new Map()));
    touched.set(at, (touched.get(at) ?? 0) + 1);
  }
  const squares = cells.map(() => 0);
  const spanning: number[][] = [];
  const spanningLines: number[][] = [];
  for (const touched of orderCells.values()) {
    for (const [at, lines] of touched) squares[at]! += lines * lines;
    if (touched.size > 1) {
      spanning.push([...touched.keys()]);
      spanningLines.push([...touched.values()]);
    }
  }
  return {
    cells: cells.map(({ line, lines, orders }, at) => ({
      line,
      lines,
      orders: orders.size,
      squares: squares[at]!,
    })),
    spanning,
    spanningLines,
    lines: sales.length,
  };
}

/**
 * Several quarters' cells as one: their cells in order, each quarter's spanning orders numbered on from the
 * quarters before it. An order sits on one date, so it never spans quarters, and no order spans two parts.
 */
export function mergeCells(parts: readonly SaleCells[]): SaleCells {
  const cells: SaleCell[] = [];
  const spanning: number[][] = [];
  const spanningLines: (readonly number[])[] = [];
  let lines = 0;
  for (const part of parts) {
    const offset = cells.length;
    cells.push(...part.cells);
    for (const touched of part.spanning) spanning.push(touched.map((at) => offset + at));
    spanningLines.push(...part.spanningLines);
    lines += part.lines;
  }
  return { cells, spanning, spanningLines, lines };
}
