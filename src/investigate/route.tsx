import { useLocation, useNavigation, useSearchParams } from "react-router";

import type { QueryView } from "~/query/types";
import type { ShellHandle } from "~/shell/Shell";
import { track } from "~/platform/analytics/analytics.client";
import { trackServer } from "~/platform/analytics/analytics.server";
import type { Route } from "./+types/route";
import { FilterBar } from "./FilterBar";
import { DIMENSION_LABELS, MEASURE_LABELS } from "./format";
import { Heatmap } from "./Heatmap";
import { investigate } from "./investigation.server";
import { MeasureChart } from "./MeasureChart";
import { MetricTiles } from "./MetricTiles";
import { runQuery } from "./query-stub.server";
import {
  DEFAULT_STATE,
  filtersExcept,
  parseState,
  setDiscount,
  setFilter,
  toggleCell,
  toggleFilterValue,
  toSearchParams,
  type InvestigateState,
} from "./state";
import { PinnedCharts } from "./pins/PinnedCharts";
import type { PinSpec } from "./pins/spec";
import { usePins } from "./pins/usePins";
import { TitleView } from "./TitleView";
import styles from "./Investigate.module.css";

export const handle: ShellHandle = { title: "Investigate" };

// TODO(game-state): the visible periods come from Frank's game state once it
// lands. Until then the player sees all of 2193, as the HTTP adapter does.
const VIEW: QueryView = { periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"], includeUndated: true };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Investigate | Orbital Books" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const started = performance.now();
  const state = parseState(new URL(request.url).searchParams);
  const investigation = investigate(state, runQuery, VIEW);
  trackServer("investigate_loaded", {
    durationMs: Math.round(performance.now() - started),
    measure: state.measure,
    by: state.by,
    filters: Object.keys(state.filters).length,
  });
  return { state, ...investigation };
}

export default function Investigate({ loaderData }: Route.ComponentProps) {
  const { state, tiles, chart, heatmap, titleView, options } = loaderData;
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const location = useLocation();
  const refreshing = navigation.state === "loading" && navigation.location?.pathname === location.pathname;

  const pins = usePins(track);
  // TODO(assistant): when Sage's panel (#19) is on this page, give it onPin={(chart) => pins.add(chart, "dewey")}.
  const chartPin = pinSpecFor(state);

  function update(next: InvestigateState) {
    setSearchParams(toSearchParams(next), { preventScrollReset: true });
  }

  return (
    <div className={styles.page} data-refreshing={refreshing || undefined} aria-busy={refreshing}>
      <FilterBar
        filters={state.filters}
        options={options}
        onChange={(dimension, values) => {
          track("investigate_filter_changed", { dimension, values: values.length });
          update(setFilter(state, dimension, values));
        }}
        onDiscount={(choice) => {
          // Rates are labels like "15%", not content; "all", "full" and "any" are fixed choices.
          track("investigate_discount_filtered", { choice });
          update(setDiscount(state, choice));
        }}
        onClear={() => {
          track("investigate_filters_cleared");
          update({ ...state, filters: DEFAULT_STATE.filters });
        }}
      />
      <MetricTiles tiles={tiles} />
      <MeasureChart
        state={state}
        result={chart}
        quarters={options.quarter}
        onMeasure={(measure) => {
          track("investigate_measure_changed", { measure });
          update({ ...state, measure });
        }}
        onGroup={(by) => {
          track("investigate_regrouped", { by });
          update({ ...state, by });
        }}
        onCompare={(compare) => {
          track("investigate_compare_toggled", { compare });
          update({ ...state, compare });
        }}
        onDrill={(value) => {
          const next = toggleFilterValue(state, state.by, value);
          track("investigate_drilldown", { source: "chart", dimension: state.by, selected: next.filters[state.by]?.length ?? 0 });
          update(next);
        }}
        onTable={(shown) => track("investigate_table_toggled", { shown })}
        onPin={() => pins.add(chartPin, "player")}
        pinned={pins.has(chartPin.kind, chartPin.query)}
      />
      {titleView && (
        <TitleView
          state={state}
          title={titleView.title}
          result={titleView.result}
          quarters={options.quarter}
          onMonth={(month) => {
            const next = toggleFilterValue(state, "month", month);
            track("investigate_drilldown", { source: "title_view", dimension: "month", selected: next.filters.month?.length ?? 0 });
            update(next);
          }}
          onClose={() => {
            track("investigate_title_closed");
            update(setFilter(state, "title", []));
          }}
        />
      )}
      <Heatmap
        state={state}
        result={heatmap}
        quarters={options.quarter}
        onCell={(weekday, month) => {
          const next = toggleCell(state, weekday, month);
          track("investigate_drilldown", { source: "heatmap", dimension: "weekday_month", selected: next.filters.month ? 1 : 0 });
          update(next);
        }}
      />
      <PinnedCharts
        pins={pins.pins}
        quarters={options.quarter}
        onRemove={pins.remove}
        onError={(code) => track("investigate_pin_failed", { code })}
      />
    </div>
  );
}

/** The main chart as a pin: the same query it runs, so the pin shows what the player saw. */
function pinSpecFor(state: InvestigateState): PinSpec {
  const filter = filtersExcept(state.filters, [state.by]);
  const title = `${MEASURE_LABELS[state.measure]} by ${DIMENSION_LABELS[state.by].toLowerCase()}${state.compare ? " and quarter" : ""}`;
  return {
    title,
    kind: "bar",
    query: {
      measure: state.measure,
      by: state.compare ? [state.by, "quarter"] : [state.by],
      ...(Object.keys(filter).length ? { filter } : {}),
    },
  };
}
