// A chart Dewey drew in his chat (show_chart), with the pins' chart components: the panel gets it from the page,
// so the assistant's code needs nothing of Investigate's. Like a pin, it drills nowhere, and past the palette's
// series it's a table. Several measures (req_2d436ee864cd) are Investigate's chart of several: a series each, on an
// axis per unit (David, 2 Nov 2026), or the table where that chart can't draw them (severalMeasuresProblem).
import { useMemo } from "react";

import type { ChartRenderer } from "~/assistant/ui/AssistantPanel";
import { MAX_SERIES } from "~/platform/charts/chart-theme";
import { NO_CHART } from "~/platform/ui/TableToggle";
import { EChart } from "~/platform/charts/EChart";
import { perMeasure } from "~/query/result";
import { queryMeasures, type Query, type QueryResult } from "~/query/types";
import { MEASURE_LABELS } from "../format";
import { severalMeasuresProblem } from "../pins/spec";
import type { ChartMeasure } from "../state";
import {
  categoryHeight,
  categoryModel,
  categoryOption,
  legendItems,
  type CategoryModel,
} from "./category-chart";
import { EvidenceLegend, Legend } from "./Legend";
import { measuresModel, measuresOption } from "./measures-chart";
import { ResultTable } from "./ResultTable";

const HEIGHT = 220;

/** Why this chart can't draw a lookup's query, for the panel's Table toggle: several measures it doesn't take. */
export function deweyChartProblem(query: Query): string | null {
  const problem = severalMeasuresProblem(query);
  return problem ? NO_CHART[problem] : null;
}

export const DeweyChart: ChartRenderer = ({ chart, result }) => {
  if (result.rows.length === 0) return <p>Nothing matched.</p>;
  return queryMeasures(chart.query).length > 1 ? (
    <SeveralMeasures query={chart.query} result={result} title={chart.title} />
  ) : (
    <OneMeasure chart={chart} result={result} />
  );
};

const OneMeasure: ChartRenderer = ({ chart, result }) => {
  const [x, seriesBy = null] = chart.query.by;
  const model = useMemo(
    () => (x ? categoryModel(result, x, seriesBy, [], { limit: chart.query.limit }) : null),
    [result, x, seriesBy, chart.query.limit],
  );
  const option = useMemo(
    () =>
      model
        ? categoryOption(model, {
            kind: chart.kind === "line" ? "line" : "bar",
            quarters: [],
            drill: false,
          })
        : null,
    [model, chart.kind],
  );
  if (!model || !option || model.series.length > MAX_SERIES)
    return <ResultTable result={result} height={HEIGHT} />;
  return (
    <>
      <Legend items={legendItems(model, [])} label="Series" />
      <EvidenceLegend model={model} />
      <EChart option={option} height={categoryHeight(model, HEIGHT)} label={chart.title} />
    </>
  );
};

/** A lookup of several measures: Investigate's chart of several, with its legend, from the lookup's one result. */
function SeveralMeasures({
  query,
  result,
  title,
}: {
  query: Query;
  result: QueryResult;
  title: string;
}) {
  const [x] = query.by;
  const drawable = x !== undefined && severalMeasuresProblem(query) === null;
  const many = useMemo(
    () =>
      drawable
        ? measuresModel(
            perMeasure(query, result).map((one) => one.result),
            queryMeasures(query) as ChartMeasure[],
            x!,
          )
        : null,
    [drawable, query, result, x],
  );
  const option = useMemo(() => (many ? measuresOption(many) : null), [many]);
  // The panel's toggle is off for these, with its reason; this is only in case one is drawn anyway.
  if (!many || !option) return <ResultTable result={result} height={HEIGHT} />;
  return (
    <>
      <Legend
        items={many.measures.map((m) => ({ label: MEASURE_LABELS[m.measure], color: m.color }))}
        label="Measures"
      />
      <EChart
        option={option}
        // Only its categories and orientation set its height.
        height={categoryHeight(
          { categories: many.categories, horizontal: many.horizontal } as CategoryModel,
          HEIGHT,
        )}
        label={title}
      />
    </>
  );
}
