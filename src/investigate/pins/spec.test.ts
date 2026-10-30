import { describe, expect, it } from "vitest";
import { addPin, MAX_PINS, parsePins, parsePinSpec, pinKey, type Pin } from "./spec";

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
    expect(pinKey("bar", copy(a))).toBe(pinKey("bar", copy(b)));
    expect(pinKey("bar", copy(a))).not.toBe(pinKey("table", copy(a)));
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
});
