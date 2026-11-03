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
  DROVE_GROUPINGS,
  droveOn,
  droveQuarters,
  filtersExcept,
  GROUPINGS,
  HEAT_DIMENSIONS,
  MAX_MEASURES,
  scatterProblem,
  type Grouping,
  type ChartMeasure,
  type ShareMode,
  SHARE_MODES,
  type InvestigateState,
} from "../state.ts";

export const CHART_PIN_KINDS = ["bar", "line", "table", "heatmap", "scatter"] as const;
export const PIN_KINDS = [...CHART_PIN_KINDS, "comparison", "waterfall"] as const;
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
  /** Shown as shares of its total, or largest first with the running share, as the main chart was (req_fa2e6a0dbbec). */
  share?: ShareMode;
}

/**
 * Why a pin can't be drawn as a chart, before it's run: a comparison reads as a table, and one number is a figure
 * (NO_CHART's keys); null if it can. Too many groups is known only once it's run.
 */
export const noChart = (spec: PinSpec): "comparison" | "figure" | null =>
  spec.kind === "comparison"
    ? "comparison"
    : spec.kind === "waterfall" || spec.query.by.length
      ? null
      : "figure";

/** Whether a pin shows as a table now: its toggle, or else its kind. */
export const shownAsTable = (spec: ChartPinSpec | WaterfallPinSpec) =>
  spec.table ?? spec.kind === "table";

/**
 * The chart a query draws: a line over months or quarters, bars for anything else (Audit, #252). One rule for
 * Dewey's show_chart (tools/definitions.ts) and a table drawn as a chart, so the two can't drift.
 */
export const queryChartKind = (query: Pick<Query, "by">): "bar" | "line" =>
  query.by[0] === "month" || query.by[0] === "quarter" ? "line" : "bar";

/** The chart a table pin draws when toggled: its own kind if it's a bar or line, else the query's (queryChartKind). */
export const drawnKind = (spec: ChartPinSpec): "bar" | "line" =>
  spec.kind === "line" || spec.kind === "bar" ? spec.kind : queryChartKind(spec.query);

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

/**
 * "What drove the change" pinned (David, 3 Nov 2026): revenue's change between two quarters by genre, title or
 * edition, with the chart's other filters, and whether it's split into price, volume and mix. Run again as its
 * plain queries (src/query/decompose.ts) whenever it's shown.
 */
export interface WaterfallPinSpec {
  title: string;
  kind: "waterfall";
  waterfall: {
    by: (typeof DROVE_GROUPINGS)[number];
    then: string;
    now: string;
    filter?: Partial<Record<Dimension, readonly string[]>>;
    split?: boolean;
  };
  /** Shown as its table: the pin's Table toggle. Not part of pinKey. */
  table?: boolean;
}

export type PinSpec = ChartPinSpec | ComparisonPinSpec | WaterfallPinSpec;

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
  if (!isObject(value) || !only(value, ["measure", "by", "filter", "sort", "limit", "vs"]))
    return null;
  const { measure, by, filter, sort, limit, vs } = value;
  // Last year beside the quarter (Frank's #301): the only comparison a query names.
  if (vs !== undefined && vs !== "last_year") return null;
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
  if (vs === "last_year") query.vs = vs;
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

const QUARTER = /^\d{4}-Q[1-4]$/;

/** A pinned waterfall's shape: a breakdown it can be drawn by, two quarters, and the chart's filters as a query's. */
export function parseWaterfall(value: unknown): WaterfallPinSpec["waterfall"] | null {
  if (!isObject(value) || !only(value, ["by", "then", "now", "filter", "split"])) return null;
  const { by, then, now, filter, split } = value;
  if (!(DROVE_GROUPINGS as readonly unknown[]).includes(by)) return null;
  if (
    typeof then !== "string" ||
    typeof now !== "string" ||
    !QUARTER.test(then) ||
    !QUARTER.test(now)
  )
    return null;
  // A change runs forward in time; "2193-Q4" < "2194-Q1" as strings, as quarters (Frank, #339).
  if (then >= now || (split !== undefined && typeof split !== "boolean")) return null;
  if (isObject(filter) && ((by as string) in filter || "quarter" in filter)) return null;
  const query = parseQuery({
    measure: "revenue",
    by: [by],
    ...(filter === undefined ? {} : { filter }),
  });
  if (!query) return null;
  return {
    by: by as WaterfallPinSpec["waterfall"]["by"],
    then,
    now,
    ...(query.filter ? { filter: query.filter } : {}),
    ...(split ? { split: true } : {}),
  };
}

