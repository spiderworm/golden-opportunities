import { useEffect, useState } from "react";
import { AddToReport } from "~/reports/AddToReport";
import {
  useLocation,
  useNavigation,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import { AssistantPanel } from "~/assistant/ui/AssistantPanel";
import { DeweyColumn } from "~/assistant/ui/DeweyColumn";
import type { ShellHandle } from "~/shell/Shell";
import { track } from "~/platform/analytics/analytics.client";
import { queryCache } from "~/platform/query-cache.client";
import { dataVersion } from "~/query/data-version.server";
import { trackServer } from "~/platform/analytics/analytics.server";
import type { Route } from "./+types/route";
import { DeweyChart } from "./charts/DeweyChart";
import { FilterBar } from "./FilterBar";
import { DIMENSION_LABELS, ledgersTitle, MEASURE_LABELS, measuresLabel } from "./format";
import { Heatmap, heatTitle } from "./Heatmap";
import { investigate } from "./investigation.server";
import { MeasureChart } from "./MeasureChart";
import { MetricTiles } from "./MetricTiles";
import { PlanLink } from "./PlanLink";
import { scatterTitle } from "./charts/scatter-chart";
import { lastYearLabels } from "./charts/last-year";
import { runQuery } from "~/query/run-query.server";
import { recordDiscoveries, type ObservedQuery } from "~/game/discoveries.server";
import { getGameSession } from "~/game/session.server";
import { currentQuarter } from "~/game/progress";
import { QueryError } from "~/query/errors";
import {
  DEFAULT_STATE,
  FILTER_PARTS,
  filtersExcept,
  onlyShownChanged,
  removeFilter,
  shownFilters,
  withShown,
  type FilterId,
  parseState,
  setAward,
  setDiscount,
  setSeries,
  setFilter,
  toggleCell,
  toggleFilterValue,
  toSearchParams,
  type InvestigateState,
  measuresOf,
  heatWindow,
  scatterProblem,
  lastYearBlock,
  shownQuarter,
} from "./state";
import { PinnedCharts } from "./pins/PinnedCharts";
import type { PinSpec } from "./pins/spec";
import { usePins } from "./pins/usePins";
import { TitleView } from "./TitleView";
import { cachedView } from "./view-cache.client";
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
  const investigation = investigate(state, runQuery, session.queryView, (query, result) =>
    observed.push({ query, result }),
  );
  // The observer includes only panels whose query differs from that panel's default.
  let evidence: "recorded" | "deferred" = "recorded";
  try {
    recordDiscoveries(session.save, session.queryView, observed);
  } catch (error) {
    if (!(error instanceof QueryError) || error.code !== "RATE_LIMITED") throw error;
    // Evidence is best effort under contention; the loaded ledgers remain usable, but the browser mustn't keep
    // this view, so showing it again asks (and records) again.
    evidence = "deferred";
    try {
      trackServer("discovery_record_deferred", { code: "SAVE_BUSY" });
    } catch {
      /* Rendering is independent of telemetry. */
    }
  }
  trackServer("investigate_loaded", {
    durationMs: Math.round(performance.now() - started),
    measure: state.measure,
    by: state.by,
    filters: Object.keys(state.filters).length,
    // Whether the heatmap's grid was cut off by the row limit (Plot, #264).
    heatmapCut: investigation.heatmap.truncated === true,
  });
  return {
    state,
    ...investigation,
    planned: currentQuarter(session.save) === null,
    dataVersion: dataVersion(session.save),
    evidence,
  };
}

/**
 * A view already shown under this data version comes from the browser's cache, without asking the server again
 * (view-cache.client.ts). Also on hydration, so the first view is kept too.
 */
export async function clientLoader({ request, serverLoader }: Route.ClientLoaderArgs) {
  return cachedView(queryCache, request.url, serverLoader);
}
clientLoader.hydrate = true as const;

/**
 * When Investigate doesn't look again, because no data changes:
 * - the memo's "seen" mark, the one action its page can send (the shell's fetcher);
 * - adding a filter to the bar, or taking off one with nothing chosen, which changes only the URL's `show`.
 * Anything else, a navigation or another action, revalidates as usual.
 */
export function shouldRevalidate({
  formAction,
  formMethod,
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formAction === "/alert/seen") return false;
  if (!formMethod && onlyShownChanged(currentUrl, nextUrl)) return false;
  return defaultShouldRevalidate;
}

