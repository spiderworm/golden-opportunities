import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { heatAxis, heatModel } from "./charts/heat-model";
import { Heatmap } from "./Heatmap";
import { DEFAULT_STATE } from "./state";

const result = {
  columns: [
    { key: "genre" as const, label: "Genre", type: "string" as const, nullable: true },
    { key: "price_band" as const, label: "Price band", type: "string" as const, nullable: false },
    { key: "units" as const, label: "Units", type: "number" as const, nullable: false },
  ],
  rows: [
    { genre: "Mystery", price_band: "$10 to $19.99", units: 4 },
    { genre: "Fiction", price_band: "under $10", units: 9 },
    { genre: null, price_band: "under $10", units: 1 },
  ],
  total: 14,
  source: "S",
};
const heat = { measure: "units" as const, rows: "genre" as const, cols: "price_band" as const };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("the heatmap (David: \"the same level of customization that we've given to charts\")", () => {
  it("lays out any two dimensions: every price band, the genres the data has, an unknown one last", () => {
    expect(heatAxis("price_band", result, [], {})).toEqual(["under $10", "$10 to $19.99", "$20 to $29.99", "$30 and up"]);
    expect(heatAxis("genre", result, [], {})).toEqual(["Fiction", "Mystery", null]);
    const model = heatModel(result, "units", "genre", heatAxis("genre", result, [], {}), "price_band", heatAxis("price_band", result, [], {}));
    expect([model.min, model.max, model.cells.length]).toEqual([0, 9, 12]);
  });

  it("titles itself from its choices, offers its measure and axes, and labels every cell", () => {
    const html = renderToString(<Heatmap state={{ ...DEFAULT_STATE, heat }} result={result} quarters={[]} onCell={() => {}} onHeat={() => {}} />);
    expect(html).toMatch(/<h2[^>]*>Units sold by genre and price band<\/h2>/);
    expect(text(html)).toContain("Show Units sold");
    expect(text(html)).toContain("Rows Genre");
    expect(text(html)).toContain("Columns Price band");
    expect(html).toContain('aria-label="Fiction, Under $10: 9"');
    // An unknown genre can't be filtered on: its cells aren't buttons.
    expect(html).toMatch(/<span class="[^"]*" data-tip="Unknown, Under \$10: 1"/);
  });
});
