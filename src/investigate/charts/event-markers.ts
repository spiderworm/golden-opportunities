// Events on a time series (David, 3 Nov 2026; Plot's copy, chart-features-copy.md section 7): each marker a thin
// vertical line at its month or quarter, with a short label, and the tooltip naming each event. The events come with
// the result (src/query/events.ts), so every chart of it, pinned or in a report, marks the same ones.
import type { EChartsCoreOption } from "echarts/core";
import { byDate, quarterOfDate, type ChartEvent, type EventKind } from "~/query/events";
import type { Dimension } from "~/query/types";
import { chartTheme } from "~/platform/charts/chart-theme";
import { escapeHtml } from "~/platform/charts/escape";

/** A marker's short label (Plot): on the chart, and in the legend. */
export const EVENT_LABELS: Record<EventKind, string> = {
  release: "Release",
  pick: "Pick",
  move: "Your move",
  event: "Event",
};
/** The kind as the tooltip's first line names it. */
const EVENT_NAMES: Record<EventKind, string> = {
  release: "Release",
  pick: "Book of the Month",
  move: "Your move",
  event: "Station event",
};
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
].concat(["October", "November", "December"]);

/** When, in the game's style, month first (Plot): `Feb 4, 2194`, `March 2194`, `Q1 2194`. */
export function eventWhen(event: ChartEvent): string {
  const year = event.date.slice(0, 4);
  const month = MONTHS[Number(event.date.slice(5, 7)) - 1]!;
  if (event.precision === "quarter") return `Q${quarterOfDate(event.date).slice(-1)} ${year}`;
  if (event.precision === "month") return `${month} ${year}`;
  return `${month.slice(0, 3)} ${Number(event.date.slice(8, 10))}, ${year}`;
}

/** The tooltip's two lines for one event: `Feb 4, 2194 · Release`, then what happened. */
export const eventLines = (event: ChartEvent): [string, string] => [
  `${eventWhen(event)} · ${EVENT_NAMES[event.kind]}`,
  // With a book dimension in the breakdown, the line it marks, in brackets (Audit, #353).
  event.group ? `${event.label} (${Object.values(event.group).join(", ")})` : event.label,
];

/** The axis category an event falls on: its month, or its quarter, as the query names them. */
function categoryOf(event: ChartEvent, x: Dimension): string | null {
  if (x === "month") return event.date.slice(0, 7);
  if (x === "quarter") return quarterOfDate(event.date);
  return null;
}

/** One marker: a category on the axis, and every event on it, in date order. */
export interface Marker {
  index: number;
  events: ChartEvent[];
  /** `Release`, or `+2` where several share the category (Plot's crowding rule). */
  label: string;
}

/**
 * The markers for a chart's categories, one per category with any events, and how many events fell on no category
 * shown. Those aren't drawn or mentioned (Plot, #357): the server already leaves out events outside the query's
 * filters, so only a row limit that cut a month can put one there.
 */
export function markersFor(
  events: readonly ChartEvent[],
  x: Dimension,
  categories: readonly (string | null)[],
): { markers: Marker[]; offAxis: number } {
  const at = new Map<number, ChartEvent[]>();
  let offAxis = 0;
  for (const event of events) {
    const category = categoryOf(event, x);
    const index = category === null ? -1 : categories.indexOf(category);
    if (index < 0) {
      offAxis++;
      continue;
    }
    at.set(index, [...(at.get(index) ?? []), event]);
  }
  const markers = [...at]
    .sort(([a], [b]) => a - b)
    .map(([index, list]) => {
      const sorted = [...list].sort(byDate);
      return {
        index,
        events: sorted,
        label: sorted.length === 1 ? EVENT_LABELS[sorted[0]!.kind] : `+${sorted.length}`,
      };
    });
  return { markers, offAxis };
}

/** How many markers a chart drew, by kind, for analytics: counts only, never what they were. */
export function markerCounts(markers: readonly Marker[]): Record<EventKind, number> {
  const counts: Record<EventKind, number> = { release: 0, pick: 0, move: 0, event: 0 };
  for (const m of markers) for (const e of m.events) counts[e.kind]++;
  return counts;
}

/** Past this many markers their labels would collide (measured: 24 quarters), so only the lines and tooltips show. */
export const MAX_LABELLED = 12;

/**
 * The caption's lines under a marked chart (Plot), one each, or none: none in scope; some events past the result's
 * cap, not drawn; or, past MAX_LABELLED markers, events drawn without their labels.
 */
export function eventsCaption(markers: readonly Marker[], hidden: number): string[] {
  const notes: string[] = [];
  if (hidden > 0)
    notes.push(
      `${hidden} more ${hidden === 1 ? "event" : "events"} hidden: filter to one quarter to see them all`,
    );
  if (markers.length > MAX_LABELLED) {
    const n = markers.reduce((t, m) => t + m.events.length, 0);
    notes.push(
      `Labels hidden for ${n} ${n === 1 ? "event" : "events"}: filter to one quarter to see them.`,
    );
  }
  if (!markers.length && !hidden) notes.push("No events in this period.");
  return notes;
}

type Formatter = (params: { dataIndex: number }[] | { dataIndex: number }) => string;

/**
 * A chart's option with its markers: a thin dashed line at each, labeled at the top, on the first series, and the
 * axis tooltip naming the events of the category under the pointer after its own lines.
 */
export function withMarkers(
  option: EChartsCoreOption,
  markers: readonly Marker[],
): EChartsCoreOption {
  if (!markers.length) return option;
  const series = (option.series as Record<string, unknown>[] | undefined) ?? [];
  if (!series.length) return option;
  const tooltip = option.tooltip as { formatter?: Formatter } | undefined;
  const own = tooltip?.formatter;
  const byIndex = new Map(markers.map((m) => [m.index, m]));
  const lines = (index: number) => {
    const marker = byIndex.get(index);
    if (!marker) return "";
    return marker.events
      .map((e) => {
        const [when, what] = eventLines(e);
        return `<div style="margin-top:6px;font-size:11px;color:${chartTheme.textMuted}">${escapeHtml(when)}</div><div>${escapeHtml(what)}</div>`;
      })
      .join("");
  };
  return {
    ...option,
    ...(own && {
      tooltip: {
        ...tooltip,
        formatter: ((params) => {
          const first = Array.isArray(params) ? params[0] : params;
          return own(params) + (first ? lines(first.dataIndex) : "");
        }) as Formatter,
      },
    }),
    series: series.map((s, i) =>
      i === 0
        ? {
            ...s,
            markLine: {
              silent: true,
              symbol: ["none", "none"],
              animation: false,
              lineStyle: { color: chartTheme.axis, type: "dashed", width: 1 },
              label: {
                show: markers.length <= MAX_LABELLED,
                position: "end",
                color: chartTheme.textMuted,
                fontSize: 11,
                formatter: (p: { name: string }) => p.name,
              },
              data: markers.map((m) => ({ xAxis: m.index, name: m.label })),
            },
          }
        : s,
    ),
  };
}
