import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dropdown, ToggleMenu } from "./Dropdown";

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

  it("as a menu of switches, shows each one's state, counts those on, and says why one can't be switched", () => {
    const html = renderToString(
      <ToggleMenu
        name="Options"
        toggles={[
          { key: "compare", label: "Compare quarters", on: true, onToggle: () => {} },
          {
            key: "last_year",
            label: "vs. same quarter last year",
            on: false,
            reason: "Turn off Compare quarters to compare with last year",
            onToggle: () => {},
          },
          {
            key: "scatter",
            label: "Scatter plot",
            on: false,
            hint: "Plot one measure",
            onToggle: () => {},
          },
        ]}
      />,
    );
    expect(text(html)).toMatch(/^Options 1 on/);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toMatch(/<div[^>]*role="menu"[^>]*hidden/);
    expect(html.match(/role="menuitemcheckbox"/g)).toHaveLength(3);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    // Unavailable, but focusable and described by its reason, which shows.
    expect(html).toMatch(/aria-disabled="true" aria-describedby="[^"]+-why-1"/);
    expect(text(html)).toContain(
      "vs. same quarter last year Turn off Compare quarters to compare with last year",
    );
    expect(html).not.toMatch(/role="menuitemcheckbox"[^>]*\sdisabled=/);
    expect(html).toContain('title="Plot one measure"');
  });

  it("as a menu of switches with none on, says no count", () => {
    const html = renderToString(
      <ToggleMenu
        name="Options"
        toggles={[{ key: "compare", label: "Compare quarters", on: false, onToggle: () => {} }]}
      />,
    );
    expect(text(html)).toMatch(/^Options Compare quarters$/);
    expect(html).not.toContain("data-active");
  });
});
