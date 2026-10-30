// Turns the player's question (InvestigateState) into the queries the screen
// draws, and returns only those results to the browser.
import type { Query, QueryResult, QueryView } from "~/query/types";
import { CHART_MEASURES, filtersExcept, type ChartMeasure, type Filters, type InvestigateState } from "./state";

export type RunQuery = (query: Query, view: QueryView) => QueryResult;

export interface Tile {
  measure: ChartMeasure;
  /** The quarter the tile reports, e.g. "2193-Q4"; null when nothing is visible. */
  quarter: string | null;
  previousQuarter: string | null;
  value: number | null;
  previous: number | null;
}

export interface FilterOptions {
  quarter: string[];
  genre: string[];
  format: string[];
  publisher: string[];
}

export interface Investigation {
  tiles: Tile[];
  chart: QueryResult;
  heatmap: QueryResult;
  options: FilterOptions;
}

function values(result: QueryResult, key: keyof FilterOptions): string[] {
  return result.rows.map((row) => row[key]).filter((v): v is string => typeof v === "string");
}

/** Whether a quarter ("2193-Q3") holds any of the months ("07"). No month filter means every quarter does. */
export function quarterHasMonths(quarter: string, months: readonly string[] | undefined): boolean {
  if (!months?.length) return true;
  const q = Number(quarter.slice(-1));
  return months.some((m) => Math.ceil(Number(m) / 3) === q);
}

/**
 * Tiles report one quarter against the one before it: the latest quarter the
 * player has selected (or the latest visible one) that the month filter
 * allows. A quarter the month filter rules out isn't compared, since it would
 * read as a drop to zero; a real drop to zero under other filters still shows.
 */
export function buildTile(
  measure: ChartMeasure,
  byQuarter: QueryResult,
  visibleQuarters: readonly string[],
  filters: Pick<Filters, "quarter" | "month"> = {},
): Tile {
  const selected = filters.quarter ?? [];
  const allowed = (q: string) => quarterHasMonths(q, filters.month);
  const candidates = visibleQuarters.filter((q) => (!selected.length || selected.includes(q)) && allowed(q));
  const quarter = candidates.at(-1) ?? null;
  const index = quarter ? visibleQuarters.indexOf(quarter) : -1;
  const before = index > 0 ? visibleQuarters[index - 1]! : null;
  const previousQuarter = before && allowed(before) ? before : null;
  const find = (q: string | null) => {
    if (!q) return null;
    const row = byQuarter.rows.find((r) => r.quarter === q);
    // A visible quarter with no matching facts is a real zero for totals.
    return row ? (row[measure] ?? null) : measure === "avg_discount" ? null : 0;
  };
  return { measure, quarter, previousQuarter, value: find(quarter), previous: find(previousQuarter) };
}

function toQueryFilter(filters: Filters): Query["filter"] {
  return Object.keys(filters).length ? filters : undefined;
}

export function investigate(state: InvestigateState, runQuery: RunQuery, view: QueryView): Investigation {
  const run = (query: Query) => runQuery(query, view);
  const option = (dimension: keyof FilterOptions) => values(run({ measure: "units", by: [dimension] }), dimension);
  const options: FilterOptions = {
    quarter: option("quarter"),
    genre: option("genre"),
    format: option("format"),
    publisher: option("publisher"),
  };

  const tileFilter = toQueryFilter(filtersExcept(state.filters, ["quarter"]));
  const tiles = CHART_MEASURES.map((measure) =>
    buildTile(measure, run({ measure, by: ["quarter"], filter: tileFilter }), options.quarter, state.filters),
  );

  const chartBy = state.compare ? ([state.by, "quarter"] as const) : ([state.by] as const);
  const chart = run({ measure: state.measure, by: chartBy, filter: toQueryFilter(filtersExcept(state.filters, [state.by])) });
  const heatmap = run({
    measure: state.measure,
    by: ["weekday", "month"],
    filter: toQueryFilter(filtersExcept(state.filters, ["weekday", "month"])),
  });

  return { tiles, chart, heatmap, options };
}
