import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FilterBar } from "./FilterBar";
import type { FilterOptions } from "./investigation.server";
import { shownFilters, type FilterId, type Filters } from "./state";

const options: FilterOptions = {
  quarter: ["2193-Q4"],
  genre: [],
  format: [],
  publisher: [],
  discount_rate: [],
  award: ["Hugo Award", "Nebula Award"],
  volume: ["1", "2", "3"],
  price_band: ["under $10", "$10 to $19.99", "$20 to $29.99", "$30 and up"],
};
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const html = (filters: Filters, added: FilterId[] = []) => {
  const shown = shownFilters(new URLSearchParams(added.map((id) => ["show", id])), filters);
  return renderToString(
    <FilterBar
      filters={filters}
      options={options}
      shown={shown}
      onAdd={() => {}}
      onRemove={() => {}}
      onChange={() => {}}
      onDiscount={() => {}}
      onAward={() => {}}
      onSeries={() => {}}
      onClear={() => {}}
    />,
  );
};
const bar = (filters: Filters, added: FilterId[] = []) => text(html(filters, added));

describe("the bar (David, 2 Nov 2026)", () => {
  it("shows only the filters the player added, and Add a filter", () => {
    const empty = bar({});
    expect(empty).toContain("Add a filter");
    expect(empty).not.toContain("All genres");
    expect(empty).not.toContain("Clear filters");
    const added = bar({}, ["genre", "awards"]);
    expect(added).toContain("Genre All genres");
    expect(added).toContain("Awards Any book");
    expect(added).not.toContain("All quarters");
  });

  it("shows a filter that has values even if it wasn't added, so nothing applies unseen", () => {
    expect(bar({ weekday: ["Monday"], month: ["2193-12"] })).toMatch(
      /Month Dec 2193.*Weekday Monday/,
    );
  });

  it("gives each filter an x that names it, and lists every filter to add, checked if it's on the bar", () => {
    const markup = html({ genre: ["Fiction"] }, ["quarter"]);
    expect(markup).toContain('aria-label="Remove the Quarter filter"');
    expect(markup).toContain('aria-label="Remove the Genre filter"');
    const list = markup.slice(markup.indexOf("Filters on the bar"));
    for (const name of [
      "Quarter",
      "Genre",
      "Format",
      "Publisher",
      "Discount",
      "Awards",
      "Series volume",
      "Month",
      "Weekday",
      "Title",
    ])
      expect(list).toContain(name);
    expect((list.match(/checked=""/g) ?? []).length).toBe(2);
    expect(text(markup)).toContain("Clear filters");
  });

  it("explains how to choose a title when none is chosen", () => {
    expect(bar({}, ["title"])).toContain("Choose a title from a chart broken down by Title.");
  });
});

describe('prices and editions (David: "Players should see price, yes")', () => {
  it("chooses price bands, and shows an exact list price from a drilldown as a chip", () => {
    expect(bar({}, ["price"])).toContain("Price band Any price");
    const page = html({ price_band: ["under $10"], list_price: ["$12.99"] });
    expect(text(page)).toContain("Price band Under $10");
    expect(page).toContain('aria-label="Other filters"');
    expect(text(page)).toContain("List price $12.99");
    expect(page).toContain('aria-label="Remove List price $12.99"');
  });

  it("explains how to choose an edition when none is chosen", () => {
    expect(bar({}, ["edition"])).toContain(
      "Choose an edition from a chart broken down by Edition.",
    );
    expect(bar({ edition: ["Rystwyth (Hardcover)"] })).toContain("Edition Rystwyth (Hardcover)");
  });
});

describe("the awards menu", () => {
  it("names its one choice, and shows no chip for it", () => {
    const html = bar({ award: ["Hugo Award"] });
    expect(html).toContain("Awards Hugo Award");
    expect(html).not.toContain("Remove Award");
  });

  it("shows filters no single choice names as chips, so nothing applies unseen (Frank, #184)", () => {
    const html = bar({ awarded: ["yes"], award: ["Hugo Award"] });
    expect(html).toContain("Awards Any book");
    expect(html).toContain("Award winner Award winner");
    expect(html).toContain("Award Hugo Award");
    expect(bar({ award: ["Hugo Award", "Nebula Award"] })).toContain("Award Nebula Award");
  });
});

describe("the series volume menu", () => {
  it("names its one choice, and shows no chip for it", () => {
    const html = bar({ volume: ["3"] });
    expect(html).toContain("Series volume Volume 3");
    expect(html).not.toContain("Remove Volume");
  });

  it("shows filters no single choice names as chips, so nothing applies unseen (Frank, #184)", () => {
    const html = bar({ in_series: ["yes"], volume: ["1"] });
    expect(html).toContain("Series volume Any book");
    expect(html).toContain("In a series In a series");
    expect(html).toContain("Series volume Volume 1");
    expect(bar({ volume: ["1", "2"] })).toContain("Series volume Volume 2");
  });
});
