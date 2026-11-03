// What the player is asking, kept in the URL so every view can be shared,
// bookmarked and undone with Back.
import { yearEarlier } from "../query/last-year.ts";
import { yearMonth } from "../query/months.ts";
import { MEASURE_DIMENSIONS, type Dimension, type Measure } from "../query/types.ts";

export const CHART_MEASURES = [
  "revenue",
  "units",
  "orders",
  "avg_order_value",
  "orders_per_day",
  "avg_discount",
] as const satisfies readonly Measure[];
export type ChartMeasure = (typeof CHART_MEASURES)[number];

/**
 * Each measure's axis: measures on the same one share it. A chart shows at most two (David, 2 Nov 2026: "multiple
 * labels on the y-axis, color-coded"; three measures on two axes). Totals and averages never share one, even in
 * the same unit (David, 2 Nov 2026): average order value on revenue's axis is too small to see.
 */
export const MEASURE_UNITS: Record<
  ChartMeasure,
  "dollars" | "count" | "order value" | "rate" | "percent"
> = {
  revenue: "dollars",
  avg_order_value: "order value",
  units: "count",
  orders: "count",
  orders_per_day: "rate",
  avg_discount: "percent",
};
/** Most measures one chart shows. */
export const MAX_MEASURES = 3;
/** Most units, and so axes, one chart shows. */
export const MAX_UNITS = 2;

/** Whether a measure can join the chart's: not already in it, at most three, and at most two units between them. */
export function canAddMeasure(
  measures: readonly ChartMeasure[],
  measure: ChartMeasure,
): "ok" | "full" | "third unit" {
  if (measures.includes(measure)) return "ok";
  if (measures.length >= MAX_MEASURES) return "full";
  const units = new Set([...measures, measure].map((m) => MEASURE_UNITS[m]));
  return units.size > MAX_UNITS ? "third unit" : "ok";
}

/** The chart's measures, the first one first: it's the one the tiles, the heatmap and a title's view show. */
export const measuresOf = (state: Pick<InvestigateState, "measure" | "also">): ChartMeasure[] => [
  state.measure,
  ...state.also,
];

/** The headline figures, each against the quarter before. */
export const TILE_MEASURES = [
  "revenue",
  "units",
  "orders",
  "avg_discount",
] as const satisfies readonly ChartMeasure[];
export type TileMeasure = (typeof TILE_MEASURES)[number];

export const GROUPINGS = [
  "month",
  "quarter",
  "genre",
  "format",
  "publisher",
  "weekday",
  "discount_rate",
  "price_band",
  "list_price",
  "awarded",
  "volume",
  "title",
  "edition",
] as const satisfies readonly Dimension[];
export type Grouping = (typeof GROUPINGS)[number];

/** Dimensions the screen can filter on: the menus, the heatmap's axes, and drilldowns. */
export const FILTER_DIMENSIONS = [
  "quarter",
  "genre",
  "format",
  "publisher",
  "discount_rate",
  "discounted",
  "month",
  "weekday",
  "title",
  "awarded",
  "award",
  "in_series",
  "volume",
  "price_band",
  "list_price",
  "edition",
] as const satisfies readonly Dimension[];
export type FilterDimension = (typeof FILTER_DIMENSIONS)[number];

export type Filters = Partial<Record<FilterDimension, string[]>>;

/**
 * The heatmap's axes (David, 2 Nov 2026: "the same level of customization that we've given to charts"): the
 * breakdowns with a handful of values each. Titles and editions are too many for a grid.
 */
export const HEAT_DIMENSIONS = [
  "weekday",
  "month",
  "quarter",
  "genre",
  "format",
  "publisher",
  "discount_rate",
  "price_band",
] as const satisfies readonly FilterDimension[];
export type HeatDimension = (typeof HEAT_DIMENSIONS)[number];

/** The heatmap's question: one measure (a heatmap has one color scale), down its rows and across its columns. */
export interface HeatState {
  measure: ChartMeasure;
  rows: HeatDimension;
  cols: HeatDimension;
  /** The heatmap's span once the ledger holds more than eight quarters: the last eight (the default), or every one. */
  period: "recent" | "all";
}

/** How many quarters the heatmap's default window covers (Frank and Plot, #264: 7 × 24 cells fits the 200-group limit). */
export const HEAT_WINDOW = 8;

/**
 * What decides the heatmap's span instead of its window: the screen's quarter filter, or else its month filter (a
 * month older than the window would leave nothing to draw; Plot, #270). Not a filter on one of the heatmap's own
 * axes, which its query ignores: a clicked cell sets one, and mustn't widen the grid (Frank, #270). Null when none.
 */
