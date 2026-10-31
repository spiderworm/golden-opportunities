import { describe, expect, it } from "vitest";
import type { Query } from "~/query/types";
import { addPin, MAX_PINS, parsePins, parsePinSpec, pinKey, type Pin, type PinSpec } from "./spec";

const spec = { title: "Revenue by quarter", kind: "bar", query: { measure: "revenue", by: ["quarter"] } } as const;
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("pin specs", () => {
  it("accepts Dewey's chart shape", () => {
    expect(parsePinSpec(copy(spec))).toEqual(spec);
    expect(parsePinSpec({ ...copy(spec), query: { measure: "units", by: [], filter: { discount_rate: ["15%"] }, limit: 20 } })).not.toBeNull();
  });

  it("rejects anything outside the contract", () => {
    expect(parsePinSpec({ ...copy(spec), kind: "pie" })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), title: "" })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), extra: 1 })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), query: { measure: "profit", by: [] } })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), query: { measure: "units", by: ["genre", "genre"] } })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), query: { measure: "units", by: ["genre", "format", "month"] } })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), query: { measure: "units", by: [], filter: { colour: ["red"] } } })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), query: { measure: "units", by: [], view: { periods: [] } } })).toBeNull();
  });

  it("reads stored pins, dropping malformed ones", () => {
    const stored = [{ ...copy(spec), id: "a", pinnedBy: "dewey" }, { ...copy(spec), id: "b", pinnedBy: "someone" }, "junk"];
    expect(parsePins(JSON.stringify(stored)).map((p) => p.id)).toEqual(["a"]);
    expect(parsePins("not json")).toEqual([]);
    expect(parsePins(null)).toEqual([]);
  });

  it("treats the same kind and query as the same chart, whatever the filter order", () => {
    const a = { measure: "units", by: [], filter: { genre: ["Memoir", "Fiction"], format: ["Hardcover"] } } as const;
    const b = { measure: "units", by: [], filter: { format: ["Hardcover"], genre: ["Fiction", "Memoir"] } } as const;
    const pin = (kind: "bar" | "table", query: Query): PinSpec => ({ title: "Units", kind, query });
    expect(pinKey(pin("bar", copy(a)))).toBe(pinKey({ ...pin("bar", copy(b)), title: "Another title" }));
    expect(pinKey(pin("bar", copy(a)))).not.toBe(pinKey(pin("table", copy(a))));
  });

  it("keeps the newest first, moves a repeat to the front, and caps the board", () => {
    let pins: Pin[] = [];
    pins = addPin(pins, copy(spec), "player", "1");
    pins = addPin(pins, { ...copy(spec), query: { measure: "units", by: ["month"] } }, "dewey", "2");
    pins = addPin(pins, { ...copy(spec), title: "Same chart, new title" }, "dewey", "3");
    expect(pins.map((p) => p.id)).toEqual(["3", "2"]);
    for (let i = 0; i < MAX_PINS + 2; i++) pins = addPin(pins, { ...copy(spec), query: { measure: "units", by: [], limit: i + 1 } }, "player", `x${i}`);
    expect(pins).toHaveLength(MAX_PINS);
    expect(pins[0]!.id).toBe(`x${MAX_PINS + 1}`);
  });

  const comparison = { title: "Revenue compared across quarter", kind: "comparison", comparison: { measure: "revenue", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: ["genre"] } } as const;

  it("accepts Dewey's comparison shape, checked as Dewey checks it", () => {
    expect(parsePinSpec(copy(comparison))).toEqual(comparison);
    const filtered = { ...copy(comparison), comparison: { ...copy(comparison.comparison), by: [], filter: { format: ["Hardcover"] } } };
    expect(parsePinSpec(filtered)).toEqual(filtered);
    const bad = (change: object) => parsePinSpec({ ...copy(comparison), comparison: { ...copy(comparison.comparison), ...change } });
    expect(bad({ to: "2193-Q3" })).toBeNull();
    expect(bad({ from: "" })).toBeNull();
    expect(bad({ from: "x".repeat(500) })).toBeNull();
    expect(bad({ by: ["genre", "format"] })).toBeNull();
    expect(bad({ by: ["quarter"] })).toBeNull();
    expect(bad({ across: "colour" })).toBeNull();
    expect(bad({ measure: "profit" })).toBeNull();
    expect(bad({ filter: { quarter: ["2193-Q1"] } })).toBeNull();
    expect(bad({ filter: { colour: ["red"] } })).toBeNull();
    expect(bad({ rows: [] })).toBeNull();
  });

  it("never reads one kind as the other", () => {
    // Each variant has its own keys: a comparison carrying a query, or a chart carrying a comparison, is dropped.
    expect(parsePinSpec({ ...copy(comparison), query: copy(spec.query) })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), comparison: copy(comparison.comparison) })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), kind: "comparison" })).toBeNull();
    expect(parsePinSpec({ title: spec.title, kind: "table", comparison: copy(comparison.comparison) })).toBeNull();
  });

  it("still reads pins stored before comparisons, unchanged", () => {
    const v1 = [
      { ...copy(spec), id: "a", pinnedBy: "player" },
      { title: "Units by month", kind: "table", query: { measure: "units", by: ["month"], filter: { genre: ["Memoir"] }, limit: 12 }, id: "b", pinnedBy: "dewey" },
    ];
    expect(parsePins(JSON.stringify(v1))).toEqual(v1);
    const mixed = [...v1, { ...copy(comparison), id: "c", pinnedBy: "player" }];
    expect(parsePins(JSON.stringify(mixed))).toEqual(mixed);
  });

  it("keys a comparison on what it compares, whatever its title or filter order", () => {
    const filtered = (filter: object, title: string = comparison.title): PinSpec => ({ ...copy(comparison), title, comparison: { ...copy(comparison.comparison), filter } }) as PinSpec;
    expect(pinKey(filtered({ genre: ["Memoir", "Fiction"], format: ["Hardcover"] }))).toBe(pinKey(filtered({ format: ["Hardcover"], genre: ["Fiction", "Memoir"] }, "Q3 vs Q4 revenue")));
    expect(pinKey(copy(comparison) as PinSpec)).not.toBe(pinKey({ ...copy(comparison), comparison: { ...copy(comparison.comparison), from: "2193-Q2" } } as PinSpec));
    let pins: Pin[] = addPin([], copy(comparison) as PinSpec, "dewey", "1");
    pins = addPin(pins, { ...copy(comparison), title: "Another title" } as PinSpec, "player", "2");
    expect(pins.map((p) => p.id)).toEqual(["2"]);
  });
});

describe("pins saved before months had a year", () => {
  it("read their month filters and month comparisons as 2193's, so they keep matching", () => {
    expect(parsePinSpec({ title: "March", kind: "bar", query: { measure: "units", by: ["genre"], filter: { month: ["03", "2194-01"] } } })).toMatchObject({ query: { filter: { month: ["2193-03", "2194-01"] } } });
    expect(parsePinSpec({ title: "Jan to Feb", kind: "comparison", comparison: { measure: "revenue", across: "month", from: "01", to: "02", by: [] } })).toMatchObject({ comparison: { from: "2193-01", to: "2193-02" } });
    expect(parsePinSpec({ title: "Q3", kind: "comparison", comparison: { measure: "revenue", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: [] } })).toMatchObject({ comparison: { from: "2193-Q3" } });
    expect(parsePins(JSON.stringify([{ id: "p", pinnedBy: "player", title: "Old", kind: "bar", query: { measure: "units", by: ["weekday"], filter: { month: ["12"] } } }]))[0]).toMatchObject({ query: { filter: { month: ["2193-12"] } } });
  });
});
