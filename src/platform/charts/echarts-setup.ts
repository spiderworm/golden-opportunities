// The only module that imports ECharts' runtime. EChart loads it lazily, so the
// route's own chunk (and the server-rendered tiles and filters) don't wait for
// it. Register just what the charts use: bars and lines, and a marked line
// (Reports' strike line at 70). Screens draw their own legends, and the heatmap
// is an HTML grid.
import { BarChart, LineChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  AriaComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  SVGRenderer,
]);

export const init = echarts.init;
