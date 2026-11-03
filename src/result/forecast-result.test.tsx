import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { MeasureResult } from "~/forecast/forecast";
import { ForecastLines, resultLine } from "./forecast-result";

const result = (over: Partial<MeasureResult>): MeasureResult => ({
  forecast: { point: 140000, low: 130000, high: 150000 },
  actual: 162300,
  where: "above",
  error: -22300,
  errorPct: -22300 / 162300,
  ...over,
});

describe("a forecast against what happened (Plot's copy, section 10)", () => {
  it("says where the actual landed, and how far the expected figure was off", () => {
    expect(resultLine("revenue", result({}))).toBe(
      "Revenue: $162,300, above your range of $130,000 to $150,000. You expected $140,000: off by $22,300 (14%).",
    );
    expect(
      resultLine(
        "revenue",
        result({ actual: 128000, where: "below", error: 12000, errorPct: 12000 / 128000 }),
      ),
    ).toBe(
      "Revenue: $128,000, below your range of $130,000 to $150,000. You expected $140,000: off by $12,000 (9%).",
    );
  });

  it("says spot on when it was exactly right, and counts units as units", () => {
    expect(
      resultLine(
        "units",
        result({
          forecast: { point: 13093, low: 12000, high: 14000 },
          actual: 13093,
          where: "inside",
          error: 0,
          errorPct: 0,
        }),
      ),
    ).toBe(
      "Units sold: 13,093, inside your range of 12,000 to 14,000. You expected 13,093: spot on.",
    );
  });

  it("leaves the percent out when nothing sold", () => {
    expect(
      resultLine(
        "units",
        result({
          forecast: { point: 5, low: 0, high: 10 },
          actual: 0,
          where: "inside",
          error: 5,
          errorPct: null,
        }),
      ),
    ).toBe("Units sold: 0, inside your range of 0 to 10. You expected 5: off by 5.");
  });

  it("draws a line per measure forecast, then the note; nothing without a forecast", () => {
    const html = renderToString(
      <ForecastLines
        result={{ quarter: "2194-Q1", revenue: result({}), note: "The sale should lift it." }}
      />,
    );
    expect(html).toContain("How your forecast did");
    expect(html.match(/<li/g)).toHaveLength(1);
    expect(html).toContain('data-where="above"');
    expect(html).toContain("The sale should lift it.");
    expect(renderToString(<ForecastLines result={{ quarter: "2194-Q1" }} />)).toBe("");
  });
});
