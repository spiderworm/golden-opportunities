import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FilterBar } from "./FilterBar";
import type { FilterOptions } from "./investigation.server";
import type { Filters } from "./state";

const options: FilterOptions = { quarter: ["2193-Q4"], genre: [], format: [], publisher: [], discount_rate: [], award: ["Hugo Award", "Nebula Award"], volume: ["1", "2", "3"] };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const bar = (filters: Filters) => text(renderToString(<FilterBar filters={filters} options={options} onChange={() => {}} onDiscount={() => {}} onAward={() => {}} onSeries={() => {}} onClear={() => {}} />));

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
