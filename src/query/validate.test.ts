import { describe, expect, it } from "vitest";
import { validateQuery } from "./validate";
import { DIMENSIONS, MEASURE_DIMENSIONS, MEASURES, QUERY_LIMITS } from "./types";

describe("fixed query grammar", () => {
  it("accepts each measure and exact filter/sort shape without mutating input", () => {
    for (const measure of MEASURES)
      expect(validateQuery({ measure, by: [] }).measure).toBe(measure);
    const input = {
      measure: "revenue",
      by: ["quarter"],
      filter: { genre: ["Mystery", "Mystery"] },
      sort: { column: "revenue", direction: "desc" },
      limit: 2,
    };
    expect(validateQuery(input)).toMatchObject({ filter: { genre: ["Mystery"] } });
    expect(input.filter.genre).toHaveLength(2);
    for (const dimension of DIMENSIONS.filter((d) => d !== "award")) {
      const measure = MEASURES.find((m) => MEASURE_DIMENSIONS[m].includes(dimension))!;
      expect(validateQuery({ measure, by: [dimension] }).by).toEqual([dimension]);
    }
    // Stars belong to the ratings count only: not sales, and not the average rating.
    expect(() => validateQuery({ measure: "revenue", by: ["stars"] })).toThrow(
      /does not support stars/,
    );
    expect(() => validateQuery({ measure: "avg_rating", by: ["stars"] })).toThrow(
      /does not support stars/,
    );
    // Award filters but never groups: a book with two awards would count twice.
    expect(
      validateQuery({ measure: "units", by: ["awarded"], filter: { award: ["Hugo Award"] } })
        .filter,
    ).toEqual({ award: ["Hugo Award"] });
    expect(() => validateQuery({ measure: "units", by: ["award"] })).toThrow(
      /award can filter but not group/,
    );
    expect(() =>
      validateQuery({ measure: "units", by: [], sort: { column: "award", direction: "asc" } }),
    ).toThrow(/Sort column/);
  });
  it.each([
    null,
    [],
    "SELECT * FROM sales",
    {},
    { measure: "sql", by: [] },
    { measure: "revenue" },
    { measure: "revenue", by: ["quarter", "month", "title"] },
    { measure: "revenue", by: ["quarter", "quarter"] },
    { measure: "revenue", by: ["constructor"] },
    { measure: "revenue", by: [], view: { periods: ["9999-Q1"] } },
    { measure: "revenue", by: [], filter: [] },
    { measure: "revenue", by: [], filter: { title: [] } },
    { measure: "revenue", by: [], filter: { title: [null] } },
    { measure: "revenue", by: [], filter: { title: ["a".repeat(201)] } },
    { measure: "revenue", by: [], filter: { title: Array(51).fill("x") } },
    { measure: "revenue", by: [], filter: { unknown: ["x"] } },
    { measure: "revenue", by: [], sort: { column: "quarter", direction: "asc" } },
    { measure: "revenue", by: [], sort: { column: "revenue", direction: "random" } },
    {
      measure: "revenue",
      by: [],
      sort: { column: "revenue", direction: "asc", expression: "eval()" },
    },
    { measure: "revenue", by: [], limit: 0 },
    { measure: "revenue", by: [], limit: QUERY_LIMITS.rows + 1 },
    { measure: "revenue", by: [], limit: 1.5 },
    { measure: "revenue", by: [], limit: "2" },
    { measure: "revenue", by: [], limit: Infinity },
    JSON.parse('{"measure":"revenue","by":[],"__proto__":{"admin":true}}'),
    JSON.parse('{"measure":"revenue","by":[],"filter":{"__proto__":["x"]}}'),
  ])("rejects invalid/extra/free-form input %#", (input) => {
    expect(() => validateQuery(input)).toThrow(expect.objectContaining({ code: "INVALID_QUERY" }));
  });
  it.each([
    { measure: "avg_rating", by: ["quarter"] },
    { measure: "avg_rating", by: [], filter: { format: ["Hardcover"] } },
    { measure: "checkouts", by: ["publisher"] },
    { measure: "checkouts", by: [], filter: { discounted: ["yes"] } },
    { measure: "checkouts", by: ["discount_rate"] },
  ])("rejects fanout and invented-calendar combinations %#", (input) => {
    expect(() => validateQuery(input)).toThrow(
      expect.objectContaining({ code: "INCOMPATIBLE_DIMENSION" }),
    );
  });
});

