import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refusalCopy, SEGMENT_COPY } from "./copy";
import { SegmentMenu, suggestedName } from "./SegmentControls";
import type { Segment } from "./segments";
import { changeSegments, listFor } from "./store";

const awarded: Segment = {
  id: "a1",
  name: "Awarded paperbacks",
  filters: { awarded: ["yes"], format: ["Trade paperback"] },
};
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const menu = (segments: Segment[], applied: Segment | null, edited = false) =>
  text(
    renderToString(
      <SegmentMenu
        segments={segments}
        applied={applied}
        edited={edited}
        onApply={() => {}}
        onDeleted={() => {}}
      />,
    ),
  );

describe("the Segment menu (Plot, section 8)", () => {
  it("names the segment the filters came from, and says when they've changed since", () => {
    expect(menu([awarded], null)).toMatch(/^Segment None/);
    expect(menu([awarded], awarded)).toMatch(/^Segment Awarded paperbacks/);
    expect(menu([awarded], awarded, true)).toMatch(/^Segment Awarded paperbacks, edited/);
  });

  it("lists each segment with Rename, Edit filters and Delete, or says how to make one", () => {
    expect(menu([awarded], null)).toContain("Awarded paperbacks Rename Edit filters Delete");
    expect(menu([], null)).toContain(SEGMENT_COPY.empty);
  });
});

describe("a segment's suggested name", () => {
  it("is the filters' values, as the bar names them, cut to 60 characters", () => {
    expect(suggestedName({ awarded: ["yes"], format: ["Trade paperback"] })).toBe(
      "Trade paperback, Award winner",
    );
    const long = suggestedName({
      title: Array.from({ length: 10 }, (_, i) => `A long title ${i}`),
    });
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long).toBe("A long title 0, A long title 1, A long title 2");
  });
});

describe("refusals, in Plot's words", () => {
  it("name the clashing segment and the limits", () => {
    expect(refusalCopy("taken", "Fiction")).toBe('You already have a segment called "Fiction".');
    expect(refusalCopy("same_filters", "Fiction")).toBe(
      'These filters are already saved as "Fiction".',
    );
    expect(refusalCopy("full")).toBe("You have 20 segments. Delete one to save another.");
    expect(refusalCopy("too_many")).toBe(
      "A segment holds up to 50 filter values. Remove some to save it.",
    );
    expect(refusalCopy("missing")).toBe("That segment was deleted in another tab.");
  });
});

describe("a change sent to /api/segments", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the answer's list, and reads a busy save as busy", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ ok: false, reason: "missing", segments: [] }, { status: 400 }),
    );
    expect(await changeSegments({ intent: "delete", id: "a1" })).toEqual({
      ok: false,
      reason: "missing",
      segments: [],
    });
    vi.stubGlobal("fetch", async () => new Response("busy", { status: 409 }));
    expect(await changeSegments({ intent: "delete", id: "a1" })).toEqual({
      ok: false,
      reason: "busy",
    });
  });
});

describe("the list the page shows (Chart, #387)", () => {
  const fiction: Segment = { id: "f1", name: "Fiction", filters: { genre: ["Fiction"] } };
  it("is the kept one under the page's data version, and never one kept under another", () => {
    expect(listFor({ segments: [awarded], version: "v1" }, [fiction], "v1")).toEqual([awarded]);
    // A game since replaced by Play again: the page's own load.
    expect(listFor({ segments: [awarded], version: "v1" }, [fiction], "v2")).toEqual([fiction]);
    expect(listFor(null, [fiction], "v1")).toEqual([fiction]);
  });
});
