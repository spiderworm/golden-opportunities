import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, discountChoice, filtersExcept, monthsInScope, parseState, setDiscount, setSeries, seriesChoice, toggleCell, toggleFilterValue, toSearchParams } from "./state";

describe("investigate state", () => {
  it("round-trips through the URL", () => {
    const state = { measure: "units", by: "genre", compare: true, filters: { genre: ["Fiction", "Memoir"], quarter: ["2193-Q4"] } } as const;
    const params = toSearchParams({ ...state, filters: { genre: [...state.filters.genre], quarter: [...state.filters.quarter] } });
    expect(params.toString()).toBe("measure=units&by=genre&compare=quarter&quarter=2193-Q4&genre=Fiction&genre=Memoir");
    expect(parseState(params)).toEqual(state);
  });

  it("falls back to defaults for anything it doesn't know", () => {
    expect(parseState(new URLSearchParams("measure=profit&by=colour&author=Someone"))).toEqual(DEFAULT_STATE);
    expect(toSearchParams(DEFAULT_STATE).toString()).toBe("");
  });

  it("only compares quarters when the grouping isn't time or titles", () => {
    expect(parseState(new URLSearchParams("by=month&compare=quarter")).compare).toBe(false);
    expect(parseState(new URLSearchParams("by=title&compare=quarter")).compare).toBe(false);
    expect(parseState(new URLSearchParams("by=weekday&compare=quarter")).compare).toBe(true);
    expect(parseState(new URLSearchParams("by=format&compare=quarter")).compare).toBe(true);
  });

  it("drops empty, overlong and duplicate filter values", () => {
    const params = new URLSearchParams([["genre", ""], ["genre", "x".repeat(201)], ["genre", "Fiction"], ["genre", "Fiction"]]);
    expect(parseState(params).filters).toEqual({ genre: ["Fiction"] });
  });

  it("toggles a drilldown value in and out", () => {
    const once = toggleFilterValue(DEFAULT_STATE, "genre", "Fiction");
    expect(once.filters).toEqual({ genre: ["Fiction"] });
    expect(toggleFilterValue(once, "genre", "Memoir").filters).toEqual({ genre: ["Fiction", "Memoir"] });
    expect(toggleFilterValue(once, "genre", "Fiction").filters).toEqual({});
  });

  it("selects a heatmap cell, and clears it when clicked again", () => {
    const cell = toggleCell(DEFAULT_STATE, "Monday", "2193-03");
    expect(cell.filters).toEqual({ weekday: ["Monday"], month: ["2193-03"] });
    expect(toggleCell(cell, "Monday", "2193-03").filters).toEqual({});
    expect(toggleCell(cell, "Friday", "2193-03").filters).toEqual({ weekday: ["Friday"], month: ["2193-03"] });
  });

  it("leaves out a view's own dimensions", () => {
    expect(filtersExcept({ genre: ["Fiction"], month: ["2193-03"] }, ["genre"])).toEqual({ month: ["2193-03"] });
  });

  it("keeps the discount filter to one choice", () => {
    const rate = setDiscount(DEFAULT_STATE, "15%");
    expect(rate.filters).toEqual({ discount_rate: ["15%"] });
    expect(discountChoice(rate.filters)).toBe("15%");
    const any = setDiscount(rate, "any");
    expect(any.filters).toEqual({ discounted: ["yes"] });
    expect(discountChoice(any.filters)).toBe("any");
    expect(setDiscount(any, "full").filters).toEqual({ discount_rate: ["0%"] });
    expect(discountChoice(setDiscount(any, "full").filters)).toBe("full");
    expect(setDiscount(any, "all").filters).toEqual({});
  });

  it("keeps one series choice: in a series, standalone, or one volume, never two at once", () => {
    const state = { ...DEFAULT_STATE, filters: { genre: ["Fiction"] } };
    expect(seriesChoice(state.filters)).toBe("all");
    const third = setSeries(state, { volume: "3" });
    expect(third.filters).toEqual({ genre: ["Fiction"], volume: ["3"] });
    expect(seriesChoice(third.filters)).toEqual({ volume: "3" });
    const standalone = setSeries(third, "no");
    expect(standalone.filters).toEqual({ genre: ["Fiction"], in_series: ["no"] });
    expect(seriesChoice(setSeries(standalone, "yes").filters)).toBe("yes");
    expect(setSeries(standalone, "all").filters).toEqual({ genre: ["Fiction"] });
    expect(seriesChoice({ in_series: ["yes"], volume: ["1"] })).toBe("all");
    expect(seriesChoice({ volume: ["1", "2"] })).toBe("all");
    const parsed = parseState(new URLSearchParams("by=volume&in_series=yes"));
    expect(parsed).toMatchObject({ by: "volume", filters: { in_series: ["yes"] } });
    expect(toSearchParams(parsed).toString()).toBe("by=volume&in_series=yes");
  });

  it("lists the months in the quarters in scope", () => {
    const visible = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"];
    expect(monthsInScope(visible)).toHaveLength(12);
    expect(parseState(new URLSearchParams("month=04&month=2194-02&month=13")).filters.month).toEqual(["2193-04", "2194-02", "13"]);
    expect(monthsInScope(["2193-Q1", "2194-Q1"])).toEqual(["2193-01", "2193-02", "2193-03", "2194-01", "2194-02", "2194-03"]);
    expect(monthsInScope(visible, ["2193-Q4", "2193-Q1"])).toEqual(["2193-01", "2193-02", "2193-03", "2193-10", "2193-11", "2193-12"]);
  });
});
