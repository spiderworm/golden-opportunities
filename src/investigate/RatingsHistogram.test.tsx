import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { QueryResult } from "~/query/types";
import { RatingsHistogram, ratingsModel } from "./RatingsHistogram";

const result = (rows: { stars: string; ratings: number }[]): QueryResult => ({
  columns: [],
  rows,
  total: rows.reduce((sum, row) => sum + row.ratings, 0),
  source: "Ratings, undated source snapshot.",
});
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("one title's ratings", () => {
  it("lists five stars first, fills in a rating nobody gave, and averages what they did", () => {
    const model = ratingsModel(
      result([
        { stars: "1", ratings: 1 },
        { stars: "4", ratings: 2 },
        { stars: "5", ratings: 1 },
      ]),
    )!;
    expect(model.rows.map((r) => [r.stars, r.count])).toEqual([
      ["5", 1],
      ["4", 2],
      ["3", 0],
      ["2", 0],
      ["1", 1],
    ]);
    expect(model.total).toBe(4);
    expect(model.mean).toBe(3.5);
    expect(model.rows[1]!.share).toBe(0.5);
  });

  it("shows the average, each star's count and share, and says the screen's filters don't reach it", () => {
    const html = renderToString(
      <RatingsHistogram
        title="Land Water Sky Space"
        result={result([
          { stars: "4", ratings: 3 },
          { stars: "5", ratings: 1 },
        ])}
      />,
    );
    expect(text(html)).toContain("Average 4.25 from 4 ratings");
    expect(text(html)).toContain("5 stars 1 25%");
    expect(text(html)).toContain("4 stars 3 75%");
    expect(text(html)).toContain("1 star 0 0%");
    expect(text(html)).toContain("Ratings of Land Water Sky Space by stars");
    expect(text(html)).toContain(
      "Ratings aren't dated, so the screen's other filters don't apply to them.",
    );
  });

  it("says so when nobody rated the title", () => {
    expect(ratingsModel(result([]))).toBeNull();
    expect(
      text(renderToString(<RatingsHistogram title="Cimornul" result={result([])} />)),
    ).toContain("No one has rated this title.");
  });
});
