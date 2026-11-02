// Alma's event types and their limits: docs/design/endless.md, section 2 (tier 1). The model chooses a type and
// its params from these; the server checks every choice against them and never clamps (section 9). The limits
// are marked "tune" in the design, so they live here as data for Plot and Sim to adjust.

import { MEASURE_IDS, type MeasureId } from "~/simulation/types";

export { MEASURE_IDS, type MeasureId };

export const GENRES = ["Fiction", "Mystery", "Romance", "SciFi/Fantasy", "Young Adult", "Childrens", "Nonfiction", "Memoir"] as const;
export const FORMATS = ["Hardcover", "Trade paperback", "Paperback", "Mass market paperback", "Graphic", "Board book"] as const;
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** One param: a value from a fixed list, or a whole number within limits, shown in its unit. */
export type ParamSpec =
  | { kind: "enum"; values: readonly string[] }
  | { kind: "int"; min: number; max: number; unit: "percent" | "dollars" | "month" };

export interface EventType {
  id: string;
  params: Record<string, ParamSpec>;
  /** Allowed while two strikes count against the player ("no piling on"). */
  mild: boolean;
  /** The measures it works against, so it may not be chosen while that measure is stretched (section 2's table). */
  against: readonly MeasureId[];
  /** At most once in this many quarters (a quiet quarter: once in any three). */
  oncePer?: number;
}

const month: ParamSpec = { kind: "int", min: 1, max: 3, unit: "month" };

export const EVENT_TYPES: readonly EventType[] = [
  { id: "genre_surge", params: { genre: { kind: "enum", values: GENRES }, month, percent: { kind: "int", min: 10, max: 30, unit: "percent" } }, mild: true, against: [] },
  { id: "genre_slump", params: { genre: { kind: "enum", values: GENRES }, month, percent: { kind: "int", min: 10, max: 25, unit: "percent" } }, mild: false, against: ["profit", "readers", "culture"] },
  { id: "quiet_days", params: { weekday: { kind: "enum", values: WEEKDAYS }, percent: { kind: "int", min: 10, max: 25, unit: "percent" } }, mild: false, against: ["profit", "readers", "culture"] },
  { id: "author_fares", params: { cost: { kind: "int", min: 100, max: 400, unit: "dollars" } }, mild: true, against: ["profit"] },
  { id: "format_costs", params: { format: { kind: "enum", values: FORMATS }, percent: { kind: "int", min: 65, max: 70, unit: "percent" } }, mild: false, against: ["profit"] },
  { id: "quiet_quarter", params: {}, mild: true, against: [], oncePer: 3 },
];

export const eventType = (id: unknown): EventType | undefined => EVENT_TYPES.find((t) => t.id === id);

/** The stretch beside every event: one measure's goal, raised by this much instead of 5%. */
export const STRETCH_PERCENT = { min: 10, max: 20 } as const;
