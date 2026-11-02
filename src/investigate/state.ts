// What the player is asking, kept in the URL so every view can be shared,
// bookmarked and undone with Back.
import { yearMonth } from "~/query/months";
import type { Dimension, Measure } from "~/query/types";

export const CHART_MEASURES = [
  "revenue",
  "units",
  "orders",
  "avg_order_value",
  "orders_per_day",
  "avg_discount",
] as const satisfies readonly Measure[];
export type ChartMeasure = (typeof CHART_MEASURES)[number];

/** The headline figures, each against the quarter before. */
export const TILE_MEASURES = ["revenue", "units", "orders", "avg_discount"] as const satisfies readonly ChartMeasure[];
export type TileMeasure = (typeof TILE_MEASURES)[number];

export const GROUPINGS = [
  "month",
  "quarter",
  "genre",
  "format",
  "publisher",
  "weekday",
  "discount_rate",
  "volume",
  "title",
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
  "in_series",
  "volume",
] as const satisfies readonly Dimension[];
export type FilterDimension = (typeof FILTER_DIMENSIONS)[number];

export type Filters = Partial<Record<FilterDimension, string[]>>;

export interface InvestigateState {
  measure: ChartMeasure;
  by: Grouping;
  /** Split each bar by quarter. Only meaningful for groupings that aren't time. */
  compare: boolean;
  filters: Filters;
}

export const DEFAULT_STATE: InvestigateState = { measure: "revenue", by: "month", compare: false, filters: {} };

const MAX_VALUES = 50;
const MAX_VALUE_LENGTH = 200;

function oneOf<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function canCompare(by: Grouping): boolean {
  // Time groupings already are quarters or sit inside one; titles are too many to split.
  return by !== "month" && by !== "quarter" && by !== "title";
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
  return {
    measure: oneOf(CHART_MEASURES, params.get("measure"), DEFAULT_STATE.measure),
    by,
    compare: params.get("compare") === "quarter" && canCompare(by),
    filters,
  };
}

export function toSearchParams(state: InvestigateState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.measure !== DEFAULT_STATE.measure) params.set("measure", state.measure);
  if (state.by !== DEFAULT_STATE.by) params.set("by", state.by);
  if (state.compare && canCompare(state.by)) params.set("compare", "quarter");
  for (const dimension of FILTER_DIMENSIONS) {
    for (const value of state.filters[dimension] ?? []) params.append(dimension, value);
  }
  return params;
}

/** Sets one dimension's selected values; an empty list clears it. */
export function setFilter(state: InvestigateState, dimension: FilterDimension, values: readonly string[]): InvestigateState {
  const filters = { ...state.filters };
  if (values.length) filters[dimension] = [...values];
  else delete filters[dimension];
  return { ...state, filters };
}

/** Adds the value to the dimension's selection, or takes it out if it's already there. */
export function toggleFilterValue(state: InvestigateState, dimension: FilterDimension, value: string): InvestigateState {
  const current = state.filters[dimension] ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return setFilter(state, dimension, next);
}

/** The discount filter is one choice: every sale, full price only, any discount, or one rate ("15%"). */
export type DiscountChoice = "all" | "full" | "any" | `${number}%`;

const FULL_PRICE = "0%";

export function discountChoice(filters: Filters): DiscountChoice {
  if (filters.discounted?.length === 1 && filters.discounted[0] === "yes" && !filters.discount_rate) return "any";
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
  return typeof choice === "object" ? setFilter(cleared, "volume", [choice.volume]) : setFilter(cleared, "in_series", [choice]);
}

/** Drills into one heatmap cell, or back out if it's the only cell selected. */
export function toggleCell(state: InvestigateState, weekday: string, month: string): InvestigateState {
  const only = (d: FilterDimension, v: string) => state.filters[d]?.length === 1 && state.filters[d]![0] === v;
  const selected = only("weekday", weekday) && only("month", month);
  return setFilter(setFilter(state, "weekday", selected ? [] : [weekday]), "month", selected ? [] : [month]);
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
export function monthsInScope(visibleQuarters: readonly string[], selectedQuarters: readonly string[] = []): string[] {
  const quarters = selectedQuarters.length ? visibleQuarters.filter((q) => selectedQuarters.includes(q)) : visibleQuarters;
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
