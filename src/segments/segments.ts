// Saved segments (David, 3 Nov 2026: "Named filter sets ("awarded paperbacks under $20") that can be applied to any
// chart or to a whole report"): a name and Investigate's filters, kept in the save as the player's reports are, so
// Play again starts with none. These checks run in the browser, in the segments action and in the save's own
// validate(), so a hand-edited save can't grow past them. Client-safe: no server imports. Relative .ts imports: the
// save store loads this in plain Node, without the ~ alias.
import { FILTER_DIMENSIONS, readFilters, type Filters } from "../investigate/state.ts";
import { plain } from "../reports/player.ts";
import { SEGMENT_ID } from "./id.ts";

export interface Segment {
  /** The server's: one sent by the browser is ignored. */
  id: string;
  name: string;
  /** Exactly Investigate's filters, read by its own rules (readFilters), with at least one. */
  filters: Filters;
}

export const SEGMENT_LIMITS = {
  segments: 20,
  name: 60,
  /** Filter values in one segment, so a save can't grow without bound (Frank, #377). */
  values: 50,
} as const;

/** Why a change was refused: segment_refused names it, and the browser says it in Plot's words. */
export type SegmentRefusal =
  | "full"
  | "no_name"
  | "too_long"
  | "taken"
  | "same_filters"
  | "no_filters"
  | "too_many"
  | "missing"
  | "invalid";

/** A change the browser asks for: make one, rename it, re-save it with the current filters, or delete it. */
export type SegmentChange =
  | { intent: "create"; name: string; filters: Filters }
  | { intent: "rename"; id: string; name: string }
  | { intent: "update"; id: string; filters: Filters }
  | { intent: "delete"; id: string };

