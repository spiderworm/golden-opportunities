// Pinned charts: what a pin holds, and checks for pins read back from storage.
import { DIMENSIONS, MEASURES, QUERY_LIMITS, type Dimension, type Query } from "~/query/types";

export const PIN_KINDS = ["bar", "line", "table"] as const;
export type PinKind = (typeof PIN_KINDS)[number];

/**
 * A chart to pin. Structurally the same as Sage's ChartSpec
 * (src/assistant/tools/definitions.ts), so Dewey's onPin passes straight in.
 */
export interface PinSpec {
  title: string;
  kind: PinKind;
  query: Query;
}

export interface Pin extends PinSpec {
  id: string;
  /** Who pinned it: the player, from a chart, or Dewey, when the player asked. */
  pinnedBy: "player" | "dewey";
}

export const MAX_PINS = 8;
export const TITLE_MAX = 80;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const only = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k));

/** The query's shape, checked as the contract bounds it. The server checks it again. */
export function parseQuery(value: unknown): Query | null {
  if (!isObject(value) || !only(value, ["measure", "by", "filter", "sort", "limit"])) return null;
  const { measure, by, filter, sort, limit } = value;
  if (!MEASURES.includes(measure as never)) return null;
  if (!Array.isArray(by) || by.length > QUERY_LIMITS.dimensions || new Set(by).size !== by.length) return null;
  if (!by.every((d) => DIMENSIONS.includes(d))) return null;
  const query: Query = { measure: measure as Query["measure"], by: by as Dimension[] };

  if (filter !== undefined) {
    if (!isObject(filter)) return null;
    const checked: Partial<Record<Dimension, string[]>> = {};
    for (const [dimension, values] of Object.entries(filter)) {
      if (!DIMENSIONS.includes(dimension as Dimension)) return null;
      if (!Array.isArray(values) || values.length < 1 || values.length > QUERY_LIMITS.filterValues) return null;
      if (!values.every((v) => isString(v, QUERY_LIMITS.filterValueLength))) return null;
      checked[dimension as Dimension] = values as string[];
    }
    query.filter = checked;
  }
  if (sort !== undefined) {
    if (!isObject(sort) || !only(sort, ["column", "direction"])) return null;
    if (![...DIMENSIONS, ...MEASURES].includes(sort.column as never) || (sort.direction !== "asc" && sort.direction !== "desc")) return null;
    query.sort = sort as Query["sort"];
  }
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > QUERY_LIMITS.rows) return null;
    query.limit = limit as number;
  }
  return query;
}

export function parsePinSpec(value: unknown): PinSpec | null {
  if (!isObject(value) || !only(value, ["title", "kind", "query"])) return null;
  const query = parseQuery(value.query);
  if (!query || !isString(value.title, TITLE_MAX) || !PIN_KINDS.includes(value.kind as PinKind)) return null;
  return { title: value.title, kind: value.kind as PinKind, query };
}

/** Pins as stored; anything malformed is dropped rather than trusted. */
export function parsePins(json: string | null): Pin[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const pins: Pin[] = [];
  for (const item of raw.slice(0, MAX_PINS)) {
    if (!isObject(item) || !isString(item.id, 64) || (item.pinnedBy !== "player" && item.pinnedBy !== "dewey")) continue;
    const { id, pinnedBy, ...rest } = item;
    const spec = parsePinSpec(rest);
    if (spec) pins.push({ ...spec, id, pinnedBy });
  }
  return pins;
}

/** Two pins are the same chart when their kind and query match, whatever their titles. */
export function pinKey(kind: PinKind, query: Query): string {
  const filter = Object.entries(query.filter ?? {})
    .map(([d, values]) => [d, [...values!].sort()] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([kind, query.measure, query.by, filter, query.sort ?? null, query.limit ?? null]);
}

/** Newest first; a repeat of an existing chart moves it to the front; the oldest drop past MAX_PINS. */
export function addPin(pins: readonly Pin[], spec: PinSpec, pinnedBy: Pin["pinnedBy"], id: string): Pin[] {
  const key = pinKey(spec.kind, spec.query);
  const rest = pins.filter((p) => pinKey(p.kind, p.query) !== key);
  return [{ ...spec, id, pinnedBy }, ...rest].slice(0, MAX_PINS);
}
