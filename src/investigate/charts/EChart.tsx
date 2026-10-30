import { useEffect, useRef } from "react";
import { BarChart, HeatmapChart } from "echarts/charts";
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import * as echarts from "echarts/core";
import type { ECElementEvent, EChartsCoreOption } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

echarts.use([BarChart, HeatmapChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, SVGRenderer]);

export type ChartClick = Pick<ECElementEvent, "dataIndex" | "seriesIndex" | "name" | "data">;

export interface EChartProps {
  option: EChartsCoreOption;
  /** Fixed height in px, axis labels included, so the card never jumps. */
  height: number;
  /** What the chart shows, for screen readers. */
  label: string;
  onClick?: (event: ChartClick) => void;
  /** Category charts: a click anywhere in a category's band, not just on its bar. */
  onCategoryClick?: (index: number) => void;
}

/** Draws an ECharts option on the client; the server renders an empty frame of the same size. */
export function EChart({ option, height, label, onClick, onCategoryClick }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const categoryRef = useRef(onCategoryClick);
  categoryRef.current = onCategoryClick;

  useEffect(() => {
    const instance = echarts.init(ref.current!, null, { renderer: "svg" });
    chart.current = instance;
    instance.on("click", (event) => clickRef.current?.(event as ECElementEvent));
    const zr = instance.getZr();
    const categoryAt = (x: number, y: number) => {
      if (!categoryRef.current || !instance.containPixel("grid", [x, y])) return null;
      const index = instance.convertFromPixel({ gridIndex: 0 }, [x, y]);
      return typeof index === "number" ? index : Array.isArray(index) ? (index[0] ?? null) : null;
    };
    zr.on("click", (event) => {
      const index = categoryAt(event.offsetX, event.offsetY);
      if (index !== null) categoryRef.current?.(index);
    });
    zr.on("mousemove", (event) => {
      if (categoryAt(event.offsetX, event.offsetY) !== null) zr.setCursorStyle("pointer");
    });
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(ref.current!);
    return () => {
      resize.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} role="img" aria-label={label} style={{ height, width: "100%" }} />;
}
