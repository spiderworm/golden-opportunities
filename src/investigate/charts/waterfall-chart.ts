// "What drove the change" (David, 3 Nov 2026; Plot's copy, chart-features-copy.md section 5): revenue's change
// between two quarters as a waterfall, from then's total through each group's change to now's, and optionally
// each change split into price, volume and mix. The numbers are src/query/decompose.ts's; this draws and words them.
import type { EChartsCoreOption } from "echarts/core";
import { change } from "~/query/last-year";
import type { GroupChange, Split, Waterfall } from "~/query/decompose";
import type { Dimension } from "~/query/types";
import { chartTheme, tooltipStyle } from "~/platform/charts/chart-theme";
import { escapeHtml } from "~/platform/charts/escape";
import { formatDimensionShort, formatDimensionValue, formatMeasure } from "../format";
import { withNoise } from "./evidence";
import { formatDelta, formatPercent } from "./last-year";

/** The quarters compared, as the bars name them: `Q4 2193` and `Q1 2194`. */
export interface DroveLabels {
  then: string;
  now: string;
}
export const droveLabels = (then: string, now: string): DroveLabels => ({
  then: formatDimensionValue("quarter", then),
  now: formatDimensionValue("quarter", now),
});

/** One bar: a quarter's total, or a group's (or everything else's) change, floating from where the last ended. */
export interface Bar {
  kind: "total" | "change";
  /** The bar's name on the axis. */
  label: string;
  /** Where it starts and ends on the value axis: a total from the axis's foot, a change from the running total. */
  from: number;
  to: number;
  /** A change's group, or everything else's (key absent, with `count`). */
  group?: GroupChange | (Omit<GroupChange, "key"> & { count: number });
}

const PLURAL: Partial<Record<Dimension, string>> = {
  genre: "genres",
  title: "titles",
  edition: "editions",
};
export const EVERYTHING_ELSE = "Everything else";

/** The bars in order: then's total, each shown group's change, everything else's, now's total. */
export function waterfallBars(w: Waterfall, labels: DroveLabels): Bar[] {
  const bars: Bar[] = [{ kind: "total", label: labels.then, from: 0, to: w.then }];
  let level = w.then;
  const step = (label: string, group: NonNullable<Bar["group"]>) => {
    bars.push({ kind: "change", label, from: level, to: level + group.change, group });
    level += group.change;
  };
  for (const g of w.groups) step(formatDimensionValue(w.by, g.key), g);
  if (w.rest) step(EVERYTHING_ELSE, w.rest);
  bars.push({ kind: "total", label: labels.now, from: 0, to: w.now });
  return bars;
}

/**
 * Where the value axis starts: below the lowest point any change reaches, so a change of a few hundred dollars
 * against a quarter of several hundred thousand is still a bar you can see. The totals stand on it.
 */
export function axisFoot(bars: readonly Bar[]): number {
  const levels = bars.flatMap((b) => (b.kind === "change" ? [b.from, b.to] : [b.to]));
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  const span = high - low || Math.abs(high) || 1;
  // A round number, so the axis's first label reads as one ($80K, not $83.1K).
  const step = 10 ** Math.floor(Math.log10(span));
  return Math.max(0, Math.floor((low - span * 0.6) / step) * step);
}

const signed = (value: number) => formatDelta("revenue", value);

/** A change's split, in Plot's words: `Price +$600 · Volume +$3,100 · Mix +$420`, or a new or gone group's. */
export function splitLine(
  split: Split,
  presence: GroupChange["presence"],
  labels: DroveLabels,
): string {
  const vm = `Volume ${signed(split.volume)} · Mix ${signed(split.mix)}`;
  if (presence === "new") return `New in ${labels.now}, so no price change: ${vm}`;
  if (presence === "gone") return `Not sold in ${labels.now}, so no price change: ${vm}`;
  return `Price ${signed(split.price)} · ${vm}`;
}

/** A change's line: `Change: +$4,120 (+12.0%)`, `(New)` from nothing, and `· within noise` when it is. */
export function changeText(group: NonNullable<Bar["group"]>): string {
  const { percent } = change(group.now, { value: group.then });
  const pct = formatPercent("revenue", percent);
  return withNoise(
    `Change: ${signed(group.change)}${pct ? ` (${pct})` : ""}`,
    group.noise === true,
  );
}

/** A bar's tooltip lines (Plot's copy, section 5). */
export function barLines(bar: Bar, by: Dimension, labels: DroveLabels): string[] {
  if (bar.kind === "total") return [`${bar.label}: ${formatMeasure("revenue", bar.to)}`];
  const group = bar.group!;
  const lines = [bar.label];
  if (!("key" in group)) lines.push(`${group.count} more ${PLURAL[by] ?? "groups"}, together`);
  lines.push(changeText(group));
  lines.push(
    `From ${formatMeasure("revenue", group.then)} in ${labels.then} to ${formatMeasure("revenue", group.now)} in ${labels.now}`,
  );
  if (group.split)
    lines.push(splitLine(group.split, "key" in group ? group.presence : undefined, labels));
  return lines;
}

export const UP = chartTheme.categorical[0];
export const DOWN = chartTheme.categorical[1];
/** Price, volume and mix's colors, in the legend's order. */
export const SPLIT_COLORS = {
  price: chartTheme.categorical[0],
  volume: chartTheme.categorical[2],
  mix: chartTheme.categorical[3],
} as const;