type Refused = { ok: false; reason: SegmentRefusal; name?: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A name as the player typed it, trimmed: 1 to 60 characters of one plain line, or why not. */
export function checkName(value: unknown): { ok: true; name: string } | Refused {
  if (typeof value !== "string") return { ok: false, reason: "invalid" };
  const name = value.trim();
  if (!name) return { ok: false, reason: "no_name" };
  if (name.length > SEGMENT_LIMITS.name) return { ok: false, reason: "too_long" };
  if (!plain(name, false)) return { ok: false, reason: "invalid" };
  return { ok: true, name };
}

/**
 * Filters as sent or stored, read by Investigate's rules (readFilters). Refused if it holds anything they wouldn't
 * keep as it is (an unknown dimension, a value they'd drop or change), so what's saved is exactly what a chart reads.
 */
export function checkFilters(value: unknown): { ok: true; filters: Filters } | Refused {
  if (!isObject(value)) return { ok: false, reason: "invalid" };
  const known = (FILTER_DIMENSIONS as readonly string[]).includes.bind(FILTER_DIMENSIONS);
  if (!Object.keys(value).every(known)) return { ok: false, reason: "invalid" };
  if (!Object.values(value).every((v) => Array.isArray(v) && v.every((x) => typeof x === "string")))
    return { ok: false, reason: "invalid" };
  const filters = readFilters((d) => (value[d] as string[] | undefined) ?? []);
  const asSent = Object.fromEntries(
    FILTER_DIMENSIONS.filter((d) => d in value).map((d) => [d, value[d]]),
  );
  if (JSON.stringify(filters) !== JSON.stringify(asSent)) return { ok: false, reason: "invalid" };
  if (!Object.keys(filters).length) return { ok: false, reason: "no_filters" };
  if (filterCount(filters) > SEGMENT_LIMITS.values) return { ok: false, reason: "too_many" };
  return { ok: true, filters };
}

/** Two filter sets are one segment when they hold the same values, whatever their order. */
export function sameFilters(a: Filters, b: Filters): boolean {
  const key = (f: Filters) =>
    JSON.stringify(
      Object.entries(f)
        .map(([d, v]) => [d, [...(v ?? [])].sort()] as const)
        .sort(([x], [y]) => x.localeCompare(y)),
    );
  return key(a) === key(b);
}

/** The save's segments, as written: each valid, ids distinct, names distinct ignoring case, at most the limit. */
export function validSegments(value: unknown): value is Segment[] {
  if (!Array.isArray(value) || value.length > SEGMENT_LIMITS.segments) return false;
  const ids = new Set<string>();
  const names = new Set<string>();
  return value.every((s) => {
    if (!isObject(s) || Object.keys(s).some((k) => !["id", "name", "filters"].includes(k)))
      return false;
    if (typeof s.id !== "string" || !SEGMENT_ID.test(s.id) || ids.has(s.id)) return false;
    const name = checkName(s.name);
    if (!name.ok || name.name !== s.name || names.has(name.name.toLowerCase())) return false;
    ids.add(s.id);
    names.add(name.name.toLowerCase());
    return checkFilters(s.filters).ok;
  });
}

/** What the browser sent, as a change, or null when it isn't one. Its fields are checked when it's applied. */
export function parseSegmentChange(value: unknown): SegmentChange | null {
  if (!isObject(value)) return null;
  const keys = (allowed: readonly string[]) => Object.keys(value).every((k) => allowed.includes(k));
  const id = typeof value.id === "string" ? value.id : null;
  switch (value.intent) {
    case "create":
      return keys(["intent", "name", "filters"])
        ? { intent: "create", name: value.name as string, filters: value.filters as Filters }
        : null;
    case "rename":
      return keys(["intent", "id", "name"]) && id
        ? { intent: "rename", id, name: value.name as string }
        : null;
    case "update":
      return keys(["intent", "id", "filters"]) && id
        ? { intent: "update", id, filters: value.filters as Filters }
        : null;
    case "delete":
      return keys(["intent", "id"]) && id ? { intent: "delete", id } : null;
    default:
      return null;
  }
}

export type SegmentOutcome = { ok: true; segments: Segment[]; id: string } | Refused;

/**
 * A change applied to the save's segments: checked again here, the id the server's (`newId`). Names stay distinct
 * ignoring case, and two segments never hold the same filters; a refusal for either names the segment it clashes
 * with, as Plot's errors do. The new list, or why it's refused; the caller writes it.
 */
export function applySegmentChange(
  current: readonly Segment[],
  change: SegmentChange,
  newId: () => string,
): SegmentOutcome {
  const named = (name: string, except?: string) =>
    current.find((x) => x.id !== except && x.name.toLowerCase() === name.toLowerCase());
  const holding = (filters: Filters, except?: string) =>
    current.find((x) => x.id !== except && sameFilters(x.filters, filters));
  if (change.intent !== "create" && !current.some((x) => x.id === change.id))
    return { ok: false, reason: "missing" };
  switch (change.intent) {
    case "create": {
      if (current.length >= SEGMENT_LIMITS.segments) return { ok: false, reason: "full" };
      const name = checkName(change.name);
      if (!name.ok) return name;
      const clash = named(name.name);
      if (clash) return { ok: false, reason: "taken", name: clash.name };
      const filters = checkFilters(change.filters);
      if (!filters.ok) return filters;
      const twin = holding(filters.filters);
      if (twin) return { ok: false, reason: "same_filters", name: twin.name };
      const id = newId();
      return {
        ok: true,
        id,
        segments: [...current, { id, name: name.name, filters: filters.filters }],
      };
    }
    case "rename": {
      const name = checkName(change.name);
      if (!name.ok) return name;
      const clash = named(name.name, change.id);
      if (clash) return { ok: false, reason: "taken", name: clash.name };
      const segments = current.map((x) => (x.id === change.id ? { ...x, name: name.name } : x));
      return { ok: true, id: change.id, segments };
    }
    case "update": {
      const filters = checkFilters(change.filters);
      if (!filters.ok) return filters;
      const twin = holding(filters.filters, change.id);
      if (twin) return { ok: false, reason: "same_filters", name: twin.name };
      const segments = current.map((x) =>
        x.id === change.id ? { ...x, filters: filters.filters } : x,
      );
      return { ok: true, id: change.id, segments };
    }
    case "delete":
      return { ok: true, id: change.id, segments: current.filter((x) => x.id !== change.id) };
  }
}

/** How many filter values a segment has: the one figure its events carry, never its name. */
export const filterCount = (filters: Filters) =>
  Object.values(filters).reduce((t, v) => t + (v?.length ?? 0), 0);