export function heatSpanFilter(
  state: Pick<InvestigateState, "heat" | "filters">,
): "quarter" | "month" | null {
  const outside = filtersExcept(state.filters, [state.heat.rows, state.heat.cols]);
  return outside.quarter?.length ? "quarter" : outside.month?.length ? "month" : null;
}

/**
 * The quarters the heatmap's default window keeps, or null when it covers everything: until the ledger holds more
 * than eight quarters, when the player chose every quarter, or when the screen already filters by quarter or month.
 */
export function heatWindow(
  state: Pick<InvestigateState, "heat" | "filters">,
  quarters: readonly string[],
): string[] | null {
  if (quarters.length <= HEAT_WINDOW || state.heat.period === "all" || heatSpanFilter(state))
    return null;
  return [...quarters].sort().slice(-HEAT_WINDOW);
}

export interface InvestigateState {
  /** The chart's first measure, and the only one the tiles, the heatmap and a title's view show. */
  measure: ChartMeasure;
  /** The chart's other measures, up to two more, on at most two units between all three (canAddMeasure). */
  also: ChartMeasure[];
  by: Grouping;
  /** Split each bar by quarter. Only meaningful for groupings that aren't time. */
  compare: boolean;
  /** Beside the quarter shown, the same quarter last year (`vs=last_year`): applies only while lastYearBlock allows it. */
  lastYear: boolean;
  /** Draw the two measures against each other, a point per group (scatterProblem says when it can). */
  scatter: boolean;
  filters: Filters;
  /** The heatmap. Its measure follows the chart's first until the player picks one (`heat=`). */
  heat: HeatState;
}

export const DEFAULT_STATE: InvestigateState = {
  measure: "revenue",
  also: [],
  by: "month",
  compare: false,
  lastYear: false,
  scatter: false,
  filters: {},
  heat: { measure: "revenue", rows: "weekday", cols: "month", period: "recent" },
};

const MAX_VALUES = 50;
const MAX_VALUE_LENGTH = 200;

function oneOf<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function canCompare(by: Grouping, also: readonly ChartMeasure[] = []): boolean {
  // Time groupings already are quarters or sit inside one; titles and editions are too many to split. With several measures,
  // measures times quarters is too many series to read (David's choice, 2 Nov 2026).
  return (
    by !== "month" && by !== "quarter" && by !== "title" && by !== "edition" && also.length === 0
  );
}

/** "Q1 2194", as formatDimensionValue writes a quarter. */
const quarterName = (quarter: string) => `Q${quarter.slice(-1)} ${quarter.slice(0, 4)}`;

/**
 * Why the chart can't show the same quarter last year, or null if it can (Plot's copy, #291, #294 and for David's
 * req_d5257c07a9f0): it compares one quarter, the one the quarter filter picks, a year back, on one dated measure,
 * without Compare quarters. A breakdown by quarter ignores the quarter filter, so it has no one quarter. Every way
 * it can't ends in a reason: there's no silent refusal.
 */
export function lastYearBlock(
  state: Pick<InvestigateState, "by" | "also" | "compare" | "filters"> & { measure: Measure },
  quarters: readonly string[],
): string | null {
  if (!MEASURE_DIMENSIONS[state.measure].includes("quarter"))
    return state.measure === "checkouts"
      ? "Checkouts aren't recorded by year, so there's no last year to compare"
      : "Ratings aren't recorded by quarter, so there's no last year to compare";
  if (state.also.length) return "Show one measure to compare with last year";
  if (state.compare) return "Turn off Compare quarters to compare with last year";
  if (state.by === "quarter")
    return "Break down by something other than quarter to compare with last year";
  const quarter = shownQuarter(state);
  if (!quarter) return "Filter to one quarter to compare it with last year";
  // A quarter not yet played, or a stale link's.
  if (!quarters.includes(quarter))
    return `${quarterName(quarter)} isn't in the ledgers yet: filter to a quarter that's been played`;
  const before = yearEarlier("quarter", quarter);
  if (quarter.startsWith("2193-"))
    return "The ledgers start in 2193: there's no year before it to compare";
  if (!quarters.includes(before))
    return `${quarterName(before)} isn't in the ledgers, so there's nothing to compare`;
  return null;
}

/**
 * Why last year can't be shown once the chart's result is back, or null if it can: nothing in the quarter matches,
 * or (never expected: tell Plot) the server didn't send last year's figures.
 */