/** The legend's items and their one-line tooltips, with the split on (Plot, section 5). */
export const SPLIT_LEGEND = [
  { key: "price", label: "Price", tip: "The same books selling for more or less each." },
  { key: "volume", label: "Volume", tip: "More or fewer books sold in all, at the old prices." },
  { key: "mix", label: "Mix", tip: "Sales shifting toward pricier or cheaper books." },
] as const;

/**
 * The rectangles drawn: a total in the series color, a change in the up or down color, or with the split, a change
 * as its price, volume and mix in turn, each from where the last ended.
 */
export function waterfallBoxes(
  bars: readonly Bar[],
  foot: number,
  split: boolean,
): { bar: number; low: number; high: number; color: string }[] {
  const boxes: { bar: number; low: number; high: number; color: string }[] = [];
  bars.forEach((b, i) => {
    if (b.kind === "total") {
      boxes.push({ bar: i, low: foot, high: b.to, color: chartTheme.series });
      return;
    }
    const parts = split && b.group?.split;
    if (!parts) {
      boxes.push({
        bar: i,
        low: Math.min(b.from, b.to),
        high: Math.max(b.from, b.to),
        color: b.to >= b.from ? UP : DOWN,
      });
      return;
    }
    let at = b.from;
    for (const key of ["price", "volume", "mix"] as const) {
      const next = at + parts[key];
      if (next !== at)
        boxes.push({
          bar: i,
          low: Math.min(at, next),
          high: Math.max(at, next),
          color: SPLIT_COLORS[key],
        });
      at = next;
    }
  });
  return boxes;
}

/** The chart: one custom series of rectangles over the bars' names, each bar's tooltip its lines. */
export function waterfallOption(
  w: Waterfall,
  labels: DroveLabels,
  { split = false }: { split?: boolean } = {},
): EChartsCoreOption {
  const bars = waterfallBars(w, labels);
  const foot = axisFoot(bars);
  const boxes = waterfallBoxes(bars, foot, split);
  const names = bars.map((b) => b.label);
  return {
    animationDuration: 400,
    textStyle: { fontFamily: chartTheme.font },
    aria: { enabled: true },
    grid: { left: 8, right: 16, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipStyle,
      trigger: "item",
      formatter: (p: { data: number[] }) => {
        const [first, ...rest] = barLines(bars[p.data[0]!]!, w.by, labels).map(escapeHtml);
        return `<div style="font-size:12px;color:${chartTheme.textMuted};margin-bottom:4px">${first}</div>${rest.map((l) => `<div>${l}</div>`).join("")}`;
      },
    },
    xAxis: {
      type: "category",
      data: names.map((n, i) =>
        bars[i]!.kind === "change" && n !== EVERYTHING_ELSE
          ? formatDimensionShort(w.by, n, names)
          : n,
      ),
      axisLine: { lineStyle: { color: chartTheme.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: chartTheme.textMuted,
        fontSize: 12,
        interval: 0,
        // Each name in its own bar's width, cut short rather than run into the next.
        width: 80,
        overflow: "truncate",
      },
    },
    yAxis: {
      type: "value",
      min: foot,
      splitNumber: 4,
      axisLabel: {
        color: chartTheme.textMuted,
        fontSize: 12,
        formatter: (v: number) => formatMeasure("revenue", v, { compact: true }),
      },
      splitLine: { lineStyle: { color: chartTheme.grid, width: 1, type: "solid" } },
    },
    series: [
      {
        type: "custom",
        clip: true,
        encode: { x: 0, y: [1, 2] },
        data: boxes.map((b) => [b.bar, b.low, b.high]),
        renderItem: (
          params: { dataIndex: number },
          api: {
            value: (d: number) => number;
            coord: (p: number[]) => number[];
            size: (p: number[]) => number[];
          },
        ) => {
          const box = boxes[params.dataIndex]!;
          const [x, top] = api.coord([api.value(0), box.high]);
          const [, bottom] = api.coord([api.value(0), box.low]);
          const width = api.size([1, 0])[0]! * 0.56;
          return {
            type: "rect",
            shape: { x: x! - width / 2, y: top!, width, height: Math.max(1, bottom! - top!), r: 2 },
            style: { fill: box.color },
          };
        },
      },
    ],
  };
}

/** The table's rows: each bar's name, then, now, change, % change, and with the split, its parts. */
export function waterfallRows(
  w: Waterfall,
  labels: DroveLabels,
  split: boolean,
): {
  name: string;
  then: string;
  now: string;
  change: string;
  percent: string;
  noise: boolean;
  parts?: [string, string, string];
}[] {
  const row = (name: string, g: NonNullable<Bar["group"]>) => {
    const { percent } = change(g.now, { value: g.then });
    const noise = g.noise === true;
    return {
      name,
      then: formatMeasure("revenue", g.then),
      now: formatMeasure("revenue", g.now),
      change: signed(g.change),
      percent: withNoise(formatPercent("revenue", percent), noise),
      noise,
      ...(split && g.split
        ? {
            // A new or gone group has no price to compare: None, not a measured $0 (Plot, #328).
            parts: [
              "presence" in g && g.presence ? "None" : signed(g.split.price),
              signed(g.split.volume),
              signed(g.split.mix),
            ] as [string, string, string],
          }
        : {}),
    };
  };
  const total = {
    count: 0,
    then: w.then,
    now: w.now,
    change: w.now - w.then,
    noise: null,
    ...(split && w.split && !("problem" in w.split) ? { split: w.split } : {}),
  };
  return [
    ...w.groups.map((g) => row(formatDimensionValue(w.by, g.key), g)),
    ...(w.rest ? [row(`${EVERYTHING_ELSE} (${w.rest.count})`, w.rest)] : []),
    row("Total", total),
  ];
}
