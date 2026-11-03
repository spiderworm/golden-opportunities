// Pinned charts: what a pin holds, and checks for pins read back from storage.
import { yearMonth } from "../../query/months.ts";
import {
  DIMENSIONS,
  MEASURES,
  QUERY_LIMITS,
  type Dimension,
  type Measure,
  type Query,
} from "../../query/types.ts";
import {
  CHART_MEASURES,
  fittingMeasures,
  HEAT_DIMENSIONS,
  MAX_MEASURES,
  type ChartMeasure,
} from "../state.ts";

export const CHART_PIN_KINDS = ["bar", "line", "table", "heatmap"] as const;
export const PIN_KINDS = [...CHART_PIN_KINDS, "comparison"] as const;
export type PinKind = (typeof PIN_KINDS)[number];

/**
 * A chart or table to pin. Structurally the same as Sage's ChartSpec
 * (src/assistant/tools/definitions.ts), so Dewey's onPin passes straight in.
 */
export interface ChartPinSpec {
  title: string;
  kind: (typeof CHART_PIN_KINDS)[number];
  query: Query;
  /** The chart's other measures, each run as the query with its measure swapped in; as the main chart's. */
  also?: ChartMeasure[];
  /**
   * Shown as a table (true) or a chart (false) when the player toggled it from its kind's own view: a chart read
   * as its table, or a table drawn as a chart (David, 3 Nov 2026). Absent, the kind decides. Not part of pinKey.
   */
  table?: boolean;
}

/** Whether a chart or table pin can be shown both ways: it has a breakdown to draw (one number stays a figure). */
export const canToggle = (spec: PinSpec): spec is ChartPinSpec =>
  spec.kind !== "comparison" && spec.query.by.length > 0;

/** Whether a pin shows as a table now: its toggle, or else its kind. */
export const shownAsTable = (spec: ChartPinSpec) => spec.table ?? spec.kind === "table";

/** The chart a table pin draws when toggled: a line over months or quarters, bars otherwise (as Dewey's). */
export const drawnKind = (spec: ChartPinSpec): "bar" | "line" =>
  spec.kind === "line" || spec.kind === "bar"
    ? spec.kind
    : spec.query.by[0] === "month" || spec.query.by[0] === "quarter"
      ? "line"
      : "bar";

/** A pin's other measures: null if malformed; else those that still fit one chart with the query's measure (fittingMeasures). */
export function parseAlso(measure: Measure, value: unknown): ChartMeasure[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !CHART_MEASURES.includes(measure as ChartMeasure)
  )
    return null;
  const all = [measure, ...value];
  if (
    all.length > MAX_MEASURES ||
    new Set(all).size !== all.length ||
    !all.every((m) => CHART_MEASURES.includes(m))
  )
    return null;
  // A pin saved under an older rule (an average on a total's axis, before 2 Nov 2026) keeps what still fits.
  return fittingMeasures(all as ChartMeasure[]).slice(1);
}

/**
 * Two values of one dimension compared on one measure: Dewey's Comparison (src/assistant/tools/definitions.ts).
 * It's run as two queries, so it's stored as the comparison, never as rows.
 */
export interface PinComparison {
  measure: Measure;
  across: Dimension;
  from: string;
  to: string;
  by: readonly Dimension[];
  filter?: Partial<Record<Dimension, readonly string[]>>;
}
export interface ComparisonPinSpec {
  title: string;
  kind: "comparison";
  comparison: PinComparison;
}

export type PinSpec = ChartPinSpec | ComparisonPinSpec;

export type Pin = PinSpec & {
  id: string;
  /** Who pinned it: the player (from a chart, or from a lookup Dewey showed), or Dewey, when the player asked. */
  pinnedBy: "player" | "dewey";
};

export const MAX_PINS = 8;
export const TITLE_MAX = 80;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const only = (o: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(o).every((k) => keys.includes(k));

/** The query's shape, checked as the contract bounds it. The server checks it again. */
export function parseQuery(value: unknown): Query | null {
  if (!isObject(value) || !only(value, ["measure", "by", "filter", "sort", "limit"])) return null;
  const { measure, by, filter, sort, limit } = value;
  if (!MEASURES.includes(measure as never)) return null;
  if (!Array.isArray(by) || by.length > QUERY_LIMITS.dimensions || new Set(by).size !== by.length)
    return null;
  if (!by.every((d) => DIMENSIONS.includes(d))) return null;
  const query: Query = { measure: measure as Query["measure"], by: by as Dimension[] };

  if (filter !== undefined) {
    if (!isObject(filter)) return null;
    const checked: Partial<Record<Dimension, string[]>> = {};
    for (const [dimension, values] of Object.entries(filter)) {
      if (!DIMENSIONS.includes(dimension as Dimension)) return null;
      if (!Array.isArray(values) || values.length < 1 || values.length > QUERY_LIMITS.filterValues)
        return null;
      if (!values.every((v) => isString(v, QUERY_LIMITS.filterValueLength))) return null;
      // Pins saved before months had a year ("04") keep working, as 2193's.
      checked[dimension as Dimension] =
        dimension === "month" ? (values as string[]).map(yearMonth) : (values as string[]);
    }
    query.filter = checked;
  }
  if (sort !== undefined) {
    if (!isObject(sort) || !only(sort, ["column", "direction"])) return null;
    if (
      ![...DIMENSIONS, ...MEASURES].includes(sort.column as never) ||
      (sort.direction !== "asc" && sort.direction !== "desc")
    )
      return null;
    query.sort = sort as Query["sort"];
  }
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > QUERY_LIMITS.rows)
      return null;
    query.limit = limit as number;
  }
  return query;
}

