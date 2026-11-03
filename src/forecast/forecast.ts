// The player's own forecasts (David, 3 Nov 2026: "allow for players to write out, plan out their own expectations of
// their decisions (optionally)", then "Forecast revenue and total units with hints"): a quarter's revenue and units,
// each an expected figure and an 80% range, and an optional note, filed with the plan. Kept in the save, so Play
// again starts with none. These checks run in the browser, on the plan form at the door and in the save's own
// validate(), so a hand-edited save can't grow past them. Client-safe: no server imports. Relative .ts imports: the
// save store loads this in plain Node, without the ~ alias.
import { isQuarterName, type QuarterId } from "../simulation/quarters.ts";
import { plain } from "../reports/player.ts";

export const FORECAST_MEASURES = ["revenue", "units"] as const;
export type ForecastMeasure = (typeof FORECAST_MEASURES)[number];

/** An expected figure and the 80% range around it: 0 ≤ low ≤ point ≤ high. Revenue in dollars, units whole. */
export interface ForecastEntry {
  point: number;
  low: number;
  high: number;
}

/** A played quarter's figure, shown beside a forecast's input: null when it isn't in the ledgers. */
export interface ForecastHint {
  quarter: QuarterId;
  value: number | null;
}

/** The hints for the quarter being planned: the quarter before and the same quarter a year earlier, as played. */
export interface ForecastHints {
  quarter: QuarterId;
  revenue: { previous: ForecastHint; yearEarlier: ForecastHint };
  units: { previous: ForecastHint; yearEarlier: ForecastHint };
}

/** A quarter's forecast, filed with its plan: at least one measure. */
export interface Forecast {
  quarter: QuarterId;
  revenue?: ForecastEntry;
  units?: ForecastEntry;
  /** The player's own words: kept in the save, never in analytics. */
  note?: string;
}

/**
 * Far past anything the shop sells in a quarter (about $160,000 and 9,000 units in 2193), so a typo of a few extra
 * digits is caught, and nowhere near a forecast a player could mean.
 */
export const FORECAST_LIMITS = {
  revenue: 10_000_000,
  units: 1_000_000,
  note: 500,
} as const;

/** Why a forecast was refused, by the field it's in: the browser says it in Plot's words. */
export type ForecastReason =
  | "number"
  | "negative"
  | "too_large"
  | "low_above_point"
  | "point_above_high"
  | "partial"
  | "too_long"
  | "invalid";
export type ForecastField = ForecastMeasure | "note";
export interface ForecastProblem {
  field: ForecastField;
  reason: ForecastReason;
}

/** The plan form's fields: `point,low,high` for each measure, and the note; empty or absent is not forecast. */
export const FORECAST_FIELDS = {
  revenue: "forecastRevenue",
  units: "forecastUnits",
  note: "forecastNote",
} as const;

// Revenue to the cent at most, units whole; a sign is read only to say "can't be below 0".
const AMOUNT = { revenue: /^\d{1,9}(\.\d{1,2})?$/, units: /^\d{1,9}$/ } as const;

/**
 * One figure as typed: a number for the measure, or why not. Commas a player types as thousands separators are
 * allowed, as are a leading $ for revenue and surrounding spaces.
 */
export function checkAmount(
  measure: ForecastMeasure,
  typed: string,
): { ok: true; value: number } | { ok: false; reason: ForecastReason } {
  let text = typed.trim().replace(/,/g, "");
  if (measure === "revenue") text = text.replace(/^\$/, "");
  if (/^-\s*\$?\d/.test(text)) return { ok: false, reason: "negative" };
  if (!AMOUNT[measure].test(text)) return { ok: false, reason: "number" };
  const value = Number(text);
  if (value > FORECAST_LIMITS[measure]) return { ok: false, reason: "too_large" };
  return { ok: true, value };
}

