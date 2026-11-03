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
import { isRelativeQuarter, resolveQuarters } from "~/query/relative";
import { droveQuery, waterfall, type DroveRows, type PeriodRows } from "~/query/decompose";
import {
  DEFAULT_STATE,
  droveBlock,
  droveQuarters,
  filtersExcept,
  heatWindow,
  lastYearBlock,
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
  /**
   * "What drove the change": each of the two quarters' revenue and units by the breakdown, as plain queries
   * (src/query/decompose.ts), with the quarters; null unless it's on and droveBlock allows it.
   */
  drove: DroveRows | null;
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

function chartQuery(
  state: InvestigateState,
  measure: Measure = state.measure,
  quarters: readonly string[] = [],
): Query {
  const by = state.compare ? ([state.by, "quarter"] as const) : ([state.by] as const);
  const vs = state.lastYear && !lastYearBlock(state, quarters) ? { vs: "last_year" as const } : {};
  return { measure, by, ...withFilter(filtersExcept(state.filters, [state.by])), ...vs };
}
/**
 * The waterfall's queries: revenue and units by the breakdown in each quarter, with the chart's other filters. Plain
 * queries, at the row limit's most, so a group that sold in one quarter only is still there. It's a view the player
 * turns on, so its bars are discovery evidence, but only the groups drawn as their own bars: those folded into
 * "Everything else" aren't, as rows a limit cuts aren't. The split shows no new figure, so units are context (Plot,
 * #335).
 */
function droveRows(
  state: InvestigateState,
  view: QueryView,
  shown: (query: Query, result: QueryResult) => void,
  run: (query: Query) => QueryResult,
): Investigation["drove"] {
  if (!state.drove || droveBlock(state, view.periods)) return null;
  const pair = droveQuarters(state, view.periods)!;
  const others = filtersExcept(state.filters, [state.by, "quarter"]);
  const rows = (quarter: string): PeriodRows => ({
    revenue: run(droveQuery(state.by, others, quarter, "revenue")),
    ...(state.split ? { units: run(droveQuery(state.by, others, quarter, "units")) } : {}),
  });
  const thenRows = rows(pair.then);
  const nowRows = rows(pair.now);
  // The groups drawn as their own bars, exactly as the chart chooses them (the same waterfall, the same top).
  const drawn = new Set(waterfall(state.by, thenRows, nowRows).groups.map((g) => g.key));
  for (const [quarter, period] of [
    [pair.then, thenRows],
    [pair.now, nowRows],
  ] as const)
    shown(
      droveQuery(state.by, others, quarter, "revenue"),
      onlyRows(period.revenue, (row) => drawn.has(row[state.by] ?? null)),
    );
  return { ...pair, thenRows, nowRows };
}

/** A result with only the rows kept, and their evidence with them. */
function onlyRows(result: QueryResult, keep: (row: QueryResult["rows"][number]) => boolean) {
  const at = result.rows.flatMap((row, i) => (keep(row) ? [i] : []));
  return {
    ...result,
    rows: at.map((i) => result.rows[i]!),
    ...(result.evidence && {
      evidence: { ...result.evidence, rows: at.map((i) => result.evidence!.rows[i]!) },
    }),
  };
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
  // Relative quarters in the quarter filter, as the quarters they are now (src/query/relative.ts), so the tiles, the
  // heatmap's window and the waterfall work from dated quarters, as the queries run.
  if (state.filters.quarter?.some(isRelativeQuarter))
    state = {
      ...state,
      filters: {
        ...state.filters,
        quarter: resolveQuarters(state.filters.quarter, view.periods).values,
      },
    };
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

  const chart = rendered(chartQuery(state, state.measure, view.periods), chartQuery(DEFAULT_STATE));
  // The other measures are views the player chose, so they count as shown, like any other chart.
  const also = state.also.map((measure) => rendered(chartQuery(state, measure)));
  // Always-visible context, never discovery evidence (m1-slice section 5).
  const heatmap = run(heatmapQuery(state, view.periods));
  const drove = droveRows(state, view, (query, result) => displayed.push({ query, result }), run);

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
  return { tiles, chart, also, heatmap, drove, titleView, options };
}
