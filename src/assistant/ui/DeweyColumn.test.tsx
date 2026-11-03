import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";

import { clampWidth, COLUMN, DeweyColumn, readColumn } from "./DeweyColumn";

it("draws Dewey's column at its default width with a resize handle and a fold button, the panel inside", () => {
  const html = renderToString(
    <DeweyColumn className="column" track={() => {}}>
      <p>panel</p>
    </DeweyColumn>,
  );
  expect(html).toContain(`--dewey-width:${COLUMN.width}px`);
  expect(html).toMatch(/role="separator"[^>]*aria-label="Resize Dewey"/);
  expect(html).toContain('aria-label="Fold Dewey away"');
  expect(html).toContain("<p>panel</p>");
});

it("keeps a width within its minimum, its maximum and half the window", () => {
  expect(clampWidth(100)).toBe(COLUMN.min);
  expect(clampWidth(5000)).toBe(COLUMN.max);
  expect(clampWidth(600, 1000)).toBe(500);
  // A narrow window never squeezes it under its minimum.
  expect(clampWidth(600, 500)).toBe(COLUMN.min);
});

it("reads back what this browser kept, and the defaults for anything else", () => {
  expect(readColumn(null)).toEqual({ width: COLUMN.width, folded: false });
  expect(readColumn("not json")).toEqual({ width: COLUMN.width, folded: false });
  expect(readColumn('{"width":600,"folded":true}')).toEqual({ width: 600, folded: true });
  expect(readColumn('{"width":99999,"folded":"yes"}')).toEqual({
    width: COLUMN.max,
    folded: false,
  });
});
