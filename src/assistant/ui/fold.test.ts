import { describe, expect, it } from "vitest";

import { canonicalQuery, foldLookups } from "./fold";

const query = { measure: "revenue", by: ["genre"], filter: { quarter: ["2193-Q4"] } };
const sameQueryOtherOrder = { filter: { quarter: ["2193-Q4"] }, by: ["genre"], measure: "revenue" };
const data = (q: unknown, id = "t") => ({ type: "data", id, pin: { kind: "table", query: q } });
const chart = (q: unknown, id = "c") => ({ type: "chart", id, chart: { kind: "bar", query: q } });
const other = { type: "comparison", id: "x" };

describe("one block for one lookup (David, 3 Nov 2026)", () => {
  it("matches a query however its keys came", () => {
    expect(canonicalQuery(query)).toBe(canonicalQuery(sameQueryOtherOrder));
  });

  it("puts a chart in place of an earlier table of the same query", () => {
    expect(foldLookups([data(query), other, chart(sameQueryOtherOrder)])).toEqual([
      chart(sameQueryOtherOrder),
      other,
    ]);
  });

  it("leaves out a table after a chart of the same query, and a repeat", () => {
    expect(foldLookups([chart(query), data(query), chart(query, "again")])).toEqual([chart(query)]);
  });

  it("keeps lookups of different queries, and anything it can't match, as they came", () => {
    const genre = data(query);
    const month = chart({ ...query, by: ["month"] });
    const unpinned = { type: "data", id: "u" };
    expect(foldLookups([genre, month, unpinned, other])).toEqual([genre, month, unpinned, other]);
  });
});