/** A measure's three figures in order: in range of each other, or why not. */
export function checkEntry(
  measure: ForecastMeasure,
  entry: unknown,
): { ok: true; entry: ForecastEntry } | { ok: false; reason: ForecastReason } {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry))
    return { ok: false, reason: "number" };
  const { point, low, high, ...rest } = entry as Record<string, unknown>;
  if (Object.keys(rest).length) return { ok: false, reason: "number" };
  for (const v of [point, low, high]) {
    if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, reason: "number" };
    if (v < 0) return { ok: false, reason: "negative" };
    if (v > FORECAST_LIMITS[measure]) return { ok: false, reason: "too_large" };
    // Cents compared as written, not multiplied: 0.29 * 100 is 28.999999999999996 (Sim and Audit, #384).
    if (measure === "units" ? !Number.isInteger(v) : Number(v.toFixed(2)) !== v)
      return { ok: false, reason: "number" };
  }
  const e = { point, low, high } as ForecastEntry;
  if (e.low > e.point) return { ok: false, reason: "low_above_point" };
  if (e.point > e.high) return { ok: false, reason: "point_above_high" };
  return { ok: true, entry: e };
}

/**
 * A measure's form field (`point,low,high`, as typed): null when all three are empty (not forecast), the entry, or
 * why not. The browser checks each field with this as the player types; the door checks the same.
 */
export function checkForecastField(
  measure: ForecastMeasure,
  value: string | null,
): { ok: true; entry: ForecastEntry | null } | { ok: false; reason: ForecastReason } {
  if (value === null) return { ok: true, entry: null };
  const parts = value.split(",");
  // A figure typed with thousands separators is sent with them stripped; three parts exactly.
  if (parts.length !== 3) return { ok: false, reason: "number" };
  const filled = parts.filter((p) => p.trim() !== "").length;
  if (filled === 0) return { ok: true, entry: null };
  if (filled < 3) return { ok: false, reason: "partial" };
  const figures: number[] = [];
  for (const part of parts) {
    const amount = checkAmount(measure, part);
    if (!amount.ok) return amount;
    figures.push(amount.value);
  }
  const [point, low, high] = figures as [number, number, number];
  return checkEntry(measure, { point, low, high });
}

/** The note as typed, trimmed: null when empty, at most 500 characters of plain text, or why not. */
export function checkNote(
  value: unknown,
): { ok: true; note: string | null } | { ok: false; reason: ForecastReason } {
  if (value === null || value === undefined) return { ok: true, note: null };
  if (typeof value !== "string") return { ok: false, reason: "invalid" };
  const note = value.trim();
  if (!note) return { ok: true, note: null };
  if ([...note].length > FORECAST_LIMITS.note) return { ok: false, reason: "too_long" };
  if (!plain(note, true)) return { ok: false, reason: "invalid" };
  return { ok: true, note };
}

/**
 * The forecast in a plan form's fields, for the quarter being planned: null when nothing is forecast (the section
 * left closed, or emptied), the forecast, or the first field that's wrong. A note with no figures is no forecast.
 */
export function forecastFromForm(
  quarter: QuarterId,
  get: (name: string) => string | null,
): { ok: true; forecast: Forecast | null } | { ok: false; problem: ForecastProblem } {
  const forecast: Forecast = { quarter };
  for (const measure of FORECAST_MEASURES) {
    const checked = checkForecastField(measure, get(FORECAST_FIELDS[measure]));
    if (!checked.ok) return { ok: false, problem: { field: measure, reason: checked.reason } };
    if (checked.entry) forecast[measure] = checked.entry;
  }
  const note = checkNote(get(FORECAST_FIELDS.note));
  if (!note.ok) return { ok: false, problem: { field: "note", reason: note.reason } };
  if (!forecast.revenue && !forecast.units) return { ok: true, forecast: null };
  if (note.note) forecast.note = note.note;
  return { ok: true, forecast };
}

/** The measures a forecast has, in order: forecast_made's `measures`. */
export const forecastMeasures = (forecast: Forecast): ForecastMeasure[] =>
  FORECAST_MEASURES.filter((m) => forecast[m] !== undefined);

/**
 * The save's forecasts, as written: each for a played quarter, in play order, at most one a quarter, each with at
 * least one valid measure and nothing else.
 */
