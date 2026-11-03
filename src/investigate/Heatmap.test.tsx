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
const heat = {
  measure: "units" as const,
  rows: "genre" as const,
  cols: "price_band" as const,
  period: "recent" as const,
};
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe('the heatmap (David: "the same level of customization that we\'ve given to charts")', () => {
  it("lays out any two dimensions: every price band, the genres the data has, an unknown one last", () => {
    expect(heatAxis("price_band", result, [], {})).toEqual([
      "under $10",
      "$10 to $19.99",
      "$20 to $29.99",
      "$30 and up",
    ]);
    expect(heatAxis("genre", result, [], {})).toEqual(["Fiction", "Mystery", null]);
    const model = heatModel(
      result,
      "units",
      "genre",
      heatAxis("genre", result, [], {}),
      "price_band",
      heatAxis("price_band", result, [], {}),
    );
    expect([model.min, model.max, model.cells.length]).toEqual([0, 9, 12]);
  });

  it("leaves cells blank, never zero, when the terminal cut the result, and says so (Frank, #264)", () => {
    const cut = { ...result, truncated: true };
    const model = heatModel(
      cut,
      "units",
      "genre",
      heatAxis("genre", cut, [], {}),
      "price_band",
      heatAxis("price_band", cut, [], {}),
    );
    expect(model.cut).toBe(true);
    // Fiction at $10 to $19.99 isn't in the rows: unknown, not zero.
    expect(model.cells.find(([x, y]) => x === 1 && y === 0)![2]).toBeNull();
    const complete = heatModel(
      { ...result, truncated: false },
      "units",
      "genre",
      heatAxis("genre", result, [], {}),
      "price_band",
      heatAxis("price_band", result, [], {}),
    );
    expect(complete.cells.find(([x, y]) => x === 1 && y === 0)![2]).toBe(0);
    const html = renderToString(
      <Heatmap
        state={{ ...DEFAULT_STATE, heat }}
        result={cut}
        quarters={[]}
        onCell={() => {}}
        onHeat={() => {}}
        onPin={() => {}}
        pinned={false}
      />,
    );
    expect(html).toContain("This grid is too large to show in full. Narrow it with a filter.");
    expect(html).toMatch(
      /data-cut="true"[^>]*aria-label="Fiction, \$10 to \$19\.99: Not shown: the grid was cut off\."/,
    );
  });

  it("titles itself from its choices, offers its measure and axes, and labels every cell", () => {
    const html = renderToString(
      <Heatmap
        state={{ ...DEFAULT_STATE, heat }}
        result={result}
        quarters={[]}
        onCell={() => {}}
        onHeat={() => {}}
        onPin={() => {}}
        pinned={false}
      />,
    );
    expect(html).toMatch(/title="Pin this heatmap below"/);
    expect(html).toMatch(/<h2[^>]*>Units sold by genre and price band<\/h2>/);
    expect(text(html)).toContain("Show Units sold");
    expect(text(html)).toContain("Rows Genre");
    expect(text(html)).toContain("Columns Price band");
    expect(html).toContain('aria-label="Fiction, Under $10: 9"');
    // An unknown genre can't be filtered on: its cells aren't buttons.
    expect(html).toMatch(/<span class="[^"]*" data-tip="Unknown, Under \$10: 1"/);
  });

  it("keeps every column of its own axis when a cell on it is selected", () => {
    const quarters = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"];
    const byQuarter = { ...heat, rows: "weekday" as const, cols: "quarter" as const };
    const html = renderToString(
      <Heatmap
        state={{
          ...DEFAULT_STATE,
          heat: byQuarter,
          filters: { weekday: ["Monday"], quarter: ["2193-Q2"] },
        }}
        result={result}
        quarters={quarters}
        onCell={() => {}}
        onHeat={() => {}}
        onPin={() => {}}
        pinned={false}
      />,
    );
    for (const q of ["Q1", "Q2", "Q3", "Q4"])
      expect(html).toMatch(new RegExp(`role="columnheader"[^>]*>${q}<`));
  });

  it("offers its period only once the ledger holds more than eight quarters, and says so in its title (Plot, #264)", () => {
    const render = (quarters: string[], extra: Partial<typeof DEFAULT_STATE> = {}) =>
      renderToString(
        <Heatmap
          state={{ ...DEFAULT_STATE, heat, ...extra }}
          result={result}
          quarters={quarters}
          onCell={() => {}}
          onHeat={() => {}}
          onPin={() => {}}
          pinned={false}
        />,
      );
    const four = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"];
    const ten = [...four, "2194-Q1", "2194-Q2", "2194-Q3", "2194-Q4", "2195-Q1", "2195-Q2"];
    expect(text(render(four))).not.toContain("Period");
    expect(render(four)).toMatch(/<h2[^>]*>Units sold by genre and price band<\/h2>/);
    expect(text(render(ten))).toContain("Period Last eight quarters");
    expect(render(ten)).toMatch(
      /<h2[^>]*>Units sold by genre and price band, last eight quarters<\/h2>/,
    );
    // Every quarter: no suffix. The screen's own quarter filter: no suffix, and Period says why it can't change.
    expect(render(ten, { heat: { ...heat, period: "all" } })).toMatch(
      /<h2[^>]*>Units sold by genre and price band<\/h2>/,
    );
    const filtered = render(ten, { filters: { quarter: ["2194-Q4"] } });
    expect(filtered).toMatch(/<h2[^>]*>Units sold by genre and price band<\/h2>/);
    expect(text(filtered)).toMatch(/Following the screen(&#x27;|')s quarter filter\./);
    const byMonth = text(render(ten, { filters: { month: ["2193-02"] } }));
    expect(byMonth).toMatch(/Following the screen(&#x27;|')s month filter\./);
    // Both set: the quarter wording.
    expect(text(render(ten, { filters: { month: ["2193-02"], quarter: ["2193-Q1"] } }))).toMatch(
      /Following the screen(&#x27;|')s quarter filter\./,
    );
    // Cut off over every quarter of a long ledger: the note offers the window.
    expect(
      text(
        renderToString(
          <Heatmap
            state={{ ...DEFAULT_STATE, heat: { ...heat, period: "all" } }}
            result={{ ...result, truncated: true }}
            quarters={ten}
            onCell={() => {}}
            onHeat={() => {}}
            onPin={() => {}}
            pinned={false}
          />,
        ),
      ),
    ).toContain("Narrow it with a filter, or choose Last eight quarters.");
  });
});