export function lastYearUnshown(
  state: Pick<InvestigateState, "filters">,
  result: { rows: readonly unknown[]; lastYear?: unknown },
): string | null {
  if (!result.rows.length)
    return `Nothing in ${quarterName(shownQuarter(state) ?? "")} matches these filters, so there's nothing to compare`;
  return result.lastYear ? null : "Can't compare this chart with last year";
}

/**
 * Whether the toggle stays on in the URL: not for several measures, Compare quarters or a breakdown by quarter,
 * which switch it off as several measures do Compare quarters (Audit, #301). A quarter filter that doesn't pick one
 * quarter keeps it, so it comes back once one is picked.
 */
export const keepsLastYear = (state: Pick<InvestigateState, "by" | "also" | "compare">) =>
  state.also.length === 0 && !state.compare && state.by !== "quarter";

/** The one quarter the quarter filter picks, or null. */
export const shownQuarter = (state: Pick<InvestigateState, "filters">): string | null =>
  state.filters.quarter?.length === 1 ? state.filters.quarter[0]! : null;

/**
 * Why the chart can't be a scatter plot, or null when it can: the toggle's disabled tooltip (Plot's copy, #291). A
 * scatter plot is two measures across one dimension (David, 3 Nov 2026), a point per group, the first measure
 * across and the second up. Over months, quarters or weekdays the points would hide their order in time, which a
 * line already shows.
 */
export function scatterProblem(by: Grouping, also: readonly ChartMeasure[]): string | null {
  if (also.length === 0) return "Choose a second measure for a scatter plot";
  if (also.length > 1) return "A scatter plot shows two measures";
  if (by === "month" || by === "quarter" || by === "weekday")
    return "Break down by title, genre or another group for a scatter plot";
  return null;
}

/** A list of measures cut to what fits one chart, in order: repeats, a fourth measure and a third unit dropped. */
export function fittingMeasures(measures: readonly ChartMeasure[]): ChartMeasure[] {
  return measures.reduce<ChartMeasure[]>(
    (kept, m) => (canAddMeasure(kept, m) === "ok" && !kept.includes(m) ? [...kept, m] : kept),
    [],
  );
}

/** The measures a link asks for: `measures=a,b,c`, kept only while they fit one chart; else `measure=a`, as links always did. */
function readMeasures(params: URLSearchParams): Pick<InvestigateState, "measure" | "also"> {
  const listed = (params.get("measures") ?? "")
    .split(",")
    .filter((m): m is ChartMeasure => CHART_MEASURES.includes(m as ChartMeasure));
  const fitting = fittingMeasures(listed);
  if (fitting.length > 0) return { measure: fitting[0]!, also: fitting.slice(1) };
  return { measure: oneOf(CHART_MEASURES, params.get("measure"), DEFAULT_STATE.measure), also: [] };
}

export function parseState(params: URLSearchParams): InvestigateState {
  const filters: Filters = {};
  for (const dimension of FILTER_DIMENSIONS) {
    // Links from before months had a year ("month=04") still open, as 2193's.
    const read = params.getAll(dimension).map((v) => (dimension === "month" ? yearMonth(v) : v));
    const values = [...new Set(read)].filter((v) => v.length > 0 && v.length <= MAX_VALUE_LENGTH);
    if (values.length) filters[dimension] = values.slice(0, MAX_VALUES);
  }
  const by = oneOf(GROUPINGS, params.get("by"), DEFAULT_STATE.by);
  const measures = readMeasures(params);
  return {
    ...measures,
    by,
    compare: params.get("compare") === "quarter" && canCompare(by, measures.also),
    lastYear:
      params.get("vs") === "last_year" &&
      keepsLastYear({
        by,
        ...measures,
        compare: params.get("compare") === "quarter" && canCompare(by, measures.also),
      }),
    scatter: params.get("chart") === "scatter" && scatterProblem(by, measures.also) === null,
    filters,
    heat: readHeat(params, measures.measure),
  };
}

/** The heatmap from a link: `heat=`, `heat_rows=`, `heat_cols=`. Without them (every link before), weekday by month in the chart's measure. */
function readHeat(params: URLSearchParams, chartMeasure: ChartMeasure): HeatState {
  const rows = oneOf(HEAT_DIMENSIONS, params.get("heat_rows"), DEFAULT_STATE.heat.rows);
  const cols = oneOf(HEAT_DIMENSIONS, params.get("heat_cols"), DEFAULT_STATE.heat.cols);
  const axes =
    rows === cols
      ? { rows: DEFAULT_STATE.heat.rows, cols: DEFAULT_STATE.heat.cols }
      : { rows, cols };
  return {
    measure: oneOf(CHART_MEASURES, params.get("heat"), chartMeasure),
    ...axes,
    period: params.get("heat_period") === "all" ? "all" : "recent",
  };
}