export function parsePinSpec(value: unknown): PinSpec | null {
  if (!isObject(value) || !isString(value.title, TITLE_MAX)) return null;
  if (value.kind === "waterfall") {
    if (!only(value, ["title", "kind", "waterfall", "table"])) return null;
    if (value.table !== undefined && typeof value.table !== "boolean") return null;
    const waterfall = parseWaterfall(value.waterfall);
    return (
      waterfall && {
        title: value.title,
        kind: "waterfall",
        waterfall,
        ...(typeof value.table === "boolean" ? { table: value.table } : {}),
      }
    );
  }
  if (value.kind === "comparison") {
    if (!only(value, ["title", "kind", "comparison"])) return null;
    const comparison = parseComparison(value.comparison);
    return comparison && { title: value.title, kind: "comparison", comparison };
  }
  if (
    !only(value, ["title", "kind", "query", "also", "table", "share"]) ||
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
  if (value.kind === "scatter") {
    // A scatter plot is two measures across one of the chart's groupings, as Investigate allows it (scatterProblem).
    const also = value.also === undefined ? null : parseAlso(query.measure, value.also);
    const [by, more] = query.by;
    const fits =
      also !== null &&
      by !== undefined &&
      more === undefined &&
      GROUPINGS.includes(by as Grouping) &&
      scatterProblem(by as Grouping, also) === null;
    return fits
      ? { title: value.title, kind: "scatter", query, also, ...shown(value.table) }
      : null;
  }
  if (value.share !== undefined) {
    // Shares are one measure's, one group to a bar: as the main chart allows them (shareBlock), less what a pin
    // can't carry.
    const share = SHARE_MODES.find((m) => m === value.share);
    const fits =
      share !== undefined &&
      value.kind === "bar" &&
      value.also === undefined &&
      query.by.length === 1 &&
      query.vs === undefined &&
      ["revenue", "units", "orders"].includes(query.measure);
    return fits ? { title: value.title, kind: "bar", query, share, ...shown(value.table) } : null;
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
  if (spec.kind === "waterfall") {
    const w = spec.waterfall;
    return JSON.stringify([spec.kind, w.by, w.then, w.now, sortedFilter(w.filter), !!w.split]);
  }
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
    // A bar, a line and a table of one query are one chart shown three ways (its Table toggle, Dewey's chart or its
    // lookup's table), so they're one pin: pinned either way, it reads as pinned (Sage, #302). A heatmap and a
    // scatter plot are other charts.
    spec.kind === "bar" || spec.kind === "line" || spec.kind === "table" ? "chart" : spec.kind,
    query.measure,
    query.by,
    sortedFilter(query.filter),
    query.sort ?? null,
    query.limit ?? null,
    // With last year, a different pin from the same chart without it; as shares, too.
    ...(query.vs ? [query.vs] : []),
    ...(spec.share ? [`share:${spec.share}`] : []),
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

/**
 * What drove the change as a pin, while it's on: titled as the chart is, with the chart's filters but the
 * breakdown's and the quarter's, which the waterfall names itself. Null while it's off or can't be drawn.
 */
export function waterfallPinFor(
  state: InvestigateState,
  quarters: readonly string[],
): WaterfallPinSpec | null {
  const pair = droveOn(state, quarters) ? droveQuarters(state, quarters) : null;
  if (!pair) return null;
  const others = filtersExcept(state.filters, [state.by, "quarter"]);
  // "Q4 2193", as the chart names it. Written here: Dewey's tool server loads this module under plain Node, which
  // can't follow the charts' "~/" imports.
  const name = (quarter: string) => `Q${quarter.slice(-1)} ${quarter.slice(0, 4)}`;
  return {
    title: `What drove revenue's change, ${name(pair.then)} to ${name(pair.now)}, by ${state.by}`,
    kind: "waterfall",
    waterfall: {
      by: state.by as WaterfallPinSpec["waterfall"]["by"],
      then: pair.then,
      now: pair.now,
      ...(Object.keys(others).length ? { filter: others } : {}),
      ...(state.split ? { split: true } : {}),
    },
  };
}