export default function Investigate({ loaderData }: Route.ComponentProps) {
  const { state, tiles, chart, also, heatmap, drove, titleView, options, planned } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const location = useLocation();
  const refreshing =
    navigation.state === "loading" && navigation.location?.pathname === location.pathname;
  // The bar follows the URL. A filter added or taken off is on (or off) the bar in the same event, before the
  // navigation lands: otherwise React puts the checkbox back for a moment (measured: a check reads unchecked).
  const [chosen, setChosen] = useState<readonly FilterId[] | null>(null);
  useEffect(() => setChosen(null), [searchParams]);
  const shown = chosen ?? shownFilters(searchParams, state.filters);

  const pins = usePins(track);
  const chartPin = pinSpecFor(state, options.quarter);
  const heatPin = heatPinFor(state, options.quarter);

  /** The next question, with the bar's filters kept: a filter that gets a value stays on the bar when it's cleared. */
  // Not a default parameter: React Router's route splitting (on since the clientLoader, #191) can't follow a
  // default that refers to an earlier parameter, and the production build fails ("Expected a Path, but got null").
  function update(next: InvestigateState, nextShown?: readonly FilterId[]) {
    const bar = nextShown ?? shownFilters(searchParams, next.filters).concat(shown);
    setSearchParams(withShown(toSearchParams(next), bar), { preventScrollReset: true });
  }

  return (
    <div className={styles.layout}>
      <div className={styles.page} data-refreshing={refreshing || undefined} aria-busy={refreshing}>
        <PlanLink planned={planned} />
        <FilterBar
          filters={state.filters}
          options={options}
          shown={shown}
          onAdd={(id) => {
            track("investigate_filter_added", { filter: id });
            const next = [...shown, id];
            setChosen(next);
            update(state, next);
          }}
          onRemove={(id) => {
            const values = FILTER_PARTS[id].reduce(
              (n, d) => n + (state.filters[d]?.length ?? 0),
              0,
            );
            track("investigate_filter_removed", { filter: id, values });
            const next = shown.filter((other) => other !== id);
            setChosen(next);
            update(removeFilter(state, id), next);
          }}
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
            // Award names are a fixed list from the data, like discount rates: not content. Only a listed name is sent.
            const listed = typeof choice === "object" && options.award.includes(choice.award);
            track(
              "investigate_award_filtered",
              typeof choice === "object"
                ? { choice: "award", ...(listed ? { award: choice.award } : {}) }
                : { choice },
            );
            update(setAward(state, choice));
          }}
          onSeries={(choice) => {
            // A volume number is a fixed value from the data, like a discount rate: not content. Only a listed one is sent.
            const listed = typeof choice === "object" && options.volume.includes(choice.volume);
            track(
              "investigate_series_filtered",
              typeof choice === "object"
                ? { choice: "volume", ...(listed ? { volume: choice.volume } : {}) }
                : { choice },
            );
            update(setSeries(state, choice));
          }}
          onClear={() => {
            track("investigate_filters_cleared");
            update({ ...state, filters: DEFAULT_STATE.filters }, []);
          }}
        />
        <MetricTiles tiles={tiles} />
        <MeasureChart
          state={state}
          result={chart}
          also={also}
          quarters={options.quarter}
          onMeasures={(measures) => {
            // Measure ids are a fixed list, not content: "revenue+units".
            track("investigate_measure_changed", {
              measure: measures[0]!,
              measures: measures.join("+"),
              count: measures.length,
            });
            const [measure, ...rest] = measures;
            // Several measures can't also compare quarters (David's choice): that switches off.
            // The heatmap follows the chart's first measure until the player picks its own.
            const heat =
              state.heat.measure === state.measure
                ? { ...state.heat, measure: measure! }
                : state.heat;
            update({
              ...state,
              measure: measure!,
              also: rest,
              compare: rest.length ? false : state.compare,
              heat,
            });
          }}
          onSeries={(measure, shown) => track("investigate_series_toggled", { measure, shown })}
          onGroup={(by) => {
            track("investigate_regrouped", { by });
            update({ ...state, by });
          }}
          onCompare={(compare) => {
            track("investigate_compare_toggled", { compare });
            update({ ...state, compare });
          }}
          onScatter={(on) => {
            track("investigate_scatter_toggled", { on });
            update({ ...state, scatter: on });
          }}
          onLastYear={(on) => {
            track("investigate_last_year_toggled", { on });
            update({ ...state, lastYear: on });
          }}
          drove={drove}
          onDrove={(on) => {
            track("investigate_drove_toggled", { on, by: state.by });
            update({ ...state, drove: on, split: on && state.split });
          }}
          onSplit={(on) => {
            track("investigate_drove_split_toggled", { on });
            update({ ...state, split: on });
          }}
          onDrill={(value) => {
            const next = toggleFilterValue(state, state.by, value);
            track("investigate_drilldown", {
              source: "chart",
              dimension: state.by,
              selected: next.filters[state.by]?.length ?? 0,
            });
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
              track("investigate_drilldown", {
                source: "title_view",
                dimension: "month",
                selected: next.filters.month?.length ?? 0,
              });
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
          onCell={(row, col) => {
            const next = toggleCell(state, row, col);
            track("investigate_drilldown", {
              source: "heatmap",
              dimension: `${state.heat.rows}_${state.heat.cols}`,
              selected: next.filters[state.heat.cols] ? 1 : 0,
            });
            update(next);
          }}
          onHeat={(heat) => {
            track("investigate_heatmap_changed", {
              measure: heat.measure,
              rows: heat.rows,
              cols: heat.cols,
              period: heat.period,
            });
            update({ ...state, heat });
          }}
          // Pinned as it's shown: its table, if that's the view.
          onPin={(table) => pins.add(table ? { ...heatPin, table } : heatPin, "player")}
          pinned={pins.has(heatPin)}
          onTable={(table) =>
            track("table_toggled", {
              where: "heatmap",
              shown: table,
              kind: "heatmap",
            })
          }
        />
        <PinnedCharts
          pins={pins.pins}
          quarters={options.quarter}
          onRemove={pins.remove}
          onError={(code) => track("investigate_pin_failed", { code })}
          addToReport={(pin) => <AddToReport pin={pin} />}
          onTable={(pin, table) => {
            pins.setTable(pin.id, table);
            track("table_toggled", {
              where: "pin",
              shown: table,
              kind: pin.kind,
            });
          }}
        />
      </div>
      {/* Dewey: a column beside the dashboard on wide screens, after it below that. */}
      <DeweyColumn className={styles.assistant}>
        <AssistantPanel
          ChartView={DeweyChart}
          onPin={(chart) => pins.add(chart, "dewey")}
          onPinLookup={(pin) => pins.add(pin, "player")}
          isPinned={pins.has}
        />
      </DeweyColumn>
    </div>
  );
}

