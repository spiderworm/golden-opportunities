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

it("keeps the panel in the same place, folded or not, so folding never remounts it", () => {
  // React keeps a component mounted only while its place in the tree holds: the panel's wrapper is the aside's last
  // child either way, only hidden when folded. (Checked live too: the face canvas is the same element after a fold.)
  const draw = (folded: boolean) =>
    renderToString(
      <DeweyColumn track={() => {}} start={{ width: COLUMN.width, folded }}>
        <p>panel</p>
      </DeweyColumn>,
    );
  const open = draw(false);
  const shut = draw(true);
  expect(open).toMatch(/<div data-dewey-panel=""><p>panel<\/p><\/div><\/aside>$/);
  expect(shut).toMatch(/<div hidden="" data-dewey-panel=""><p>panel<\/p><\/div><\/aside>$/);
  // Folded: the strip to open it, and no handle.
  expect(shut).toContain('aria-label="Open Dewey"');
  expect(shut).not.toContain('role="separator"');
});
