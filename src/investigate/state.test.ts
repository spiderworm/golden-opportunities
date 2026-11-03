import { describe, expect, it } from "vitest";
import { MEASURE_DIMENSIONS, MEASURES } from "~/query/types";
import {
  eventsBlock,
  GROUPINGS,
  heatWindow,
  lastYearBlock,
  lastYearUnshown,
  type ChartMeasure,
  type InvestigateState,
} from "./state";
import {
  awardChoice,
  canAddMeasure,
  canCompare,
  droveBlock,
  droveOn,
  runningBlock,
  shareBlock,
  droveQuarters,
  scatterProblem,
  measuresOf,
  DEFAULT_STATE,
  onlyShownChanged,
  removeFilter,
  shownFilters,
  withShown,
  discountChoice,
  filtersExcept,
  monthsInScope,
  parseState,
  setAward,
  setDiscount,
  setSeries,
  seriesChoice,
  toggleCell,
  toggleFilterValue,
  toSearchParams,
} from "./state";

describe("investigate state", () => {
  it("round-trips through the URL", () => {
    const state = {
      measure: "units",
      also: [],
      by: "genre",
      compare: true,
      scatter: false,
      lastYear: false,
      drove: false,
      split: false,
      share: null,
      events: true,
      filters: { genre: ["Fiction", "Memoir"], quarter: ["2193-Q4"] },
      heat: { measure: "units", rows: "weekday", cols: "month", period: "recent" },
    } as const;
    const params = toSearchParams({
      ...state,
      also: [],
      filters: { genre: [...state.filters.genre], quarter: [...state.filters.quarter] },
      heat: { ...state.heat },
    });
    expect(params.toString()).toBe(
      "measure=units&by=genre&compare=quarter&quarter=2193-Q4&genre=Fiction&genre=Memoir",
    );
    expect(parseState(params)).toEqual(state);
  });

  it("keeps % of total and the running share in the URL only where the chart could show them", () => {
    const read = (query: string) => parseState(new URLSearchParams(query));
    expect(read("by=genre&share=total").share).toBe("total");
    expect(read("by=title&share=running").share).toBe("running");
    expect(toSearchParams(read("by=title&share=running")).toString()).toBe(
      "by=title&share=running",
    );
    // Over time, the running share falls back to plain shares.
    expect(read("by=month&share=running").share).toBe("total");
    // An average, several measures, orders by a book's group, Compare quarters: none.
    expect(read("measure=avg_discount&by=genre&share=total").share).toBeNull();
    expect(read("measures=revenue,units&by=genre&share=total").share).toBeNull();
    expect(read("measure=orders&by=genre&share=total").share).toBeNull();
    expect(read("measure=orders&by=weekday&share=total").share).toBe("total");
    expect(read("by=genre&compare=quarter&share=total").share).toBeNull();
    expect(read("by=genre&share=everything").share).toBeNull();
  });

  it("says why shares can't be shown, in Plot's words", () => {
    const state = { ...DEFAULT_STATE, by: "genre" as const };
    const none = { lastYear: false, drove: false };
    expect(shareBlock(state, none)).toBeNull();
    expect(shareBlock({ ...state, also: ["units"] }, none)).toBe(
      "Show one measure to see its share",
    );
    expect(shareBlock({ ...state, measure: "avg_order_value" }, none)).toBe(
      "An average has no share of a total: show revenue, units sold or orders",
    );
    expect(shareBlock({ ...state, measure: "orders_per_day" }, none)).toBe(
      "An average has no share of a total: show revenue, units sold or orders",
    );
    expect(shareBlock({ ...state, measure: "orders" }, none)).toBe(
      "An order with books in several genres counts in each, so their shares would add to more than 100%",
    );
    expect(shareBlock({ ...state, measure: "orders", by: "month" }, none)).toBeNull();
    expect(shareBlock({ ...state, compare: true }, none)).toBe(
      "Turn off Compare quarters to see shares",
    );
    expect(shareBlock(state, { lastYear: true, drove: false })).toBe(
      "Turn off vs. same quarter last year to see shares",
    );
    expect(shareBlock(state, { lastYear: false, drove: true })).toBe(
      "Turn off What drove the change to see shares",
    );
    expect(runningBlock("genre")).toBeNull();
    expect(runningBlock("weekday")).toBe(
      "Break down by title, genre or another group for a running share",
    );
  });

  it("keeps vs. same quarter last year in the URL, and says why it can't apply", () => {
    const state = parseState(new URLSearchParams("by=genre&vs=last_year&quarter=2194-Q1"));
    expect(state.lastYear).toBe(true);
    expect(toSearchParams(state).toString()).toBe("by=genre&vs=last_year&quarter=2194-Q1");
    const quarters = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1"];
    expect(lastYearBlock(state, quarters)).toBeNull();
    expect(lastYearBlock({ ...state, by: "month" }, quarters)).toBeNull();
    const reasons = {
      "Ratings aren't recorded by quarter, so there's no last year to compare": [
        { ...state, measure: "avg_rating" as const, also: ["units" as const] },
        { ...state, measure: "ratings" as const },
      ],
      "Checkouts aren't recorded by year, so there's no last year to compare": [
        { ...state, measure: "checkouts" as const },
      ],
      "Show one measure to compare with last year": [{ ...state, also: ["units" as const] }],
      "Turn off Compare quarters to compare with last year": [{ ...state, compare: true }],
      "Break down by something other than quarter to compare with last year": [
        { ...state, by: "quarter" as const },
      ],
      "Filter to one quarter to compare it with last year": [
        { ...state, filters: {} },
        { ...state, filters: { quarter: ["2194-Q1", "2193-Q4"] } },
      ],
      "Q3 2196 isn't in the ledgers yet: filter to a quarter that's been played": [
        { ...state, filters: { quarter: ["2196-Q3"] } },
      ],
      "The ledgers start in 2193: there's no year before it to compare": [
        { ...state, filters: { quarter: ["2193-Q3"] } },
      ],
    };
    for (const [reason, states] of Object.entries(reasons))
      for (const s of states) expect(lastYearBlock(s, quarters)).toBe(reason);
    // A quarter whose year before isn't visible to the player.
    expect(lastYearBlock(state, ["2194-Q1"])).toBe(
      "Q1 2193 isn't in the ledgers, so there's nothing to compare",
    );
  });

  it("drops last year from the URL where the chart switches it off, but not for the quarter filter", () => {
    const at = (q: string) => parseState(new URLSearchParams(q)).lastYear;
    expect(at("by=genre&vs=last_year&measures=revenue,units")).toBe(false);
    expect(at("by=genre&vs=last_year&compare=quarter")).toBe(false);
    expect(at("by=quarter&vs=last_year")).toBe(false);
    expect(at("by=genre&vs=last_year")).toBe(true);
    const on = parseState(new URLSearchParams("by=genre&vs=last_year&quarter=2194-Q1"));
    expect(toSearchParams({ ...on, also: ["units"] }).has("vs")).toBe(false);
    expect(toSearchParams({ ...on, by: "quarter" }).has("vs")).toBe(false);
    expect(toSearchParams({ ...on, filters: {} }).get("vs")).toBe("last_year");
  });

  it("never refuses last year silently: every state either allows it or says why", () => {
    const quarters = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1", "2194-Q2"];
    const quarterFilters = [[], ["2194-Q1"], ["2194-Q1", "2194-Q2"], ["2193-Q2"], ["2197-Q1"]];
    let allowed = 0;
    let refused = 0;
    for (const measure of MEASURES)
      for (const also of [[], ["units"]] as ChartMeasure[][])
        for (const compare of [false, true])
          for (const by of GROUPINGS)
            for (const quarter of quarterFilters) {
              const filters = quarter.length ? { quarter } : {};
              const reason = lastYearBlock({ measure, also, compare, by, filters }, quarters);
              if (reason === null) {
                allowed++;
                // Allowed is exactly: dated, one measure, no Compare quarters, not by quarter, one played
                // quarter with a year before it.
                expect(MEASURE_DIMENSIONS[measure]).toContain("quarter");
                expect([also.length, compare, by, quarter]).toEqual([0, false, by, ["2194-Q1"]]);
                expect(by).not.toBe("quarter");
              } else {
                refused++;
                expect(reason.length).toBeGreaterThan(10);
              }
            }
    expect(allowed).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(allowed);
    expect(
      lastYearUnshown({ filters: { quarter: ["2194-Q1"] } }, { rows: [], lastYear: undefined }),
    ).toBe("Nothing in Q1 2194 matches these filters, so there's nothing to compare");
    expect(lastYearUnshown({ filters: { quarter: ["2194-Q1"] } }, { rows: [{}] })).toBe(
      "Can't compare this chart with last year",
    );
    expect(
      lastYearUnshown({ filters: { quarter: ["2194-Q1"] } }, { rows: [{}], lastYear: {} }),
    ).toBeNull();
  });

  it("marks events by default, keeps events=off in the URL, and says why off a time axis", () => {
    expect(parseState(new URLSearchParams("")).events).toBe(true);
    const off = parseState(new URLSearchParams("events=off"));
    expect(off.events).toBe(false);
    expect(toSearchParams(off).toString()).toBe("events=off");
    expect(eventsBlock({ by: "month" })).toBeNull();
    expect(eventsBlock({ by: "quarter" })).toBeNull();
    for (const by of ["genre", "weekday", "title"] as const)
      expect(eventsBlock({ by })).toBe("Break down by month or quarter to mark events");
  });

  it("falls back to defaults for anything it doesn't know", () => {
    expect(parseState(new URLSearchParams("measure=profit&by=colour&author=Someone"))).toEqual(
      DEFAULT_STATE,
    );
    expect(toSearchParams(DEFAULT_STATE).toString()).toBe("");
  });

  it("only compares quarters when the grouping isn't time or titles", () => {
    expect(parseState(new URLSearchParams("by=month&compare=quarter")).compare).toBe(false);
    expect(parseState(new URLSearchParams("by=title&compare=quarter")).compare).toBe(false);
    expect(parseState(new URLSearchParams("by=weekday&compare=quarter")).compare).toBe(true);
    expect(parseState(new URLSearchParams("by=format&compare=quarter")).compare).toBe(true);
  });

  it("drops empty, overlong and duplicate filter values", () => {
    const params = new URLSearchParams([
      ["genre", ""],
      ["genre", "x".repeat(201)],
      ["genre", "Fiction"],
      ["genre", "Fiction"],
    ]);
    expect(parseState(params).filters).toEqual({ genre: ["Fiction"] });
  });

  it("toggles a drilldown value in and out", () => {
    const once = toggleFilterValue(DEFAULT_STATE, "genre", "Fiction");
    expect(once.filters).toEqual({ genre: ["Fiction"] });
    expect(toggleFilterValue(once, "genre", "Memoir").filters).toEqual({
      genre: ["Fiction", "Memoir"],
    });
    expect(toggleFilterValue(once, "genre", "Fiction").filters).toEqual({});
  });

  it("selects a heatmap cell, and clears it when clicked again", () => {
    const cell = toggleCell(DEFAULT_STATE, "Monday", "2193-03");
    expect(cell.filters).toEqual({ weekday: ["Monday"], month: ["2193-03"] });
    expect(toggleCell(cell, "Monday", "2193-03").filters).toEqual({});
    expect(toggleCell(cell, "Friday", "2193-03").filters).toEqual({
      weekday: ["Friday"],
      month: ["2193-03"],
    });
  });

  it("leaves out a view's own dimensions", () => {
    expect(filtersExcept({ genre: ["Fiction"], month: ["2193-03"] }, ["genre"])).toEqual({
      month: ["2193-03"],
    });
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

  it("keeps one awards choice: winners, books without one, or one award, never two at once", () => {
    const state = { ...DEFAULT_STATE, filters: { genre: ["Fiction"] } };
    expect(awardChoice(state.filters)).toBe("all");
    const hugo = setAward(state, { award: "Hugo Award" });
    expect(hugo.filters).toEqual({ genre: ["Fiction"], award: ["Hugo Award"] });
    expect(awardChoice(hugo.filters)).toEqual({ award: "Hugo Award" });
    const winners = setAward(hugo, "yes");
    expect(winners.filters).toEqual({ genre: ["Fiction"], awarded: ["yes"] });
    expect(awardChoice(setAward(winners, "no").filters)).toBe("no");
    expect(setAward(winners, "all").filters).toEqual({ genre: ["Fiction"] });
    // A link holding both, or two awards, reads as no single choice.
    expect(awardChoice({ awarded: ["yes"], award: ["Hugo Award"] })).toBe("all");
    expect(awardChoice({ award: ["Hugo Award", "Nebula Award"] })).toBe("all");
    // Both travel in the URL, and award winners can be a breakdown.
    const parsed = parseState(new URLSearchParams("by=awarded&award=Hugo+Award"));
    expect(parsed).toMatchObject({ by: "awarded", filters: { award: ["Hugo Award"] } });
    expect(toSearchParams(parsed).toString()).toBe("by=awarded&award=Hugo+Award");
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

  it("keeps the bar's filters in the URL: the ones added, and any with values", () => {
    const params = new URLSearchParams("by=genre&show=awards&show=genre&genre=Fiction");
    expect(shownFilters(params, parseState(params).filters)).toEqual(["genre", "awards"]);
    // A drilldown or an old link sets a value without show: that filter is on the bar too.
    expect(shownFilters(new URLSearchParams("weekday=Monday"), { weekday: ["Monday"] })).toEqual([
      "weekday",
    ]);
    // Written in the bar's order, whatever order they were added in, and replacing what was there.
    expect(
      withShown(new URLSearchParams("by=genre&show=title"), ["awards", "quarter"]).toString(),
    ).toBe("by=genre&show=quarter&show=awards");
    // The question itself doesn't carry them, so the server's view (and its cache key) ignores them.
    expect(toSearchParams(parseState(params)).toString()).toBe("by=genre&genre=Fiction");
  });

  it("clears a filter's values when it comes off the bar, both parts of a two-part one", () => {
    const state = {
      ...DEFAULT_STATE,
      filters: { genre: ["Fiction"], awarded: ["yes"], award: ["Hugo Award"] },
    };
    expect(removeFilter(state, "awards").filters).toEqual({ genre: ["Fiction"] });
    expect(removeFilter(state, "genre").filters).toEqual({
      awarded: ["yes"],
      award: ["Hugo Award"],
    });
  });

  it("knows when only the bar changed, which changes no data", () => {
    const at = (search: string) => new URL(`http://localhost/investigate${search}`);
    expect(onlyShownChanged(at("?by=genre"), at("?by=genre&show=genre"))).toBe(true);
    expect(onlyShownChanged(at("?by=genre&show=genre"), at("?by=genre"))).toBe(true);
    expect(
      onlyShownChanged(at("?by=genre&show=genre"), at("?by=genre&show=genre&genre=Fiction")),
    ).toBe(false);
    expect(onlyShownChanged(at("?by=genre"), at("?by=genre"))).toBe(false);
  });

  it("keeps several measures in the URL, up to three on two units, and old single-measure links as they were", () => {
    const two = parseState(new URLSearchParams("measures=revenue,units&by=genre&compare=quarter"));
    expect(measuresOf(two)).toEqual(["revenue", "units"]);
    // Several measures can't also compare quarters.
    expect(two.compare).toBe(false);
    expect(toSearchParams(two).toString()).toBe("measures=revenue%2Cunits&by=genre");
    // A third unit, a fourth measure, a repeat or an unknown one is dropped, keeping what fits.
    expect(
      measuresOf(parseState(new URLSearchParams("measures=revenue,units,avg_discount"))),
    ).toEqual(["revenue", "units"]);
    expect(
      measuresOf(parseState(new URLSearchParams("measures=revenue,units,orders,avg_order_value"))),
    ).toEqual(["revenue", "units", "orders"]);
    expect(measuresOf(parseState(new URLSearchParams("measures=units,units,bogus")))).toEqual([
      "units",
    ]);
    // One measure is written as it always was, and old links still open.
    expect(
      toSearchParams({
        ...DEFAULT_STATE,
        measure: "units",
        heat: { ...DEFAULT_STATE.heat, measure: "units" },
      }).toString(),
    ).toBe("measure=units");
    expect(measuresOf(parseState(new URLSearchParams("measure=orders")))).toEqual(["orders"]);
    expect(measuresOf(parseState(new URLSearchParams("measures=")))).toEqual(["revenue"]);
  });

  it("breaks down and filters by price band, list price and edition, from a link", () => {
    const state = parseState(
      new URLSearchParams(
        "by=edition&compare=quarter&price_band=under%20%2410&list_price=%2412.99&edition=Rystwyth%20(Hardcover)",
      ),
    );
    expect(state.by).toBe("edition");
    // Editions are too many to split by quarter.
    expect(state.compare).toBe(false);
    expect(state.filters).toEqual({
      price_band: ["under $10"],
      list_price: ["$12.99"],
      edition: ["Rystwyth (Hardcover)"],
    });
    expect(shownFilters(new URLSearchParams(), state.filters)).toEqual(["price", "edition"]);
    expect(parseState(new URLSearchParams("by=price_band&compare=quarter")).compare).toBe(true);
  });

  it("keeps the heatmap's measure and axes in the URL; without them, weekday by month in the chart's measure", () => {
    // Every link before: the heatmap follows the chart's measure.
    expect(parseState(new URLSearchParams("measure=orders")).heat).toEqual({
      measure: "orders",
      rows: "weekday",
      cols: "month",
      period: "recent",
    });
    const chosen = parseState(
      new URLSearchParams("measure=orders&heat=units&heat_rows=genre&heat_cols=quarter"),
    );
    expect(chosen.heat).toEqual({
      measure: "units",
      rows: "genre",
      cols: "quarter",
      period: "recent",
    });
    expect(toSearchParams(chosen).toString()).toBe(
      "measure=orders&heat=units&heat_rows=genre&heat_cols=quarter",
    );
    // Never the same dimension twice, nor one a grid can't hold: back to the defaults.
    expect(parseState(new URLSearchParams("heat_rows=month&heat_cols=month")).heat).toMatchObject({
      rows: "weekday",
      cols: "month",
    });
    expect(parseState(new URLSearchParams("heat_rows=title")).heat.rows).toBe("weekday");
    expect(parseState(new URLSearchParams("heat=profit")).heat.measure).toBe("revenue");
  });

  it("keeps a long ledger's heatmap to its last eight quarters unless every quarter is chosen or the screen filters by quarter", () => {
    const ten = [
      "2193-Q1",
      "2193-Q2",
      "2193-Q3",
      "2193-Q4",
      "2194-Q1",
      "2194-Q2",
      "2194-Q3",
      "2194-Q4",
      "2195-Q1",
      "2195-Q2",
    ];
    expect(heatWindow(DEFAULT_STATE, ten)).toEqual(ten.slice(2));
    expect(heatWindow(DEFAULT_STATE, ten.slice(0, 8))).toBeNull();
    const all = parseState(new URLSearchParams("heat_period=all"));
    expect(all.heat.period).toBe("all");
    expect(toSearchParams(all).toString()).toBe("heat_period=all");
    expect(heatWindow(all, ten)).toBeNull();
    expect(heatWindow({ ...DEFAULT_STATE, filters: { quarter: ["2194-Q1"] } }, ten)).toBeNull();
    // A month older than the window would leave nothing: off the heatmap's axes, a month filter decides too (Plot,
    // #270). Weekday by genre, as Audit pinned it.
    const byGenre = { ...DEFAULT_STATE, heat: { ...DEFAULT_STATE.heat, cols: "genre" as const } };
    expect(heatWindow({ ...byGenre, filters: { month: ["2193-02"] } }, ten)).toBeNull();
    // A clicked cell filters the heatmap's own axes, which its query ignores: the window stays (Frank, #270).
    const clicked = toggleCell(DEFAULT_STATE, "Monday", "2195-02");
    expect(clicked.filters).toEqual({ weekday: ["Monday"], month: ["2195-02"] });
    expect(heatWindow(clicked, ten)).toEqual(ten.slice(2));
    const byQuarter = {
      ...DEFAULT_STATE,
      heat: { ...DEFAULT_STATE.heat, cols: "quarter" as const },
    };
    expect(heatWindow(toggleCell(byQuarter, "Monday", "2195-Q1"), ten)).toEqual(ten.slice(2));
    // A month filter while months aren't an axis still decides the span.
    expect(heatWindow({ ...byQuarter, filters: { month: ["2193-02"] } }, ten)).toBeNull();
  });

  it("filters to a heatmap cell's row and column values, and clears them on a second click", () => {
    const state = {
      ...DEFAULT_STATE,
      heat: {
        measure: "revenue" as const,
        rows: "genre" as const,
        cols: "price_band" as const,
        period: "recent" as const,
      },
    };
    const cell = toggleCell(state, "Fiction", "under $10");
    expect(cell.filters).toEqual({ genre: ["Fiction"], price_band: ["under $10"] });
    expect(toggleCell(cell, "Fiction", "under $10").filters).toEqual({});
  });

  it("plots two measures against each other across a dimension that isn't time, from a link", () => {
    const at = (query: string) => parseState(new URLSearchParams(query));
    const scatter = at("measures=revenue,units&by=genre&chart=scatter");
    expect(scatter).toMatchObject({
      measure: "revenue",
      also: ["units"],
      by: "genre",
      scatter: true,
    });
    expect(toSearchParams(scatter).toString()).toBe(
      "measures=revenue%2Cunits&by=genre&chart=scatter",
    );
    // One measure, three, or a breakdown over time: no scatter plot, and the link drops it.
    expect(at("measure=revenue&by=genre&chart=scatter").scatter).toBe(false);
    expect(at("measures=revenue,units,orders&by=genre&chart=scatter").scatter).toBe(false);
    expect(at("measures=revenue,units&by=month&chart=scatter").scatter).toBe(false);
    expect(toSearchParams({ ...scatter, by: "quarter" }).has("chart")).toBe(false);
    expect(scatterProblem("genre", ["units"])).toBeNull();
    expect(scatterProblem("genre", [])).toBe("Choose a second measure for a scatter plot");
    expect(scatterProblem("genre", ["units", "orders"])).toBe("A scatter plot shows two measures");
    for (const by of ["month", "quarter", "weekday"] as const)
      expect(scatterProblem(by, ["units"])).toBe(
        "Break down by title, genre or another group for a scatter plot",
      );
  });

  it("says why a measure can't join: three at most, two units at most", () => {
    expect(canAddMeasure(["revenue"], "units")).toBe("ok");
    // An average never shares a total's axis, even in dollars.
    expect(canAddMeasure(["revenue", "units"], "avg_order_value")).toBe("third unit");
    expect(canAddMeasure(["revenue"], "avg_order_value")).toBe("ok");
    expect(canAddMeasure(["units", "orders"], "avg_order_value")).toBe("ok");
    expect(canAddMeasure(["revenue", "units"], "avg_discount")).toBe("third unit");
    expect(canAddMeasure(["revenue", "units", "orders"], "avg_order_value")).toBe("full");
    expect(canCompare("genre", ["units"])).toBe(false);
    expect(canCompare("genre", [])).toBe(true);
  });

  it("lists the months in the quarters in scope", () => {
    const visible = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"];
    expect(monthsInScope(visible)).toHaveLength(12);
    expect(
      parseState(new URLSearchParams("month=04&month=2194-02&month=13")).filters.month,
    ).toEqual(["2193-04", "2194-02", "13"]);
    expect(monthsInScope(["2193-Q1", "2194-Q1"])).toEqual([
      "2193-01",
      "2193-02",
      "2193-03",
      "2194-01",
      "2194-02",
      "2194-03",
    ]);
    expect(monthsInScope(visible, ["2193-Q4", "2193-Q1"])).toEqual([
      "2193-01",
      "2193-02",
      "2193-03",
      "2193-10",
      "2193-11",
      "2193-12",
    ]);
  });
});

describe("what drove the change: when it can, and why not (Plot, #328)", () => {
  const quarters = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1"];
  const base: InvestigateState = {
    ...DEFAULT_STATE,
    by: "genre",
    drove: true,
    filters: { quarter: ["2194-Q1"] },
  };

  it("compares the quarter shown with the one before, or with last year's when that's on", () => {
    expect(droveQuarters(base, quarters)).toEqual({ then: "2193-Q4", now: "2194-Q1" });
    expect(droveQuarters({ ...base, lastYear: true }, quarters)).toEqual({
      then: "2193-Q1",
      now: "2194-Q1",
    });
    expect(droveBlock(base, quarters)).toBeNull();
  });

  it("says why it can't, in Plot's words", () => {
    const why = (patch: Partial<InvestigateState>) => droveBlock({ ...base, ...patch }, quarters);
    expect(why({ also: ["units"] })).toBe("Show one measure to see what drove its change");
    expect(why({ measure: "units" })).toBe("Show revenue to see what drove its change");
    expect(why({ by: "month" })).toBe(
      "Break down by genre, title or edition to see what drove the change",
    );
    expect(why({ compare: true })).toBe("Turn off Compare quarters to see what drove the change");
    expect(why({ scatter: true })).toBe("Turn off Scatter plot to see what drove the change");
    expect(why({ filters: {} })).toBe("Filter to one quarter to see what drove its change");
    expect(why({ filters: { quarter: ["2196-Q3"] } })).toBe(
      "Q3 2196 isn't in the ledgers yet: filter to a quarter that's been played",
    );
    expect(why({ filters: { quarter: ["2193-Q1"] } })).toBe(
      "Q1 2193 is the first quarter in the ledgers: there's nothing before it to compare",
    );
  });

  it("is on only when allowed, so a link without one quarter doesn't block the other toggles (Chart, #335)", () => {
    expect(droveOn(base, quarters)).toBe(true);
    const noQuarter = parseState(new URLSearchParams("by=genre&drove=1"));
    // Kept in the URL for when a quarter is picked, but not on, so nothing says to turn it off.
    expect(noQuarter.drove).toBe(true);
    expect(droveOn(noQuarter, quarters)).toBe(false);
  });

  it("keeps drove=1 and split=1 in the URL only where the chart could break its change down", () => {
    const params = toSearchParams({ ...base, split: true });
    expect(params.get("drove")).toBe("1");
    expect(params.get("split")).toBe("1");
    expect(parseState(params)).toMatchObject({ drove: true, split: true });
    expect(toSearchParams({ ...base, measure: "units" }).get("drove")).toBeNull();
    expect(parseState(new URLSearchParams("by=month&drove=1&split=1"))).toMatchObject({
      drove: false,
      split: false,
    });
  });
});
