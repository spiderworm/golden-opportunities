import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, filtersExcept, parseState, toggleCell, toggleFilterValue, toSearchParams } from "./state";

describe("investigate state", () => {
  it("round-trips through the URL", () => {
    const state = { measure: "units", by: "genre", compare: true, filters: { genre: ["Fiction", "Memoir"], quarter: ["2193-Q4"] } } as const;
    const params = toSearchParams({ ...state, filters: { genre: [...state.filters.genre], quarter: [...state.filters.quarter] } });
    expect(params.toString()).toBe("measure=units&by=genre&compare=quarter&quarter=2193-Q4&genre=Fiction&genre=Memoir");
    expect(parseState(params)).toEqual(state);
  });

  it("falls back to defaults for anything it doesn't know", () => {
    expect(parseState(new URLSearchParams("measure=profit&by=colour&title=Dune"))).toEqual(DEFAULT_STATE);
    expect(toSearchParams(DEFAULT_STATE).toString()).toBe("");
  });

  it("only compares quarters when the grouping isn't time", () => {
    expect(parseState(new URLSearchParams("by=month&compare=quarter")).compare).toBe(false);
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
    const cell = toggleCell(DEFAULT_STATE, "Monday", "03");
    expect(cell.filters).toEqual({ weekday: ["Monday"], month: ["03"] });
    expect(toggleCell(cell, "Monday", "03").filters).toEqual({});
    expect(toggleCell(cell, "Friday", "03").filters).toEqual({ weekday: ["Friday"], month: ["03"] });
  });

  it("leaves out a view's own dimensions", () => {
    expect(filtersExcept({ genre: ["Fiction"], month: ["03"] }, ["genre"])).toEqual({ month: ["03"] });
  });
});
