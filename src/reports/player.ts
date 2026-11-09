// The player's own reports (docs/design/reports.md section 3): titled sets of pinned charts, each with an optional
// note. Kept in the save, so Play again starts with none. These checks run in the browser, in the Reports action and
// in the save's own validate(), so a hand-edited save can't grow past them. Client-safe: no server imports.
// Relative .ts imports: the save store loads this in plain Node (store.server.test.ts), without the ~ alias.
import { isQuarterId, type QuarterId } from "../game/quarters.ts";
import { parsePinSpec, pinKey, type PinSpec } from "../investigate/pins/spec.ts";
import { SEGMENT_ID } from "../segments/id.ts";

export interface PlayerReport {
  /** The server's: one sent by the browser is ignored. */
  id: string;
  title: string;
  summary?: string;
  items: { spec: PinSpec; note?: string }[];
  /**
   * A saved segment over every chart, by id (src/segments/apply.ts), as AND with each chart's own filters. Kept when
   * the segment is deleted: the report then says so and shows the charts' own filters.
   */
  segment?: string;
  /** The quarter being played when it was created and last edited, for "edited Q2 2194". */
  created: QuarterId;
  edited: QuarterId;
}

/** What the browser sends: a report without what the server assigns. */
export type ReportInput = Pick<PlayerReport, "title" | "summary" | "items" | "segment">;

export const REPORT_LIMITS = {
  /** Tune: at 12, New report is off and says why. */
  reports: 12,
  items: 6,
  title: 80,
  summary: 1000,
  note: 500,
} as const;

export type RefusalReason = "full" | "limit" | "no_title" | "no_charts" | "invalid";

/** Control characters but the line break; the marks that reorder text (Audit, #171); and zero-width characters (Audit, #284). */
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;
const BIDI = /[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/;
/** Player text with no control, reordering or zero-width characters; one line unless `lines`. Shared by segments. */
export const plain = (text: string, lines: boolean) =>
  !CONTROL.test(text) && !BIDI.test(text) && (lines || !text.includes("\n"));

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const only = (o: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(o).every((k) => keys.includes(k));

/** An optional text: absent, or within its length and plain. Empty counts as absent. */
function optional(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === "") return undefined;
  return typeof value === "string" && value.length <= max && plain(value, true) ? value : null;
}

/** Checks what the browser sent; the reason for the first thing wrong, as report_refused names it. */
export function checkReport(
  value: unknown,
): { ok: true; report: ReportInput } | { ok: false; reason: RefusalReason } {
  if (!isObject(value) || !only(value, ["title", "summary", "items", "segment"]))
    return { ok: false, reason: "invalid" };
  // A segment's id as the server makes them (src/segments/segments.ts); whether it's still saved isn't checked.
  if (
    value.segment !== undefined &&
    (typeof value.segment !== "string" || !SEGMENT_ID.test(value.segment))
  )
    return { ok: false, reason: "invalid" };
  const title = typeof value.title === "string" ? value.title.trim() : null;
  if (title === null) return { ok: false, reason: "invalid" };
  if (!title) return { ok: false, reason: "no_title" };
  if (title.length > REPORT_LIMITS.title || !plain(title, false))
    return { ok: false, reason: "invalid" };
  const summary = optional(value.summary, REPORT_LIMITS.summary);
  if (summary === null || !Array.isArray(value.items)) return { ok: false, reason: "invalid" };
  if (value.items.length === 0) return { ok: false, reason: "no_charts" };
  if (value.items.length > REPORT_LIMITS.items) return { ok: false, reason: "full" };
  const items: ReportInput["items"] = [];
  for (const item of value.items) {
    if (!isObject(item) || !only(item, ["spec", "note"])) return { ok: false, reason: "invalid" };
    const spec = parsePinSpec(item.spec);
    const note = optional(item.note, REPORT_LIMITS.note);
    if (!spec || note === null) return { ok: false, reason: "invalid" };
    items.push(note === undefined ? { spec } : { spec, note });
  }
  return {
    ok: true,
    report: {
      title,
      ...(summary === undefined ? {} : { summary }),
      items,
      ...(typeof value.segment === "string" ? { segment: value.segment } : {}),
    },
  };
}

/** The save's reports, as written: every report valid, ids distinct, at most the limit. */
export function validReports(value: unknown): value is PlayerReport[] {
  if (!Array.isArray(value) || value.length > REPORT_LIMITS.reports) return false;
  const ids = new Set<string>();
  return value.every((r) => {
    if (
      !isObject(r) ||
      !only(r, ["id", "title", "summary", "items", "segment", "created", "edited"])
    )
      return false;
    if (typeof r.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(r.id) || ids.has(r.id)) return false;
    ids.add(r.id);
    if (!isQuarterId(r.created) || !isQuarterId(r.edited)) return false;
    const { id: _id, created: _c, edited: _e, ...input } = r;
    // Passes the browser's checks. Not compared field for field: a pin read under a later rule (parseAlso) may
    // keep less than it stored, and that mustn't refuse the whole save.
    return checkReport(input).ok;
  });
}

/** What an edit did, in counts only, for report_edited: never a title, note or chart's words. */
export function editCounts(before: ReportInput, after: ReportInput) {
  // By pinKey: the same chart whatever its title or view, so toggling it isn't a removal and an addition.
  const keys = (r: ReportInput) => r.items.map((i) => pinKey(i.spec));
  const was = keys(before);
  const now = keys(after);
  const kept = (list: string[], other: string[]) => list.filter((k) => other.includes(k));
  const order = kept(was, now);
  return {
    renamed: before.title !== after.title,
    added: now.filter((k) => !was.includes(k)).length,
    removed: was.filter((k) => !now.includes(k)).length,
    // The charts in both whose place among the kept ones changed.
    moved: kept(now, was).filter((k, i) => order[i] !== k).length,
  };
}

/** A report's shape in counts, for its events: charts, notes written, and whether it has a summary. */
export const reportCounts = (r: ReportInput) => ({
  charts: r.items.length,
  notes: r.items.filter((i) => i.note).length,
  summary: !!r.summary,
  // Whether it has a segment of its own, and how many charts carry one: never which, or its name.
  segment: !!r.segment,
  segmented: r.items.filter((i) => i.spec.kind !== "comparison" && i.spec.segment).length,
});