describe("several measures in one lookup", () => {
  const code = (c: string) => expect.objectContaining({ code: c });

  it("takes up to three more of the same family, in order, sorted by any of them", () => {
    expect(
      validateQuery({
        measure: "revenue",
        also: ["units", "orders", "avg_order_value"],
        by: ["quarter"],
        sort: { column: "units", direction: "desc" },
      }),
    ).toEqual({
      measure: "revenue",
      also: ["units", "orders", "avg_order_value"],
      by: ["quarter"],
      sort: { column: "units", direction: "desc" },
    });
    expect(
      validateQuery({ measure: "avg_rating", also: ["checkouts"], by: ["genre"] }).also,
    ).toEqual(["checkouts"]);
    // One measure stays as it was: no `also`.
    expect(validateQuery({ measure: "revenue", by: [] })).not.toHaveProperty("also");
  });

  it.each([
    { measure: "revenue", also: [], by: [] },
    { measure: "revenue", also: ["units", "orders", "avg_discount", "orders_per_day"], by: [] },
    { measure: "revenue", also: ["revenue"], by: [] },
    { measure: "revenue", also: ["units", "units"], by: [] },
    { measure: "revenue", also: ["profit"], by: [] },
    { measure: "revenue", also: "units", by: [] },
    // Sorted by a measure it didn't ask for.
    {
      measure: "revenue",
      also: ["units"],
      by: ["genre"],
      sort: { column: "orders", direction: "asc" },
    },
    // Last year is one measure at a time for now.
    { measure: "revenue", also: ["units"], by: ["quarter"], vs: "last_year" },
  ])("refuses a malformed list %#", (input) => {
    expect(() => validateQuery(input)).toThrow(code("INVALID_QUERY"));
  });

  it("refuses sales with ratings or checkouts, naming which is which", () => {
    expect(() => validateQuery({ measure: "revenue", also: ["avg_rating"], by: [] })).toThrow(
      "revenue and avg_rating can't share a query: revenue comes from sales, and avg_rating from book records (ratings and checkouts). Query them separately.",
    );
    expect(() => validateQuery({ measure: "checkouts", also: ["units"], by: [] })).toThrow(
      "units and checkouts can't share a query",
    );
    expect(() => validateQuery({ measure: "checkouts", also: ["units"], by: [] })).toThrow(
      code("INCOMPATIBLE_MEASURES"),
    );
  });

  it("allows only the dimensions every measure has", () => {
    // Checkouts have months; ratings don't.
    expect(() =>
      validateQuery({ measure: "checkouts", also: ["avg_rating"], by: ["month"] }),
    ).toThrow(/avg_rating does not support month/);
    expect(() =>
      validateQuery({ measure: "ratings", also: ["avg_rating"], by: [], filter: { stars: ["5"] } }),
    ).toThrow(code("INCOMPATIBLE_DIMENSION"));
    expect(validateQuery({ measure: "checkouts", by: ["month"] }).by).toEqual(["month"]);
  });
});

describe("Dewey's gate over several measures", () => {
  it("names the first Investigate-only measure anywhere in the list", async () => {
    const { investigateOnly } = await import("./types");
    expect(
      investigateOnly(validateQuery({ measure: "avg_rating", also: ["checkouts"], by: [] })),
    ).toBeNull();
    expect(
      investigateOnly(validateQuery({ measure: "avg_rating", also: ["ratings"], by: ["genre"] })),
    ).toBe("ratings");
    // Sorting by an asked measure isn't a dimension Dewey lacks.
    expect(
      investigateOnly(
        validateQuery({
          measure: "revenue",
          also: ["units"],
          by: ["genre"],
          sort: { column: "units", direction: "desc" },
        }),
      ),
    ).toBeNull();
  });
});