/** A comparison's shape, checked as Dewey's checkComparison does; its two queries are checked again by the server. */
export function parseComparison(value: unknown): PinComparison | null {
  if (!isObject(value) || !only(value, ["measure", "across", "from", "to", "by", "filter"]))
    return null;
  const { measure, across, from, to, by, filter } = value;
  if (!DIMENSIONS.includes(across as never)) return null;
  if (
    !isString(from, QUERY_LIMITS.filterValueLength) ||
    !isString(to, QUERY_LIMITS.filterValueLength) ||
    from === to
  )
    return null;
  if (!Array.isArray(by) || by.length > 1 || by.includes(across)) return null;
  if (isObject(filter) && (across as string) in filter) return null;
  const query = parseQuery({
    measure,
    by: [...by, across],
    ...(filter === undefined ? {} : { filter }),
  });
  if (!query) return null;
  const side = (v: string) => (across === "month" ? yearMonth(v) : v);
  return {
    measure: query.measure,
    across: across as Dimension,
    from: side(from),
    to: side(to),
    by: query.by.slice(0, -1),
    ...(query.filter ? { filter: query.filter } : {}),
  };
}

export function parsePinSpec(value: unknown): PinSpec | null {
  if (!isObject(value) || !isString(value.title, TITLE_MAX)) return null;
  if (value.kind === "comparison") {
    if (!only(value, ["title", "kind", "comparison"])) return null;
    const comparison = parseComparison(value.comparison);
    return comparison && { title: value.title, kind: "comparison", comparison };
  }
  if (
    !only(value, ["title", "kind", "query", "also", "table"]) ||
    (value.table !== undefined && typeof value.table !== "boolean") ||
    !CHART_PIN_KINDS.includes(value.kind as never)
  )
    return null;
  const query = parseQuery(value.query);
  if (!query) return null;
  if (value.kind === "heatmap") {
    // A heatmap is one measure down one of the grid's dimensions and across another (Investigate's HeatState).
    const grid =
      query.by.length === 2 &&
      query.by.every((d) => HEAT_DIMENSIONS.includes(d as never)) &&
      CHART_MEASURES.includes(query.measure as never);
    return grid && value.also === undefined
      ? { title: value.title, kind: "heatmap", query, ...shown(value.table) }
      : null;
  }
  if (value.also === undefined)
    return {
      title: value.title,
      kind: value.kind as ChartPinSpec["kind"],
      query,
      ...shown(value.table),
    };
  const also = parseAlso(query.measure, value.also);
  if (!also) return null;
  return {
    title: value.title,
    kind: value.kind as ChartPinSpec["kind"],
    query,
    ...(also.length ? { also } : {}),
    ...shown(value.table),
  };
}

const shown = (table: unknown) => (typeof table === "boolean" ? { table } : {});

/** Pins as stored; anything malformed is dropped rather than trusted. */
export function parsePins(json: string | null): Pin[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const pins: Pin[] = [];
  for (const item of raw.slice(0, MAX_PINS)) {
    if (
      !isObject(item) ||
      !isString(item.id, 64) ||
      (item.pinnedBy !== "player" && item.pinnedBy !== "dewey")
    )
      continue;
    const { id, pinnedBy, ...rest } = item;
    const spec = parsePinSpec(rest);
    if (spec) pins.push({ ...spec, id: id as string, pinnedBy });
  }
  return pins;
}

const sortedFilter = (filter: Partial<Record<Dimension, readonly string[]>> | undefined) =>
  Object.entries(filter ?? {})
    .map(([d, values]) => [d, [...values!].sort()] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1));

/** Two pins are the same when their kind and query (or comparison) match, whatever their titles and filter order. */
export function pinKey(spec: PinSpec): string {
  if (spec.kind === "comparison") {
    const c = spec.comparison;
    return JSON.stringify([
      spec.kind,
      c.measure,
      c.across,
      c.from,
      c.to,
      c.by,
      sortedFilter(c.filter),
    ]);
  }
  const { query } = spec;
  return JSON.stringify([
    spec.kind,
    query.measure,
    query.by,
    sortedFilter(query.filter),
    query.sort ?? null,
    query.limit ?? null,
    ...(spec.also?.length ? [spec.also] : []),
  ]);
}

/** Newest first; a repeat of an existing pin moves it to the front; the oldest drop past MAX_PINS. */
export function addPin(
  pins: readonly Pin[],
  spec: PinSpec,
  pinnedBy: Pin["pinnedBy"],
  id: string,
): Pin[] {
  const key = pinKey(spec);
  const rest = pins.filter((p) => pinKey(p) !== key);
  return [{ ...spec, id, pinnedBy }, ...rest].slice(0, MAX_PINS);
}
