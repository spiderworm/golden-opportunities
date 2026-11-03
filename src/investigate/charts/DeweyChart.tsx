// A chart Dewey drew in his chat (show_chart), with the pins' chart components: the panel gets it from the page,
// so the assistant's code needs nothing of Investigate's. Like a pin, it drills nowhere, and past the palette's
// series it's a table.
import { useMemo } from "react";

import type { ChartRenderer } from "~/assistant/ui/AssistantPanel";
import { MAX_SERIES } from "~/platform/charts/chart-theme";
import { EChart } from "~/platform/charts/EChart";
import { categoryHeight, categoryModel, categoryOption, legendItems } from "./category-chart";
import { Legend } from "./Legend";
import { ResultTable } from "./ResultTable";

const HEIGHT = 220;

export const DeweyChart: ChartRenderer = ({ chart, result }) => {
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
  if (result.rows.length === 0) return <p>Nothing matched.</p>;
  if (!model || !option || model.series.length > MAX_SERIES)
    return <ResultTable result={result} height={HEIGHT} />;
  return (
    <>
      <Legend items={legendItems(model, [])} label="Series" />
      <EChart option={option} height={categoryHeight(model, HEIGHT)} label={chart.title} />
    </>
  );
};