/** The heatmap as a pin: the same query it runs (investigation.server.ts, heatmapQuery), drawn as a heatmap. */
function heatPinFor(state: InvestigateState, quarters: readonly string[]): PinSpec {
  const { measure, rows, cols } = state.heat;
  // The span the card shows: past eight quarters, its window (heatWindow), so the pin is the grid the player saw.
  const window = heatWindow(state, quarters);
  const filter = {
    ...filtersExcept(state.filters, [rows, cols]),
    ...(window ? { quarter: window } : {}),
  };
  return {
    title: heatTitle(state.heat, window !== null),
    kind: "heatmap",
    query: { measure, by: [rows, cols], ...(Object.keys(filter).length ? { filter } : {}) },
  };
}

/** The main chart as a pin: the same query it runs, so the pin shows what the player saw. */
function pinSpecFor(state: InvestigateState, quarters: readonly string[]): PinSpec {
  const filter = filtersExcept(state.filters, [state.by]);
  // Pinned as shown: with last year, when the chart has it (Frank's #301), and titled so.
  const quarter = shownQuarter(state);
  const vs = state.lastYear && !lastYearBlock(state, quarters) && quarter;
  const scatter = state.scatter && scatterProblem(state.by, state.also) === null;
  const title = scatter
    ? scatterTitle(measuresOf(state), state.by)
    : `${measuresLabel(measuresOf(state))} by ${DIMENSION_LABELS[state.by].toLowerCase()}${state.compare ? " and quarter" : ""}${vs ? `, vs. ${lastYearLabels(vs, state.by).then}` : ""}`;
  return {
    title,
    // Over time, several measures are lines, as on the main chart; two can be a scatter plot instead of bars.
    kind: scatter
      ? "scatter"
      : state.also.length && (state.by === "month" || state.by === "quarter")
        ? "line"
        : "bar",
    ...(state.also.length ? { also: [...state.also] } : {}),
    query: {
      measure: state.measure,
      by: state.compare ? [state.by, "quarter"] : [state.by],
      ...(Object.keys(filter).length ? { filter } : {}),
      ...(vs ? { vs: "last_year" as const } : {}),
    },
  };
}
