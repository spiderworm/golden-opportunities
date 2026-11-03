// Turns the player's question (InvestigateState) into the queries the screen
// draws, and returns only those results to the browser.
import { loadBookshop } from "~/bookshop/loader.server";
import {
  PRICE_BANDS,
  type Measure,
  type Query,
  type QueryResult,
  type QueryView,
} from "~/query/types";
import {
  DEFAULT_STATE,
  filtersExcept,
  heatWindow,
  TILE_MEASURES,
  type Filters,
  type InvestigateState,
  type TileMeasure,
} from "./state";

export type RunQuery = (query: Query, view: QueryView) => QueryResult;

export interface Tile {
  measure: TileMeasure;
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
  discount_rate: string[];
  /** Every award a book in the data has won. Not from a query: an award can filter but never group. */
  award: string[];
  /** Volume numbers ("1" to "7"), in order. */
  volume: string[];
  /** The price bands, cheapest first: every band, whether anything in it sold or not. */
  price_band: string[];
}

export interface Investigation {
  tiles: Tile[];
  /** The chart's first measure. */
  chart: QueryResult;
  /** The chart's other measures, in the order chosen: one query each, as the first. */
  also: QueryResult[];
  heatmap: QueryResult;
  /** One title's sales by month, when the player has drilled into a single title. */
  /** One title: its sales by month, and its ratings by stars (undated, so no other filter applies to them). */
  titleView: { title: string; result: QueryResult; ratings: QueryResult } | null;
  options: FilterOptions;
}

function values(result: QueryResult, key: keyof FilterOptions): string[] {
  return result.rows.map((row) => row[key]).filter((v): v is string => typeof v === "string");
}

/** Whether a quarter ("2193-Q3") holds any of the months ("2193-07"). No month filter means every quarter does. */
export function quarterHasMonths(quarter: string, months: readonly string[] | undefined): boolean {
  if (!months?.length) return true;
  const q = Number(quarter.slice(-1));
  return months.some(
    (m) => m.slice(0, 4) === quarter.slice(0, 4) && Math.ceil(Number(m.slice(5, 7)) / 3) === q,
  );
}

/**
 * Tiles report one quarter against the one before it: the latest quarter the
 * player has selected (or the latest visible one) that the month filter
 * allows. A quarter the month filter rules out isn't compared, since it would
 * read as a drop to zero; a real drop to zero under other filters still shows.
 */
export function buildTile(
  measure: TileMeasure,
  byQuarter: QueryResult,
  visibleQuarters: readonly string[],
  filters: Pick<Filters, "quarter" | "month"> = {},
): Tile {
  const selected = filters.quarter ?? [];
  const allowed = (q: string) => quarterHasMonths(q, filters.month);
  const candidates = visibleQuarters.filter(
    (q) => (!selected.length || selected.includes(q)) && allowed(q),
  );
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
  return {
    measure,
    quarter,
    previousQuarter,
    value: find(quarter),
    previous: find(previousQuarter),
  };
}

/** Spread into a query: the filter key only when there is one, never `filter: undefined`, which the engine rejects. */
function withFilter(filters: Filters): Pick<Query, "filter"> {
  return Object.keys(filters).length ? { filter: filters } : {};
}

function chartQuery(state: InvestigateState, measure: Measure = state.measure): Query {
  const by = state.compare ? ([state.by, "quarter"] as const) : ([state.by] as const);
  return { measure, by, ...withFilter(filtersExcept(state.filters, [state.by])) };
}
function heatmapQuery(state: InvestigateState, quarters: readonly string[]): Query {
  const { measure, rows, cols } = state.heat;
  // A long ledger shows its last eight quarters unless the player asks for every one (heatWindow).
  const window = heatWindow(state, quarters);
  return {
    measure,
    by: [rows, cols],
    ...withFilter({
      ...filtersExcept(state.filters, [rows, cols]),
      ...(window ? { quarter: window } : {}),
    }),
  };
}

export function investigate(
  state: InvestigateState,
  runQuery: RunQuery,
  view: QueryView,
  observe?: (query: Query, result: QueryResult) => void,
): Investigation {
  const displayed: { query: Query; result: QueryResult }[] = [];
  const rendered = (query: Query, defaultQuery?: Query) => {
    const result = runQuery(query, view);
    // A change to another panel does not make this panel's default view intentional.
    if (!defaultQuery || JSON.stringify(query) !== JSON.stringify(defaultQuery))
      displayed.push({ query, result });
    return result;
  };
  const run = (query: Query) => runQuery(query, view);
  const option = (dimension: keyof FilterOptions) =>
    values(run({ measure: "units", by: [dimension] }), dimension);
  const options: FilterOptions = {
    // The periods the server lets the player see, not the ones that happen to have sales.
    quarter: [...view.periods].sort(),
    genre: option("genre"),
    format: option("format"),
    publisher: option("publisher"),
    discount_rate: option("discount_rate"),
    award: [...new Set(loadBookshop().awards.map((a) => a.name))].sort(),
    volume: option("volume").sort((a, b) => Number(a) - Number(b)),
    price_band: [...PRICE_BANDS],
  };

  const tileFilter = withFilter(filtersExcept(state.filters, ["quarter"]));
  const tiles = TILE_MEASURES.map((measure) =>
    buildTile(
      measure,
      run({ measure, by: ["quarter"], ...tileFilter }),
      options.quarter,
      state.filters,
    ),
  );

  const chart = rendered(chartQuery(state), chartQuery(DEFAULT_STATE));
  // The other measures are views the player chose, so they count as shown, like any other chart.
  const also = state.also.map((measure) => rendered(chartQuery(state, measure)));
  // Always-visible context, never discovery evidence (m1-slice section 5).
  const heatmap = run(heatmapQuery(state, view.periods));

  const title = state.filters.title?.length === 1 ? state.filters.title[0]! : null;
  const titleView = title
    ? {
        title,
        result: rendered({
          measure: state.measure,
          by: ["month"],
          ...withFilter(filtersExcept(state.filters, ["month"])),
        }),
        // The ratings aren't dated or sold, so only the title scopes them. Context, like the heatmap: not
        // discovery evidence.
        ratings: run({ measure: "ratings", by: ["stars"], filter: { title: [title] } }),
      }
    : null;

  for (const { query, result } of displayed) observe?.(query, result);
  return { tiles, chart, also, heatmap, titleView, options };
}
