import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReasonToggle } from "./ReasonToggle";

describe("a toggle that says why it's off", () => {
  it("stays focusable, and is described by its reason as text", () => {
    const html = renderToString(
      <ReasonToggle
        pressed={false}
        reason="Show one measure to compare with last year"
        onToggle={() => {}}
      >
        vs. same quarter last year
      </ReasonToggle>,
    );
    expect(html).not.toMatch(/\sdisabled[=\s>]/);
    expect(html).toContain('aria-disabled="true"');
    const id = html.match(/aria-describedby="([^"]+)"/)![1]!;
    expect(html).toMatch(
      new RegExp(`id="${id}" role="tooltip"[^>]*>Show one measure to compare with last year<`),
    );
  });

  it("has no reason and no description when it can be used", () => {
    const html = renderToString(
      <ReasonToggle pressed reason={null} onToggle={() => {}}>
        Compare quarters
      </ReasonToggle>,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("aria-disabled");
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("tooltip");
  });
});
