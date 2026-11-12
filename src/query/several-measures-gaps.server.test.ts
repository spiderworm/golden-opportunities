import { describe, expect, it, vi } from "vitest";

// 2193's ratings and checkouts cover the same titles, so a group only one of them has needs a book taken out of one:
// one title's checkouts, and another's ratings.
const [MISSING, UNRATED] = await vi.hoisted(async () => {
  const { loadBookshop } = await import("../bookshop/loader.server");
  const titles = [...new Set(loadBookshop().joinedCheckouts.map((c) => c.book?.title))];
  return titles.filter((t): t is string => !!t).slice(0, 2);
});
vi.mock("../bookshop/loader.server", async (original) => {
  const real = await original<typeof import("../bookshop/loader.server")>();
  let data: ReturnType<typeof real.loadBookshop> | undefined;
  return {
    ...real,
    // The same object each time, as the real loader gives, so the engine's per-dataset rollups hold.
    loadBookshop: () =>
      (data ??= {
        ...real.loadBookshop(),
        joinedCheckouts: real
          .loadBookshop()
          .joinedCheckouts.filter((c) => c.book?.title !== MISSING),
        joinedRatings: real.loadBookshop().joinedRatings.filter((r) => r.book?.title !== UNRATED),
      }),
  };
});
import { runQuery } from "./run-query.server";
import { BASELINE_VIEW } from "./view.server";

describe("ratings and checkouts lined up, where one lacks a group", () => {
  it("shows the group, a zero for the count and null for an average, with evidence to match", () => {
    const got = runQuery(
      { measure: "avg_rating", also: ["checkouts"], by: ["title"] },
      BASELINE_VIEW,
      () => {},
    );
    const i = got.rows.findIndex((row) => row.title === MISSING);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(got.rows[i]!.checkouts).toBe(0);
    expect(typeof got.rows[i]!.avg_rating).toBe("number");
    expect(got.measures!.checkouts!.evidence.rows[i]).toEqual({ n: 0, se: 0 });
    // And the other way round: an average over nothing is null, its spread unknown.
    const j = got.rows.findIndex((row) => row.title === UNRATED);
    expect(got.rows[j]).toEqual({
      title: UNRATED,
      avg_rating: null,
      checkouts: expect.any(Number),
    });
    expect(got.rows[j]!.checkouts).toBeGreaterThan(0);
    expect(got.measures!.avg_rating!.evidence.rows[j]).toEqual({ n: 0, se: null });
    // A filter on just those two: each group still shows.
    const both = runQuery(
      {
        measure: "checkouts",
        also: ["avg_rating"],
        by: ["title"],
        filter: { title: [MISSING, UNRATED] },
      },
      BASELINE_VIEW,
      () => {},
    );
    expect(both.rows.map((r) => [r.title, r.checkouts === 0, r.avg_rating === null])).toEqual(
      [
        [MISSING, true, false],
        [UNRATED, false, true],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  });
});
