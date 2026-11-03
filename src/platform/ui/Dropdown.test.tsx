import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dropdown } from "./Dropdown";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("the shared dropdown", () => {
  it("in single mode, names its choice and offers radios in one labelled group", () => {
    const html = renderToString(
      <Dropdown
        mode="single"
        name="Break down by"
        value="genre"
        onChange={() => {}}
        options={[
          { value: "month", label: "Month" },
          { value: "genre", label: "Genre" },
        ]}
      />,
    );
    expect(text(html)).toContain("Break down by Genre");
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<fieldset[^>]*hidden/);
  });

  it("in multi mode, offers checkboxes, and says why an option can't be chosen", () => {
    const html = renderToString(
      <Dropdown
        mode="multi"
        name="Show"
        values={["revenue", "units"]}
        onChange={() => {}}
        options={[
          { value: "revenue", label: "Revenue" },
          { value: "units", label: "Units sold" },
          { value: "avg_discount", label: "Average discount", disabledReason: "Two axes at most" },
        ]}
      />,
    );
    expect(text(html)).toContain("Show Revenue, Units sold");
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(text(html)).toContain("Average discount Two axes at most");
    expect(html).toMatch(/disabled="" aria-describedby="[^"]+-why-2"/);
  });
});
