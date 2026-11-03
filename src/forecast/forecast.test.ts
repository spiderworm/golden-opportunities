import { describe, expect, it } from "vitest";
import {
  checkForecastField,
  checkNote,
  FORECAST_FIELDS,
  forecastFromForm,
  validForecasts,
  type Forecast,
} from "./forecast";

const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? null;

describe("a forecast's figures, as the player typed them", () => {
  it("reads point, low and high, with separators and a dollar sign allowed", () => {
    expect(checkForecastField("revenue", "$140,000,130000,150000.50")).toEqual({
      ok: false,
      reason: "number",
    });
    expect(checkForecastField("revenue", "$140000, 130000 ,150000.50")).toEqual({
      ok: true,
      entry: { point: 140000, low: 130000, high: 150000.5 },
    });
    expect(checkForecastField("units", "9000,8000,10000")).toEqual({
      ok: true,
      entry: { point: 9000, low: 8000, high: 10000 },
    });
  });

  it("is no forecast when all three are empty, or the field is absent", () => {
    expect(checkForecastField("revenue", ",,")).toEqual({ ok: true, entry: null });
    expect(checkForecastField("revenue", null)).toEqual({ ok: true, entry: null });
  });

  it("names each thing that's wrong, as Plot's lines do", () => {
    const reason = (measure: "revenue" | "units", value: string) => {
      const checked = checkForecastField(measure, value);
      return checked.ok ? "ok" : checked.reason;
    };
    expect(reason("revenue", "140000,,150000")).toBe("partial");
    expect(reason("revenue", "abc,1,2")).toBe("number");
    expect(reason("units", "9000.5,8000,10000")).toBe("number");
    expect(reason("revenue", "140000.123,1,150000")).toBe("number");
    expect(reason("revenue", "-5,0,10")).toBe("negative");
    expect(reason("units", "-$5,0,10")).toBe("negative");
    expect(reason("revenue", "20000000,0,30000000")).toBe("too_large");
    expect(reason("revenue", "140000,145000,150000")).toBe("low_above_point");
    expect(reason("revenue", "160000,130000,150000")).toBe("point_above_high");
    expect(reason("units", "1,2")).toBe("number");
    expect(reason("units", "1,1,1")).toBe("ok");
    expect(reason("units", "0,0,0")).toBe("ok");
    expect(reason("units", "1e3,0,2000")).toBe("number");
    expect(reason("units", "Infinity,0,1")).toBe("number");
  });
});

describe("the note", () => {
  it("is trimmed, up to 500 characters, of plain text", () => {
    expect(checkNote("  The sale should lift it.  ")).toEqual({
      ok: true,
      note: "The sale should lift it.",
    });
    expect(checkNote("   ")).toEqual({ ok: true, note: null });
    expect(checkNote("x".repeat(500))).toMatchObject({ ok: true });
    expect(checkNote("x".repeat(501))).toEqual({ ok: false, reason: "too_long" });
    // Characters, not UTF-16 units: an emoji counts once.
    expect(checkNote("\u{1F4DA}".repeat(500))).toMatchObject({ ok: true });
    expect(checkNote("two\nlines")).toMatchObject({ ok: true });
    expect(checkNote("a‮b")).toEqual({ ok: false, reason: "invalid" });
    expect(checkNote("a\u0007b")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("the plan form's forecast", () => {
  it("is null when nothing is forecast, even with a note", () => {
    expect(forecastFromForm("2194-Q1", form({}))).toEqual({ ok: true, forecast: null });
    expect(
      forecastFromForm(
        "2194-Q1",
        form({ [FORECAST_FIELDS.revenue]: ",,", [FORECAST_FIELDS.note]: "a hunch" }),
      ),
    ).toEqual({ ok: true, forecast: null });
  });

  it("keeps either measure, or both, and the note", () => {
    expect(
      forecastFromForm(
        "2194-Q2",
        form({ [FORECAST_FIELDS.units]: "9000,8000,10000", [FORECAST_FIELDS.note]: " Sale. " }),
      ),
    ).toEqual({
      ok: true,
      forecast: {
        quarter: "2194-Q2",
        units: { point: 9000, low: 8000, high: 10000 },
        note: "Sale.",
      },
    });
  });

  it("names the first field that's wrong", () => {
    expect(
      forecastFromForm(
        "2194-Q1",
        form({
          [FORECAST_FIELDS.revenue]: "2,1,3",
          [FORECAST_FIELDS.units]: "5,,",
          [FORECAST_FIELDS.note]: "x".repeat(501),
        }),
      ),
    ).toEqual({ ok: false, problem: { field: "units", reason: "partial" } });
    expect(
      forecastFromForm(
        "2194-Q1",
        form({ [FORECAST_FIELDS.revenue]: "1,2,3", [FORECAST_FIELDS.note]: "x".repeat(501) }),
      ),
    ).toEqual({ ok: false, problem: { field: "revenue", reason: "low_above_point" } });
  });
});

describe("the save's forecasts", () => {
  const q1: Forecast = { quarter: "2194-Q1", revenue: { point: 2, low: 1, high: 3 } };
  const q2: Forecast = { quarter: "2194-Q2", units: { point: 2, low: 1, high: 3 }, note: "Sale." };
  const played = ["2194-Q1", "2194-Q2"] as const;

  it("are one per played quarter at most, in play order", () => {
    expect(validForecasts([], played)).toBe(true);
    expect(validForecasts([q1, q2], played)).toBe(true);
    expect(validForecasts([q2], played)).toBe(true);
    expect(validForecasts([q2, q1], played)).toBe(false);
    expect(validForecasts([q1, q1], played)).toBe(false);
    expect(validForecasts([q2], ["2194-Q1"])).toBe(false);
    expect(validForecasts([q1], [])).toBe(false);
  });

  it("hold only what a filed forecast can", () => {
    const bad: unknown[] = [
      { quarter: "2194-Q1" },
      { ...q1, revenue: { point: 2, low: 3, high: 4 } },
      { ...q1, revenue: { point: 2, low: 1, high: 3, extra: 1 } },
      { ...q1, units: { point: 1.5, low: 1, high: 3 } },
      { ...q1, note: "" },
      { ...q1, note: " padded " },
      { ...q1, note: "x".repeat(501) },
      { ...q1, values: 1 },
      { ...q1, quarter: "Q1" },
      null,
    ];
    for (const f of bad) expect(validForecasts([f], played), JSON.stringify(f)).toBe(false);
  });
});
