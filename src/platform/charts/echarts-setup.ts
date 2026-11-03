// The only module that imports ECharts' runtime. EChart loads it lazily, so the
// route's own chunk (and the server-rendered tiles and filters) don't wait for
// it. Register just what the charts use: bars, lines, scatter plots, a marked line
// (Reports' strike line at 70), and custom series (average rating's likely range,
// drawn as whiskers). Screens draw their own legends, and the heatmap is an HTML grid.
import { BarChart, CustomChart, LineChart, ScatterChart } from "echarts/charts";
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
  CustomChart,
  LineChart,
  ScatterChart,
  AriaComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  SVGRenderer,
]);

export const init = echarts.init;