export function toSearchParams(state: InvestigateState): URLSearchParams {
  const params = new URLSearchParams();
  // One measure keeps the old `measure=` (so links and cached views are unchanged); several are `measures=a,b`.
  if (state.also.length) params.set("measures", measuresOf(state).join(","));
  else if (state.measure !== DEFAULT_STATE.measure) params.set("measure", state.measure);
  if (state.by !== DEFAULT_STATE.by) params.set("by", state.by);
  if (state.compare && canCompare(state.by, state.also)) params.set("compare", "quarter");
  if (state.lastYear && keepsLastYear(state)) params.set("vs", "last_year");
  if (state.scatter && scatterProblem(state.by, state.also) === null)
    params.set("chart", "scatter");
  // The heatmap's measure only once it differs from the chart's, so it keeps following the chart until then.
  if (state.heat.measure !== state.measure) params.set("heat", state.heat.measure);
  if (state.heat.rows !== DEFAULT_STATE.heat.rows) params.set("heat_rows", state.heat.rows);
  if (state.heat.cols !== DEFAULT_STATE.heat.cols) params.set("heat_cols", state.heat.cols);
  if (state.heat.period === "all") params.set("heat_period", "all");
  for (const dimension of FILTER_DIMENSIONS) {
    for (const value of state.filters[dimension] ?? []) params.append(dimension, value);
  }
  return params;
}

/** Sets one dimension's selected values; an empty list clears it. */
export function setFilter(
  state: InvestigateState,
  dimension: FilterDimension,
  values: readonly string[],
): InvestigateState {
  const filters = { ...state.filters };
  if (values.length) filters[dimension] = [...values];
  else delete filters[dimension];
  return { ...state, filters };
}

/** Adds the value to the dimension's selection, or takes it out if it's already there. */
export function toggleFilterValue(
  state: InvestigateState,
  dimension: FilterDimension,
  value: string,
): InvestigateState {
  const current = state.filters[dimension] ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return setFilter(state, dimension, next);
}

/** The discount filter is one choice: every sale, full price only, any discount, or one rate ("15%"). */
export type DiscountChoice = "all" | "full" | "any" | `${number}%`;

const FULL_PRICE = "0%";

export function discountChoice(filters: Filters): DiscountChoice {
  if (filters.discounted?.length === 1 && filters.discounted[0] === "yes" && !filters.discount_rate)
    return "any";
  if (filters.discount_rate?.length === 1 && !filters.discounted) {
    const rate = filters.discount_rate[0]!;
    return rate === FULL_PRICE ? "full" : (rate as DiscountChoice);
  }
  return "all";
}

export function setDiscount(state: InvestigateState, choice: DiscountChoice): InvestigateState {
  const cleared = setFilter(setFilter(state, "discounted", []), "discount_rate", []);
  if (choice === "all") return cleared;
  if (choice === "any") return setFilter(cleared, "discounted", ["yes"]);
  return setFilter(cleared, "discount_rate", [choice === "full" ? FULL_PRICE : choice]);
}

/**
 * The awards filter is one choice too: every book, award winners, books without one, or one award's winners
 * ("Hugo Award"). An award can only filter, never group: a book can hold two.
 */
export type AwardChoice = "all" | "yes" | "no" | { award: string };

export function awardChoice(filters: Filters): AwardChoice {
  if (filters.award?.length === 1 && !filters.awarded) return { award: filters.award[0]! };
  if (filters.awarded?.length === 1 && !filters.award) {
    const awarded = filters.awarded[0];
    if (awarded === "yes" || awarded === "no") return awarded;
  }
  return "all";
}

export function setAward(state: InvestigateState, choice: AwardChoice): InvestigateState {
  const cleared = setFilter(setFilter(state, "awarded", []), "award", []);
  if (choice === "all") return cleared;
  return typeof choice === "object"
    ? setFilter(cleared, "award", [choice.award])
    : setFilter(cleared, "awarded", [choice]);
}

/** The series filter is one choice too: every book, books in a series, standalone books, or one volume number. */
export type SeriesChoice = "all" | "yes" | "no" | { volume: string };

export function seriesChoice(filters: Filters): SeriesChoice {
  if (filters.volume?.length === 1 && !filters.in_series) return { volume: filters.volume[0]! };
  if (filters.in_series?.length === 1 && !filters.volume) {
    const inSeries = filters.in_series[0];
    if (inSeries === "yes" || inSeries === "no") return inSeries;
  }
  return "all";
}

