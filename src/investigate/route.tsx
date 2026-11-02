import { Link, useLocation, useNavigation, useSearchParams } from "react-router";

import { AssistantPanel } from "~/assistant/ui/AssistantPanel";
import type { ShellHandle } from "~/shell/Shell";
import { track } from "~/platform/analytics/analytics.client";
import { trackServer } from "~/platform/analytics/analytics.server";
import type { Route } from "./+types/route";
import { FilterBar } from "./FilterBar";
import { DIMENSION_LABELS, ledgersTitle, MEASURE_LABELS } from "./format";
import { Heatmap } from "./Heatmap";
import { investigate } from "./investigation.server";
import { MeasureChart } from "./MeasureChart";
import { MetricTiles } from "./MetricTiles";
import { runQuery } from "~/query/run-query.server";
import { recordDiscoveries, type ObservedQuery } from "~/game/discoveries.server";
import { getGameSession } from "~/game/session.server";
import { currentQuarter } from "~/game/progress";
import { QueryError } from "~/query/errors";
import {
  DEFAULT_STATE,
  filtersExcept,
  parseState,
  setAward,
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

export const handle: ShellHandle = { title: ledgersTitle };


export function meta({}: Route.MetaArgs) {
  return [{ title: "Investigate | Orbital Books" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const started = performance.now();
  const state = parseState(new URL(request.url).searchParams);
  const session = getGameSession(request);
  const observed: ObservedQuery[] = [];
  const investigation = investigate(state, runQuery, session.queryView, (query, result) => observed.push({ query, result }));
  // The observer includes only panels whose query differs from that panel's default.
  try {
    recordDiscoveries(session.save, session.queryView, observed);
  } catch (error) {
    if (!(error instanceof QueryError) || error.code !== 'RATE_LIMITED') throw error;
    // Evidence is best effort under contention; the loaded ledgers remain usable.
    try { trackServer('discovery_record_deferred', { code: 'SAVE_BUSY' }); } catch { /* Rendering is independent of telemetry. */ }
  }
  trackServer("investigate_loaded", {
    durationMs: Math.round(performance.now() - started),
    measure: state.measure,
    by: state.by,
    filters: Object.keys(state.filters).length,
  });
  return { state, ...investigation, planned: currentQuarter(session.save) === null };
}

export default function Investigate({ loaderData }: Route.ComponentProps) {
  const { state, tiles, chart, heatmap, titleView, options, planned } = loaderData;
  const [, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const location = useLocation();
  const refreshing = navigation.state === "loading" && navigation.location?.pathname === location.pathname;

  const pins = usePins(track);
  const chartPin = pinSpecFor(state);

  function update(next: InvestigateState) {
    setSearchParams(toSearchParams(next), { preventScrollReset: true });
  }

  return (
    <div className={styles.layout}>
      <div className={styles.page} data-refreshing={refreshing || undefined} aria-busy={refreshing}>
        <div className={styles.pageActions}>
          <Link
            to={planned ? "/result" : "/decide"}
            className={styles.planLink}
            onClick={() => track("investigate_plan_link", { to: planned ? "result" : "decide" })}
          >
            {planned ? "See the results" : "Write the plan"}
          </Link>
        </div>
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
          onAward={(choice) => {
            // Award names are a fixed list from the data, like discount rates: not content.
            track("investigate_award_filtered", typeof choice === "object" ? { choice: "award", award: choice.award } : { choice });
            update(setAward(state, choice));
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
          pinned={pins.has(chartPin)}
        />
        {titleView && (
          <TitleView
            state={state}
            title={titleView.title}
            result={titleView.result}
            ratings={titleView.ratings}
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
      {/* Dewey: a column beside the dashboard on wide screens, after it below that. */}
      <aside className={styles.assistant} aria-label="Dewey">
        <AssistantPanel onPin={(chart) => pins.add(chart, "dewey")} onPinLookup={(pin) => pins.add(pin, "player")} isPinned={pins.has} />
      </aside>
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
