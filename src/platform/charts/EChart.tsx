import { useEffect, useRef } from "react";
import type { ECElementEvent, ECharts, EChartsCoreOption } from "echarts/core";
import { cutOff } from "~/platform/lazy/cut-off";

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
  /** Which axis holds the categories, for onCategoryClick. */
  categoryAxis?: "x" | "y";
}

/** Draws an ECharts option on the client; the server renders an empty frame of the same size. */
export function EChart({ option, height, label, onClick, onCategoryClick, categoryAxis = "x" }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const latest = useRef({ option, onClick, onCategoryClick, categoryAxis });
  latest.current = { option, onClick, onCategoryClick, categoryAxis };

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import("./echarts-setup").then(({ init }) => {
      if (disposed || !ref.current) return;
      const instance = init(ref.current, null, { renderer: "svg" });
      chart.current = instance;
      instance.setOption(latest.current.option);
      instance.on("click", (event) => latest.current.onClick?.(event as ECElementEvent));

      const zr = instance.getZr();
      const categoryAt = (x: number, y: number) => {
        if (!latest.current.onCategoryClick || !instance.containPixel("grid", [x, y])) return null;
        // Converting through the grid gives [x value, y value]; the category axis holds the index.
        const point = instance.convertFromPixel({ gridIndex: 0 }, [x, y]) as number[] | null;
        const index = point?.[latest.current.categoryAxis === "x" ? 0 : 1];
        return typeof index === "number" ? index : null;
      };
      zr.on("click", (event) => {
        const index = categoryAt(event.offsetX, event.offsetY);
        if (index !== null) latest.current.onCategoryClick?.(index);
      });
      zr.on("mousemove", (event) => {
        if (categoryAt(event.offsetX, event.offsetY) !== null) zr.setCursorStyle("pointer");
      });

      const resize = new ResizeObserver(() => instance.resize());
      resize.observe(ref.current);
      cleanup = () => {
        resize.disconnect();
        instance.dispose();
      };
    }, cutOff("charts"));
    return () => {
      disposed = true;
      cleanup();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} role="img" aria-label={label} style={{ height, width: "100%" }} />;
}
