// The player's own reports (docs/design/reports.md section 3): titled sets of pinned charts, each with an optional
// note. Kept in the save, so Play again starts with none. These checks run in the browser, in the Reports action and
// in the save's own validate(), so a hand-edited save can't grow past them. Client-safe: no server imports.
// Relative .ts imports: the save store loads this in plain Node (store.server.test.ts), without the ~ alias.
import { isQuarterId, type QuarterId } from "../game/quarters.ts";
import { parsePinSpec, type PinSpec } from "../investigate/pins/spec.ts";

export interface PlayerReport {
  /** The server's: one sent by the browser is ignored. */
  id: string;
  title: string;
  summary?: string;
  items: { spec: PinSpec; note?: string }[];
  /** The quarter being played when it was created and last edited, for "edited Q2 2194". */
  created: QuarterId;
  edited: QuarterId;
}

/** What the browser sends: a report without what the server assigns. */
export type ReportInput = Pick<PlayerReport, "title" | "summary" | "items">;

export const REPORT_LIMITS = {
  /** Tune: at 12, New report is off and says why. */
  reports: 12,
  items: 6,
  title: 80,
  summary: 1000,
  note: 500,
} as const;

export type RefusalReason = "full" | "limit" | "no_title" | "no_charts" | "invalid";

/** Control characters but the line break, and the marks that reorder text (Audit, #171). */
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
const plain = (text: string, lines: boolean) =>
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
  if (!isObject(value) || !only(value, ["title", "summary", "items"]))
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
  return { ok: true, report: { title, ...(summary === undefined ? {} : { summary }), items } };
}

/** The save's reports, as written: every report valid, ids distinct, at most the limit. */
export function validReports(value: unknown): value is PlayerReport[] {
  if (!Array.isArray(value) || value.length > REPORT_LIMITS.reports) return false;
  const ids = new Set<string>();
  return value.every((r) => {
    if (!isObject(r) || !only(r, ["id", "title", "summary", "items", "created", "edited"]))
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
