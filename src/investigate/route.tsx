import { useLocation, useNavigation, useSearchParams } from "react-router";

import { AssistantPanel } from "~/assistant/ui/AssistantPanel";
import type { ShellHandle } from "~/shell/Shell";
import { track } from "~/platform/analytics/analytics.client";
import { trackServer } from "~/platform/analytics/analytics.server";
import type { Route } from "./+types/route";
import { FilterBar } from "./FilterBar";
import { Heatmap } from "./Heatmap";
import { investigate } from "./investigation.server";
import { MeasureChart } from "./MeasureChart";
import { MetricTiles } from "./MetricTiles";
import { runQuery } from "~/query/run-query.server";
import { resolveQueryView } from "~/query/view.server";
import {
  DEFAULT_STATE,
  parseState,
  setDiscount,
  setFilter,
  toggleCell,
  toggleFilterValue,
  toSearchParams,
  type InvestigateState,
} from "./state";
import { TitleView } from "./TitleView";
import styles from "./Investigate.module.css";

export const handle: ShellHandle = { title: "Investigate" };


export function meta({}: Route.MetaArgs) {
  return [{ title: "Investigate | Orbital Books" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const started = performance.now();
  const state = parseState(new URL(request.url).searchParams);
  // The server decides what the player can see; Frank's game state will resolve it per save.
  const investigation = investigate(state, runQuery, resolveQueryView());
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

  function update(next: InvestigateState) {
    setSearchParams(toSearchParams(next), { preventScrollReset: true });
  }

  return (
    <div className={styles.layout}>
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
      </div>
      {/* Dewey: a column beside the dashboard on wide screens, after it below that. */}
      <aside className={styles.assistant} aria-label="Dewey">
        <AssistantPanel />
      </aside>
    </div>
  );
}
