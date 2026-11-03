import { describe, expect, it } from "vitest";
import type { QueryResult } from "~/query/types";
import { categoryModel } from "./category-chart";
import {
  barLine,
  cutNote,
  formatShare,
  headline,
  shareModel,
  shareOption,
  shareTitle,
  topLine,
} from "./share-chart";

function result(
  rows: { genre?: string; title?: string; revenue: number }[],
  by: "genre" | "title",
  total: number | null,
): QueryResult {
  return {
    columns: [
      { key: by, label: by, type: "string", nullable: true },
      { key: "revenue", label: "Revenue", type: "number", nullable: false },
    ],
    rows,
    total,
    source: "test",
  };
}

const genres = result(
  [
    { genre: "Fantasy", revenue: 200 },
    { genre: "Fiction", revenue: 500 },
    { genre: "Memoir", revenue: 100 },
  ],
  "genre",
  1000,
);

describe("shares of the total (req_fa2e6a0dbbec)", () => {
  it("divides by the query's own total, not the sum of the bars", () => {
    // The bars add to 800 of 1,000: some sales are in groups not drawn (or past the row limit).
    const m = shareModel(categoryModel(genres, "genre"), genres.total)!;
    expect(m.shares).toEqual([0.2, 0.5, 0.1]);
    expect(m.running).toBeNull();
    expect(formatShare(m.shares[1]!)).toBe("50.0%");
  });

  it("has nothing to share out without a total", () => {
    const model = categoryModel(genres, "genre");
    expect(shareModel(model, null)).toBeNull();
    expect(shareModel(model, 0)).toBeNull();
  });

  it("puts the running share largest first, climbing toward 100%", () => {
    const m = shareModel(categoryModel(genres, "genre"), genres.total, { running: true })!;
    expect(m.categories).toEqual(["Fiction", "Fantasy", "Memoir"]);
    expect(m.running!.map((r) => Math.round(r * 1000) / 1000)).toEqual([0.5, 0.7, 0.8]);
  });

  it("words the top N, the bars and the title in Plot's copy", () => {
    const m = shareModel(categoryModel(genres, "genre"), genres.total, { running: true })!;
    expect(topLine(m, 1)).toBe("Top genre: 50.0% of revenue");
    expect(topLine(m, 2)).toBe("Top 2 genres: 70.0% of revenue");
    // Three groups: the headline is all of them, short of the top 5.
    expect(headline(m)).toBe("Top 3 genres: 80.0% of revenue");
    expect(barLine(m, 0)).toBe("Fiction: $500, 50.0% of revenue");
    expect(shareTitle("Revenue by genre", true)).toBe(
      "Revenue by genre, largest first, with the running share",
    );
    expect(shareTitle("Revenue by genre", false)).toBe("Revenue by genre, as shares");
    // Plain shares have no headline.
    expect(headline(shareModel(categoryModel(genres, "genre"), genres.total)!)).toBeNull();
  });

  it("says when not every group is drawn", () => {
    const titles = result(
      Array.from({ length: 20 }, (_, i) => ({ title: `Book ${i}`, revenue: 20 - i })),
      "title",
      400,
    );
    const top = shareModel(categoryModel(titles, "title", null, [], { top: 15 }), titles.total)!;
    expect(cutNote(top)).toBe("Shares are of all titles, not only those shown.");
    const all = shareModel(categoryModel(titles, "title"), titles.total)!;
    expect(cutNote(all)).toBeNull();
    expect(
      cutNote(shareModel(categoryModel(genres, "genre"), 1000, { truncated: true })!),
    ).not.toBeNull();
  });

  it("draws the running share on its own 0 to 100% axis", () => {
    const m = shareModel(categoryModel(genres, "genre"), genres.total, { running: true })!;
    const option = shareOption(m) as {
      yAxis: { name: string; max?: number }[];
      series: { type: string; data: unknown[]; yAxisIndex?: number }[];
    };
    expect(option.yAxis.map((a) => a.name)).toEqual(["Share of revenue (%)", "Running share (%)"]);
    expect(option.yAxis[1]!.max).toBe(100);
    expect(option.series.map((s) => s.type)).toEqual(["bar", "line"]);
    expect(option.series[1]!.yAxisIndex).toBe(1);
    expect((option.series[1]!.data as number[]).map(Math.round)).toEqual([50, 70, 80]);
  });
});
