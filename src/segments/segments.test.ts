import { describe, expect, it } from "vitest";
import {
  applySegmentChange,
  checkFilters,
  checkName,
  filterCount,
  parseSegmentChange,
  SEGMENT_LIMITS,
  validSegments,
  type Segment,
} from "./segments";

const awarded = { awarded: ["yes"], format: ["Trade paperback"], price_band: ["Under $10"] };
let next = 0;
const newId = () => `s${++next}`;
const create = (current: Segment[], name: string, filters: object = awarded) =>
  applySegmentChange(current, { intent: "create", name, filters }, newId);

describe("a segment's name", () => {
  it("is 1 to 60 characters of one plain line, trimmed", () => {
    expect(checkName("  Awarded paperbacks  ")).toEqual({ ok: true, name: "Awarded paperbacks" });
    expect(checkName("   ")).toMatchObject({ reason: "no_name" });
    expect(checkName("x".repeat(61))).toMatchObject({ reason: "too_long" });
    expect(checkName("x".repeat(60))).toMatchObject({ ok: true });
    expect(checkName("two\nlines")).toMatchObject({ reason: "invalid" });
    expect(checkName("hidden​space")).toMatchObject({ reason: "invalid" });
    expect(checkName(7)).toMatchObject({ reason: "invalid" });
  });
});

describe("a segment's filters", () => {
  it("are exactly what Investigate would read, with at least one", () => {
    expect(checkFilters(awarded)).toEqual({ ok: true, filters: awarded });
    expect(checkFilters({})).toMatchObject({ reason: "no_filters" });
    // Investigate drops these, so a segment can't hold them.
    expect(checkFilters({ shelf: ["A"] })).toMatchObject({ reason: "invalid" });
    expect(checkFilters({ genre: ["Fiction", "Fiction"] })).toMatchObject({ reason: "invalid" });
    expect(checkFilters({ genre: [""] })).toMatchObject({ reason: "invalid" });
    expect(checkFilters({ genre: ["x".repeat(201)] })).toMatchObject({ reason: "invalid" });
    expect(checkFilters({ genre: "Fiction" })).toMatchObject({ reason: "invalid" });
    // Investigate reads a bare month as 2193's; stored, it must already be the year-month it reads.
    expect(checkFilters({ month: ["04"] })).toMatchObject({ reason: "invalid" });
    expect(checkFilters({ month: ["2193-04"] })).toMatchObject({ ok: true });
  });

  it("are counted, never named, for their events", () => {
    expect(filterCount(awarded)).toBe(3);
    expect(filterCount({ genre: ["Fiction", "Mystery"] })).toBe(2);
  });
});

describe("changing the player's segments", () => {
  it("creates one with the server's id, renames it, re-saves its filters and deletes it", () => {
    const made = create([], "Awarded paperbacks");
    expect(made).toMatchObject({ ok: true });
    if (!made.ok) return;
    const [segment] = made.segments;
    expect(segment).toEqual({ id: made.id, name: "Awarded paperbacks", filters: awarded });
    const renamed = applySegmentChange(
      made.segments,
      { intent: "rename", id: made.id, name: "Prize paperbacks" },
      newId,
    );
    expect(renamed.ok && renamed.segments[0]!.name).toBe("Prize paperbacks");
    if (!renamed.ok) return;
    const edited = applySegmentChange(
      renamed.segments,
      { intent: "update", id: made.id, filters: { awarded: ["yes"] } },
      newId,
    );
    expect(edited.ok && edited.segments[0]!.filters).toEqual({ awarded: ["yes"] });
    if (!edited.ok) return;
    const gone = applySegmentChange(edited.segments, { intent: "delete", id: made.id }, newId);
    expect(gone).toEqual({ ok: true, id: made.id, segments: [] });
  });

  it("keeps names and filter sets distinct, naming the segment a change clashes with", () => {
    const first = create([], "Awarded paperbacks");
    if (!first.ok) throw new Error("first");
    expect(create(first.segments, "awarded PAPERBACKS", { genre: ["Fiction"] })).toEqual({
      ok: false,
      reason: "taken",
      name: "Awarded paperbacks",
    });
    // The same filters in another order are the same segment.
    expect(
      create(first.segments, "Prize paperbacks", {
        price_band: ["Under $10"],
        format: ["Trade paperback"],
        awarded: ["yes"],
      }),
    ).toEqual({ ok: false, reason: "same_filters", name: "Awarded paperbacks" });
    const second = create(first.segments, "Fiction", { genre: ["Fiction"] });
    if (!second.ok) throw new Error("second");
    expect(
      applySegmentChange(
        second.segments,
        { intent: "rename", id: second.id, name: "awarded paperbacks" },
        newId,
      ),
    ).toMatchObject({ reason: "taken" });
    expect(
      applySegmentChange(
        second.segments,
        { intent: "update", id: second.id, filters: awarded },
        newId,
      ),
    ).toMatchObject({ reason: "same_filters", name: "Awarded paperbacks" });
    // Renaming one to its own name, in another case, is fine.
    expect(
      applySegmentChange(
        second.segments,
        { intent: "rename", id: second.id, name: "FICTION" },
        newId,
      ),
    ).toMatchObject({ ok: true });
  });

  it("refuses past the limit, and a change to a segment that isn't there", () => {
    let segments: Segment[] = [];
    for (let i = 0; i < SEGMENT_LIMITS.segments; i++) {
      const made = create(segments, `Genre ${i}`, { genre: [`G${i}`] });
      if (!made.ok) throw new Error(made.reason);
      segments = made.segments;
    }
    expect(create(segments, "One more", { genre: ["More"] })).toMatchObject({ reason: "full" });
    expect(applySegmentChange(segments, { intent: "delete", id: "nope" }, newId)).toMatchObject({
      reason: "missing",
    });
  });

  it("reads only the shapes it expects from the browser", () => {
    expect(parseSegmentChange({ intent: "create", name: "A", filters: awarded })).toMatchObject({
      intent: "create",
    });
    expect(
      parseSegmentChange({ intent: "create", name: "A", filters: awarded, id: "mine" }),
    ).toBeNull();
    expect(parseSegmentChange({ intent: "delete" })).toBeNull();
    expect(parseSegmentChange({ intent: "drop", id: "s1" })).toBeNull();
    expect(parseSegmentChange("delete")).toBeNull();
  });
});

describe("the save's segments", () => {
  const good: Segment[] = [
    { id: "a1", name: "Awarded paperbacks", filters: awarded },
    { id: "b2", name: "Fiction", filters: { genre: ["Fiction"] } },
  ];

  it("are valid as written, and refused when hand-edited past the rules", () => {
    expect(validSegments(good)).toBe(true);
    expect(validSegments([])).toBe(true);
    expect(validSegments([...good, { ...good[0]!, id: "c3" }])).toBe(false); // name again
    expect(validSegments([good[0], { ...good[1]!, id: "a1" }])).toBe(false); // id again
    expect(validSegments([{ ...good[0]!, name: " padded " }])).toBe(false);
    expect(validSegments([{ ...good[0]!, filters: {} }])).toBe(false);
    expect(validSegments([{ ...good[0]!, extra: 1 }])).toBe(false);
    expect(validSegments([{ ...good[0]!, id: "Not An Id" }])).toBe(false);
    const many = Array.from({ length: SEGMENT_LIMITS.segments + 1 }, (_, i) => ({
      id: `s${i}`,
      name: `S${i}`,
      filters: { genre: [`G${i}`] },
    }));
    expect(validSegments(many)).toBe(false);
  });
});
