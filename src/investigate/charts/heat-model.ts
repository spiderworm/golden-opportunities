import type { QueryResult } from "~/query/types";
import { isTotal, type ChartMeasure, type Filters } from "../state";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface HeatModel {
  months: string[];
  /** [monthIndex, weekdayIndex, value] */
  cells: [number, number, number | null][];
  min: number;
  max: number;
}

/** Every month in scope gets a column, and every weekday a row, whether anything sold or not. */
export function heatModel(result: QueryResult, measure: ChartMeasure, months: readonly string[]): HeatModel {
  const cells: HeatModel["cells"] = [];
  months.forEach((month, x) =>
    WEEKDAYS.forEach((weekday, y) => {
      const row = result.rows.find((r) => r.month === month && r.weekday === weekday);
      cells.push([x, y, row ? (row[measure] ?? null) : isTotal(measure) ? 0 : null]);
    }),
  );
  const values = cells.map((c) => c[2]).filter((v): v is number => v !== null);
  return { months: [...months], cells, min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 };
}

/** A cell is in the selection when it matches every weekday/month filter that's set. */
export function cellSelected(filters: Filters, weekday: string, month: string): boolean {
  return (!filters.weekday || filters.weekday.includes(weekday)) && (!filters.month || filters.month.includes(month));
}
