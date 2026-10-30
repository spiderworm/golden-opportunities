import { useLocation, useNavigation, useSearchParams } from "react-router";

import { AssistantPanel } from "~/assistant/ui/AssistantPanel";
import type { QueryView } from "~/query/types";
import type { ShellHandle } from "~/shell/Shell";
import { noopTrack } from "~/shell/track";
import type { Route } from "./+types/route";
import { FilterBar } from "./FilterBar";
import { Heatmap } from "./Heatmap";
import { investigate } from "./investigation.server";
import { MeasureChart } from "./MeasureChart";
import { MetricTiles } from "./MetricTiles";
import { runQuery } from "./query-stub.server";
import { DEFAULT_STATE, parseState, setFilter, toggleCell, toggleFilterValue, toSearchParams, type InvestigateState } from "./state";
import styles from "./Investigate.module.css";

export const handle: ShellHandle = { title: "Investigate" };

// TODO(game-state): the visible periods come from Frank's game state once it
// lands. Until then the player sees all of 2193, as the HTTP adapter does.
const VIEW: QueryView = { periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"], includeUndated: true };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Investigate | Orbital Books" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const state = parseState(new URL(request.url).searchParams);
  return { state, ...investigate(state, runQuery, VIEW) };
}

export default function Investigate({ loaderData }: Route.ComponentProps) {
  const { state, tiles, chart, heatmap, options } = loaderData;
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const location = useLocation();
  // TODO(analytics): switch to track from ~/platform/analytics/analytics.client when it merges.
  const track = noopTrack;
  const refreshing = navigation.state === "loading" && navigation.location?.pathname === location.pathname;

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
      />
      <Heatmap
        state={state}
        result={heatmap}
        onCell={(weekday, month) => {
          const next = toggleCell(state, weekday, month);
          track("investigate_drilldown", { source: "heatmap", dimension: "weekday_month", selected: next.filters.month ? 1 : 0 });
          update(next);
        }}
      />
      <AssistantPanel />
    </div>
  );
}