export function validForecasts(value: unknown, played: readonly QuarterId[]): value is Forecast[] {
  if (!Array.isArray(value) || value.length > played.length) return false;
  let last = -1;
  return value.every((f) => {
    if (typeof f !== "object" || f === null || Array.isArray(f)) return false;
    if (Object.keys(f).some((k) => !["quarter", "revenue", "units", "note"].includes(k)))
      return false;
    const { quarter, note } = f as Record<string, unknown>;
    if (!isQuarterName(quarter)) return false;
    const at = played.indexOf(quarter);
    if (at <= last) return false;
    last = at;
    let measures = 0;
    for (const measure of FORECAST_MEASURES) {
      const entry = (f as Record<string, unknown>)[measure];
      if (entry === undefined) continue;
      if (!checkEntry(measure, entry).ok) return false;
      measures++;
    }
    if (!measures) return false;
    if (note === undefined) return true;
    const checked = checkNote(note);
    return checked.ok && checked.note === note;
  });
}

/** One measure's forecast against what happened. */
export interface MeasureResult {
  forecast: ForecastEntry;
  actual: number;
  /** Which side of the 80% range the real figure fell, or inside it (ends included). */
  where: "below" | "inside" | "above";
  /** The expected figure less the real one: above zero means the player forecast high (Plot's copy). */
  error: number;
  /** `error` as a share of the real figure (Sim, Plot and Chart, #384); null when the real figure is 0. */
  errorPct: number | null;
}

/** A played quarter's forecast against what happened: the measures it forecast, and its note. */
export interface ForecastResult {
  quarter: QuarterId;
  revenue?: MeasureResult;
  units?: MeasureResult;
  note?: string;
}

/** A measure's forecast against its real figure. */
export function scoreEntry(forecast: ForecastEntry, actual: number): MeasureResult {
  const error = forecast.point - actual;
  return {
    forecast,
    actual,
    where: actual < forecast.low ? "below" : actual > forecast.high ? "above" : "inside",
    error,
    errorPct: actual === 0 ? null : error / actual,
  };
}

/** How well calibrated one measure's forecasts have been, over the played quarters that forecast it. */
export interface MeasureCalibration {
  measure: ForecastMeasure;
  /** Quarters with this measure forecast and played. */
  n: number;
  /** Of those, how many landed inside the 80% range: "2 of 3 inside your range". */
  hits: number;
  /** hits / n; null with none. Well calibrated is about 0.8. */
  hitRate: number | null;
  /** The mean errorPct, leaving out quarters whose real figure was 0: above zero means forecasts ran high. */
  bias: number | null;
  /** The median of the range's half-width over the expected figure, leaving out an expected 0: Plot's "±7.5%". */
  sharpness: number | null;
  /** Enough quarters to judge: 3 or more (Plot: "Too few forecasts to judge yet"). */
  judged: boolean;
}

/** The running calibration Reports shows: per measure, and every scored forecast for its chart. */
export interface Calibration {
  /** Played quarters with a forecast, and played quarters: "3 of 5 quarters forecast". */
  forecast: number;
  played: number;
  revenue: MeasureCalibration;
  units: MeasureCalibration;
  /** Oldest first, without notes: the chart of range and expected against actual. */
  history: ForecastResult[];
}

/** Forecasts needed before a measure's calibration is judged. */
export const CALIBRATION_MINIMUM = 3;

const mean = (values: number[]) =>
  values.length ? values.reduce((t, v) => t + v, 0) / values.length : null;
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** One measure's calibration over scored forecasts. */
export function calibrateMeasure(
  measure: ForecastMeasure,
  results: readonly ForecastResult[],
): MeasureCalibration {
  const scored = results.flatMap((r) => (r[measure] ? [r[measure]] : []));
  const hits = scored.filter((s) => s.where === "inside").length;
  return {
    measure,
    n: scored.length,
    hits,
    hitRate: scored.length ? hits / scored.length : null,
    bias: mean(scored.flatMap((s) => (s.errorPct === null ? [] : [s.errorPct]))),
    sharpness: median(
      scored.flatMap((s) =>
        s.forecast.point > 0 ? [(s.forecast.high - s.forecast.low) / 2 / s.forecast.point] : [],
      ),
    ),
    judged: scored.length >= CALIBRATION_MINIMUM,
  };
}

/** The calibration over every scored forecast, out of the quarters played. */
export function calibrate(results: readonly ForecastResult[], played: number): Calibration {
  return {
    forecast: results.length,
    played,
    revenue: calibrateMeasure("revenue", results),
    units: calibrateMeasure("units", results),
    history: results.map(({ note: _, ...figures }) => figures),
  };
}
