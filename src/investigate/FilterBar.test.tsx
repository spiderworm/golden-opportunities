import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FilterBar } from "./FilterBar";
import type { FilterOptions } from "./investigation.server";
import type { Filters } from "./state";

const options: FilterOptions = { quarter: ["2193-Q4"], genre: [], format: [], publisher: [], discount_rate: [], volume: ["1", "2", "3"] };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const bar = (filters: Filters) => text(renderToString(<FilterBar filters={filters} options={options} onChange={() => {}} onDiscount={() => {}} onSeries={() => {}} onClear={() => {}} />));

describe("the series menu", () => {
  it("names its one choice, and shows no chip for it", () => {
    const html = bar({ volume: ["3"] });
    expect(html).toContain("Series Volume 3");
    expect(html).not.toContain("Remove Volume");
  });

  it("shows filters no single choice names as chips, so nothing applies unseen (Frank, #184)", () => {
    const html = bar({ in_series: ["yes"], volume: ["1"] });
    expect(html).toContain("Series Any book");
    expect(html).toContain("In a series In a series");
    expect(html).toContain("Volume Volume 1");
    expect(bar({ volume: ["1", "2"] })).toContain("Volume Volume 2");
  });
});
