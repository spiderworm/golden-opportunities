// A saved segment on a chart (Goldy's defaults, req_7a658226468d): a pin or a report's chart that carries one by id,
// and a report's own segment over every chart in it. Client-safe. Relative .ts imports, as segments.ts has them.
import { isRelativeQuarter, resolveQuarters } from "../query/relative.ts";
import type { Dimension } from "../query/types.ts";
import type { PinSpec } from "../investigate/pins/spec.ts";
import type { Segment } from "./segments.ts";

type Filter = Partial<Record<Dimension, readonly string[]>>;

/** A chart with its segments applied: what to run, and what its card says about them. */
export interface Segmented {
  /** What to run; null when nothing matches both its filters and the report's segment. */
  spec: PinSpec | null;
  /** Its own segment: the one it carries, or "deleted" when the player has since deleted it; null if it carries none. */
  segment: Segment | "deleted" | null;
  /** The report's segment, when nothing matches both it and the chart's filters. */
  empty: Segment | null;
}

/** The filters a spec runs with, whatever its kind. */
export function filterOf(spec: PinSpec): Filter {
  if (spec.kind === "comparison") return spec.comparison.filter ?? {};
  if (spec.kind === "waterfall") return spec.waterfall.filter ?? {};
  return spec.query.filter ?? {};
}

function withFilter(spec: PinSpec, filter: Filter): PinSpec {
  const set = Object.keys(filter).length ? { filter } : {};
  if (spec.kind === "comparison") {
    const { filter: _f, ...comparison } = spec.comparison;
    return { ...spec, comparison: { ...comparison, ...set } };
  }
  if (spec.kind === "waterfall") {
    const { filter: _f, ...waterfall } = spec.waterfall;
    return { ...spec, waterfall: { ...waterfall, ...set } };
  }
  const { filter: _f, ...query } = spec.query;
  return { ...spec, query: { ...query, ...set } };
}

/**
 * The dimensions a chart's own segment never sets: those it draws, which Investigate leaves unfiltered so a picked bar
 * stays beside the others (filtersExcept), and a heatmap's and a waterfall's quarters, which they choose themselves.
 * A heatmap keeps the quarters it was pinned over.
 */
function ownDimensions(spec: PinSpec): readonly Dimension[] {
  if (spec.kind === "comparison") return [spec.comparison.across];
  if (spec.kind === "waterfall") return [spec.waterfall.by, "quarter"];
  if (spec.kind === "heatmap") return [...spec.query.by, "quarter"];
  return spec.query.by.slice(0, 1);
}

/**
 * The dimensions a report's segment can't narrow: a comparison's two sides, and a waterfall's breakdown and quarters,
 * which their shapes name. Anything else a report's segment narrows, the dimensions it draws included: every chart
 * in the report shows the segment (Plot, section 8).
 */
function shapeDimensions(spec: PinSpec): readonly Dimension[] {
  if (spec.kind === "comparison") return [spec.comparison.across];
  if (spec.kind === "waterfall") return [spec.waterfall.by, "quarter"];
  return [];
}

const without = (filters: Filter, dimensions: readonly Dimension[]): Filter =>
  Object.fromEntries(
    Object.entries(filters).filter(([d]) => !dimensions.includes(d as Dimension)),
  ) as Filter;

/**
 * Two filters on one chart, as AND: each dimension's values in both, relative quarters as the quarters they are now
 * (`quarters`, the visible periods). Null when a dimension they share has no value in both.
 */
export function intersect(a: Filter, b: Filter, quarters: readonly string[]): Filter | null {
  const out: Filter = { ...a };
  for (const [dimension, values] of Object.entries(b) as [Dimension, readonly string[]][]) {
    const mine = a[dimension];
    if (!mine) {
      out[dimension] = values;
      continue;
    }
    const dated = (list: readonly string[]) =>
      dimension === "quarter" && list.some(isRelativeQuarter)
        ? resolveQuarters(list, quarters).values
        : list;
    const theirs = dated(values);
    const both = dated(mine).filter((v) => theirs.includes(v));
    if (!both.length) return null;
    out[dimension] = both;
  }
  return out;
}

/**
 * A chart with its segments: its own segment's filters in place of the ones it was pinned with (so editing the
 * segment changes the chart), or, once that segment's deleted, the ones it was pinned with; then the report's
 * segment, if any, as AND with whatever that gives. `segments` is the player's list now.
 */
export function segmented(
  spec: PinSpec,
  segments: readonly Segment[],
  quarters: readonly string[],
  report: Segment | null = null,
): Segmented {
  const id = spec.kind === "comparison" ? undefined : spec.segment;
  const own = id === undefined ? null : (segments.find((s) => s.id === id) ?? "deleted");
  let run = spec;
  if (own && own !== "deleted") {
    const kept = ownDimensions(spec);
    const pinned = filterOf(spec);
    const keep = Object.fromEntries(
      kept.filter((d) => pinned[d]).map((d) => [d, pinned[d]]),
    ) as Filter;
    run = withFilter(spec, { ...without(own.filters as Filter, kept), ...keep });
  }
  if (!report) return { spec: run, segment: own, empty: null };
  const both = intersect(
    filterOf(run),
    without(report.filters as Filter, shapeDimensions(run)),
    quarters,
  );
  return both
    ? { spec: withFilter(run, both), segment: own, empty: null }
    : { spec: null, segment: own, empty: report };
}

/** How many pins and report charts carry a segment, and how many reports have it as their own: for Delete's confirm. */
export function segmentUses(
  id: string,
  pins: readonly PinSpec[],
  reports: readonly { segment?: string; items: readonly { spec: PinSpec }[] }[],
): { pins: number; reports: number } {
  const carries = (spec: PinSpec) => spec.kind !== "comparison" && spec.segment === id;
  return {
    pins: pins.filter(carries).length,
    reports: reports.filter((r) => r.segment === id || r.items.some((i) => carries(i.spec))).length,
  };
}
