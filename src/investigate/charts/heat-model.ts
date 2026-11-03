import { PRICE_BANDS, type QueryResult } from "~/query/types";
import { isTotal, monthsInScope, type ChartMeasure, type Filters, type HeatDimension } from "../state";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface HeatModel {
  rows: (string | null)[];
  cols: (string | null)[];
  /** [colIndex, rowIndex, value] */
  cells: [number, number, number | null][];
  min: number;
  max: number;
}

/**
 * An axis's values, in reading order. Weekdays, the months and quarters in scope, and the price bands are always
 * all there, sold or not, so a quiet one reads as zero. Anything else is what the data has, in order, an unknown
 * value last.
 */
export function heatAxis(dimension: HeatDimension, result: QueryResult, quarters: readonly string[], filters: Filters): (string | null)[] {
  if (dimension === "weekday") return WEEKDAYS;
  if (dimension === "month") return monthsInScope(quarters, filters.quarter);
  if (dimension === "quarter") return [...(filters.quarter?.length ? quarters.filter((q) => filters.quarter!.includes(q)) : quarters)];
  if (dimension === "price_band") return [...PRICE_BANDS];
  const values = [...new Set(result.rows.map((r) => r[dimension] ?? null))];
  const known = values.filter((v): v is string => v !== null);
  known.sort(dimension === "discount_rate" ? (a, b) => parseFloat(a) - parseFloat(b) : (a, b) => a.localeCompare(b));
  return values.includes(null) ? [...known, null] : known;
}

/** Every row and column value gets a cell. A total that sold nothing is zero; an average there has no value. */
export function heatModel(result: QueryResult, measure: ChartMeasure, rowsBy: HeatDimension, rows: readonly (string | null)[], colsBy: HeatDimension, cols: readonly (string | null)[]): HeatModel {
  const cells: HeatModel["cells"] = [];
  cols.forEach((col, x) =>
    rows.forEach((row, y) => {
      const found = result.rows.find((r) => (r[colsBy] ?? null) === col && (r[rowsBy] ?? null) === row);
      cells.push([x, y, found ? (found[measure] ?? null) : isTotal(measure) ? 0 : null]);
    }),
  );
  const values = cells.map((c) => c[2]).filter((v): v is number => v !== null);
  return { rows: [...rows], cols: [...cols], cells, min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 };
}

/** A cell is in the selection when it matches every filter set on the heatmap's two dimensions. */
export function cellSelected(filters: Filters, rowsBy: HeatDimension, row: string | null, colsBy: HeatDimension, col: string | null): boolean {
  const matches = (d: HeatDimension, v: string | null) => !filters[d] || (v !== null && filters[d]!.includes(v));
  return matches(rowsBy, row) && matches(colsBy, col);
}
