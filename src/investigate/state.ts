// What the player is asking, kept in the URL so every view can be shared,
// bookmarked and undone with Back.
import type { Dimension, Measure } from "~/query/types";

export const CHART_MEASURES = ["revenue", "units", "orders", "avg_discount"] as const satisfies readonly Measure[];
export type ChartMeasure = (typeof CHART_MEASURES)[number];

export const GROUPINGS = ["month", "quarter", "genre", "format", "publisher"] as const satisfies readonly Dimension[];
export type Grouping = (typeof GROUPINGS)[number];

/** Dimensions the screen can filter on: the filter menus plus the heatmap's axes. */
export const FILTER_DIMENSIONS = ["quarter", "genre", "format", "publisher", "month", "weekday"] as const satisfies readonly Dimension[];
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
  return by !== "month" && by !== "quarter";
}

export function parseState(params: URLSearchParams): InvestigateState {
  const filters: Filters = {};
  for (const dimension of FILTER_DIMENSIONS) {
    const values = [...new Set(params.getAll(dimension))].filter((v) => v.length > 0 && v.length <= MAX_VALUE_LENGTH);
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
