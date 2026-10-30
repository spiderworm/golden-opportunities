// The only module that imports ECharts' runtime. EChart loads it lazily, so the
// route's own chunk (and the server-rendered tiles and filters) don't wait for
// it. Register just what the bar charts use: the screen draws its own legend,
// and the heatmap is an HTML grid.
import { BarChart } from "echarts/charts";
import { AriaComponent, GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

echarts.use([BarChart, AriaComponent, GridComponent, TooltipComponent, SVGRenderer]);

export const init = echarts.init;
