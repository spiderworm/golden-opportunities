import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ForecastCalibration } from "./ForecastCalibration";
import {
  calibrationLines,
  calibrationOption,
  CALIBRATION_COPY as COPY,
} from "./forecast-calibration";
import type { Calibration, MeasureCalibration } from "~/forecast/forecast";

const measure = (over: Partial<MeasureCalibration>): MeasureCalibration => ({
  measure: "revenue",
  n: 3,
  hits: 2,
  hitRate: 2 / 3,
  bias: 0.042,
  sharpness: 0.075,
  judged: true,
  ...over,
});

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("the calibration's words (Plot's copy, section 10)", () => {
  it("counts the quarters forecast", () => {
    expect(COPY.count(3, 5)).toBe("3 of 5 quarters forecast");
    expect(COPY.count(1, 1)).toBe("1 of 1 quarter forecast");
  });

  it("gives the hit rate, the lean and the typical range, each with its tooltip", () => {
    expect(calibrationLines(measure({}))).toEqual([
      { text: "2 of 3 inside your range (target: 4 in 5)", tip: COPY.hitRateTip },
      { text: "You tend to forecast high, by 4.2% on average.", tip: COPY.biasTip },
      { text: "Typical range: ±7.5% of your expected figure", tip: COPY.sharpnessTip },
    ]);
    expect(COPY.bias(-0.031)).toBe("You tend to forecast low, by 3.1% on average.");
    // Within ±2%, no lean.
    expect(COPY.bias(0.019)).toBe("No lean either way.");
    expect(COPY.bias(-0.02)).toBe("No lean either way.");
  });

  it("says too few under 3, and leaves out what it can't say", () => {
    expect(calibrationLines(measure({ n: 2, judged: false }))).toEqual([
      { text: "Too few forecasts to judge yet: 2 so far." },
    ]);
    // Every expected figure 0: no sharpness (Sim); every actual 0: no lean.
    expect(calibrationLines(measure({ sharpness: null, bias: null })).map((l) => l.text)).toEqual([
      "2 of 3 inside your range (target: 4 in 5)",
    ]);
  });
});

const history: Calibration["history"] = [
  {
    quarter: "2194-Q1",
    revenue: {
      forecast: { point: 140000, low: 130000, high: 150000 },
      actual: 162300,
      where: "above",
      error: -22300,
      errorPct: -22300 / 162300,
    },
  },
  { quarter: "2194-Q2" },
  {
    quarter: "2194-Q3",
    revenue: {
      forecast: { point: 150000, low: 140000, high: 165000 },
      actual: 152000,
      where: "inside",
      error: -2000,
      errorPct: -2000 / 152000,
    },
  },
];

describe("the calibration's chart", () => {
  it("draws only the quarters forecast for the measure: a band, the expected line and the actual points", () => {
    const option = calibrationOption("revenue", history) as {
      xAxis: { data: string[] };
      series: { name: string; data: unknown[] }[];
    };
    expect(option.xAxis.data).toEqual(["Q1 2194", "Q3 2194"]);
    expect(option.series.map((s) => s.name)).toEqual(["low", "80% range", "Expected", "Actual"]);
    // The band stacks the range on its low end.
    expect(option.series[0]!.data).toEqual([130000, 140000]);
    expect(option.series[1]!.data).toEqual([20000, 25000]);
    // Outside the range, hollow; inside, filled.
    const points = option.series[3]!.data as { itemStyle: { borderWidth?: number } }[];
    expect(points[0]!.itemStyle.borderWidth).toBe(2);
    expect(points[1]!.itemStyle.borderWidth).toBeUndefined();
    expect(calibrationOption("units", history)).toBeNull();
  });
});

describe("the section", () => {
  const calibration: Calibration = {
    forecast: 2,
    played: 3,
    revenue: measure({ n: 2, hits: 1, hitRate: 0.5, judged: false }),
    units: measure({
      measure: "units",
      n: 0,
      hits: 0,
      hitRate: null,
      bias: null,
      sharpness: null,
      judged: false,
    }),
    history,
  };

  it("counts, then shows each measure forecast, and none that wasn't", () => {
    const t = text(renderToString(<ForecastCalibration calibration={calibration} />));
    expect(t).toContain("Your forecasts 2 of 3 quarters forecast");
    expect(t).toContain("Revenue Too few forecasts to judge yet: 2 so far.");
    expect(t).not.toContain("Units sold");
  });

  it("explains each judged line as its description, shown on hover and focus", () => {
    const html = renderToString(
      <ForecastCalibration calibration={{ ...calibration, revenue: measure({}) }} />,
    );
    expect(html.match(/role="tooltip"/g)).toHaveLength(3);
    expect(html).toMatch(/tabindex="0" aria-describedby="[^"]+-tip-0"/);
  });

  it("with nothing forecast, is the count alone", () => {
    const t = text(
      renderToString(
        <ForecastCalibration calibration={{ ...calibration, forecast: 0, history: [] }} />,
      ),
    );
    expect(t).toBe("Your forecasts 0 of 3 quarters forecast");
  });
});