export function setSeries(state: InvestigateState, choice: SeriesChoice): InvestigateState {
  const cleared = setFilter(setFilter(state, "in_series", []), "volume", []);
  if (choice === "all") return cleared;
  return typeof choice === "object"
    ? setFilter(cleared, "volume", [choice.volume])
    : setFilter(cleared, "in_series", [choice]);
}

/** Drills into one heatmap cell, or back out if it's the only cell selected. */
/** A heatmap cell filters the screen to its row's and column's values; clicking the one already chosen clears both. */
export function toggleCell(state: InvestigateState, row: string, col: string): InvestigateState {
  const { rows, cols } = state.heat;
  const only = (d: FilterDimension, v: string) =>
    state.filters[d]?.length === 1 && state.filters[d]![0] === v;
  const selected = only(rows, row) && only(cols, col);
  return setFilter(setFilter(state, rows, selected ? [] : [row]), cols, selected ? [] : [col]);
}

/**
 * The filters a view applies to itself. A chart ignores the filters on the
 * dimensions it draws, so a drilled-into bar stays visible beside the others
 * and can be clicked again to drill back out.
 */
export function filtersExcept(filters: Filters, dimensions: readonly Dimension[]): Filters {
  const rest = { ...filters };
  for (const d of dimensions) delete rest[d as FilterDimension];
  return rest;
}

/** Months ("2193-01") in the quarters in scope: the selected ones, or every visible one. */
export function monthsInScope(
  visibleQuarters: readonly string[],
  selectedQuarters: readonly string[] = [],
): string[] {
  const quarters = selectedQuarters.length
    ? visibleQuarters.filter((q) => selectedQuarters.includes(q))
    : visibleQuarters;
  const months = new Set<string>();
  for (const quarter of quarters) {
    const year = quarter.slice(0, 4);
    const q = Number(quarter.slice(-1));
    for (let m = q * 3 - 2; m <= q * 3; m++) months.add(`${year}-${String(m).padStart(2, "0")}`);
  }
  return [...months].sort();
}

/** Sums and counts are zero where nothing sold; averages have no value there. */
export function isTotal(measure: Measure): boolean {
  return !measure.startsWith("avg_");
}

/**
 * The filters a player can add to the bar, in the bar's order (David, 2 Nov 2026: an "+ add a filter" list, each
 * filter with an "x"). Some are one control over two dimensions (Discount, Awards, Series volume).
 */
export const FILTERS = [
  "quarter",
  "genre",
  "format",
  "publisher",
  "price",
  "discount",
  "awards",
  "series",
  "month",
  "weekday",
  "title",
  "edition",
] as const;
export type FilterId = (typeof FILTERS)[number];

export const FILTER_PARTS: Record<FilterId, readonly FilterDimension[]> = {
  quarter: ["quarter"],
  genre: ["genre"],
  format: ["format"],
  publisher: ["publisher"],
  // The menu chooses price bands; an exact list price comes from a chart broken down by list price.
  price: ["price_band", "list_price"],
  discount: ["discount_rate", "discounted"],
  awards: ["awarded", "award"],
  series: ["in_series", "volume"],
  month: ["month"],
  weekday: ["weekday"],
  title: ["title"],
  edition: ["edition"],
};

/** The URL parameter listing the filters the player added, values or not: `show=genre&show=awards`. */
export const SHOW_PARAM = "show";

/**
 * The filters on the bar: the ones the player added, and any that hold values (a drilldown, an old link), so
 * nothing applies unseen. A filter added with nothing chosen filters nothing.
 */
export function shownFilters(params: URLSearchParams, filters: Filters): FilterId[] {
  const listed = params.getAll(SHOW_PARAM);
  return FILTERS.filter(
    (id) => listed.includes(id) || FILTER_PARTS[id].some((d) => filters[d]?.length),
  );
}

/** The URL's parameters with these filters shown (in the bar's order), replacing any `show` already there. */
export function withShown(params: URLSearchParams, shown: readonly FilterId[]): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(SHOW_PARAM);
  for (const id of FILTERS) if (shown.includes(id)) next.append(SHOW_PARAM, id);
  return next;
}

/** Taking a filter off the bar clears what it had chosen. */
export function removeFilter(state: InvestigateState, id: FilterId): InvestigateState {
  return FILTER_PARTS[id].reduce((next, dimension) => setFilter(next, dimension, []), state);
}

/** Whether two URLs differ only in which filters are shown: that changes no data, so nothing is asked again. */
export function onlyShownChanged(from: URL, to: URL): boolean {
  if (from.pathname !== to.pathname || from.search === to.search) return false;
  const strip = (url: URL) => withShown(url.searchParams, []).toString();
  return strip(from) === strip(to);
}
