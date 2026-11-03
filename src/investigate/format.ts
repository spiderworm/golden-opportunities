import { formatStationMonth } from "~/platform/dates";
import type { Dimension, Measure } from "~/query/types";
import {
  isAvailable,
  isRelativeQuarter,
  resolveQuarter,
  type RelativeQuarter,
} from "~/query/relative";

export const MEASURE_LABELS: Record<Measure, string> = {
  revenue: "Revenue",
  units: "Units sold",
  orders: "Orders",
  avg_discount: "Average discount",
  avg_rating: "Average rating",
  checkouts: "Checkouts",
  avg_order_value: "Average order value",
  orders_per_day: "Orders per day",
  ratings: "Ratings",
};

/** Measures named in a title: "Revenue", "Revenue and units sold", "Revenue, units sold and orders". */
export function measuresLabel(measures: readonly Measure[]): string {
  const names = measures.map((m, i) =>
    i === 0 ? MEASURE_LABELS[m] : MEASURE_LABELS[m].toLowerCase(),
  );
  return names.length < 2 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export const DIMENSION_LABELS: Record<Dimension, string> = {
  quarter: "Quarter",
  month: "Month",
  weekday: "Weekday",
  genre: "Genre",
  format: "Format",
  publisher: "Publisher",
  series: "Series",
  title: "Title",
  author: "Author",
  discounted: "Discounted",
  discount_rate: "Discount",
  stars: "Stars",
  awarded: "Award winner",
  award: "Award",
  volume: "Series volume",
  in_series: "In a series",
  edition: "Edition",
  list_price: "List price",
  price_band: "Price band",
};

/** How a dimension value reads on screen: "2193-Q4" as "Q4 2193", "2193-03" as "Mar 2193". */
export function formatDimensionValue(
  dimension: Dimension,
  value: string | null | undefined,
): string {
  if (value === null || value === undefined) {
    // A standalone book has no volume number; nor does the unknown book behind some ratings (Plot, #186).
    if (dimension === "volume") return "Not numbered";
    return dimension === "title"
      ? "Unknown title"
      : dimension === "edition"
        ? "Unknown edition"
        : "Unknown";
  }
  if (dimension === "quarter") {
    if (isRelativeQuarter(value)) return RELATIVE_NAMES[value];
    const match = /^(\d+)-(Q[1-4])$/.exec(value);
    return match ? `${match[2]} ${match[1]}` : value;
  }
  if (dimension === "month") {
    // The game's date style, year first: "2193 Mar" (src/platform/dates.ts).
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? formatStationMonth(value) : value;
  }
  if (dimension === "discounted") return value === "yes" ? "Any discount" : "Full price";
  if (dimension === "discount_rate") return parseFloat(value) === 0 ? "Full price" : `${value} off`;
  if (dimension === "stars") return value === "1" ? "1 star" : `${value} stars`;
  if (dimension === "awarded")
    return value === "yes" ? "Award winner" : value === "no" ? "No award" : value;
  if (dimension === "volume") return `Volume ${value}`;
  // "under $10" reads as a label: "Under $10".
  if (dimension === "price_band") return value.charAt(0).toUpperCase() + value.slice(1);
  if (dimension === "in_series")
    return value === "yes" ? "In a series" : value === "no" ? "Not in a series" : value;
  return value;
}

/**
 * A span of visible quarters in words: "2193" for a whole year, "Q1 2193" for
 * one quarter, "2193 and Q1 2194" once the played quarter joins the ledgers.
 */
export function periodLabel(quarters: readonly string[]): string {
  const byYear = new Map<string, string[]>();
  for (const q of [...quarters].sort()) {
    const [year, quarter] = q.split("-") as [string, string];
    byYear.set(year, [...(byYear.get(year) ?? []), quarter]);
  }
  const parts = [...byYear].flatMap(([year, qs]) =>
    qs.length === 4 ? [year] : qs.map((q) => `${q} ${year}`),
  );
  return parts.length < 2
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * The page title from the loader's data: "Ledgers: 2193", then "Ledgers: 2193
 * and Q1 2194" once the played quarter is in them. Without data (an error
 * boundary), the screen's name.
 */
export function ledgersTitle(data: unknown): string {
  const quarters = (data as { options?: { quarter?: unknown } } | null | undefined)?.options
    ?.quarter;
  return Array.isArray(quarters) && quarters.length
    ? `Ledgers: ${periodLabel(quarters as string[])}`
    : "Investigate";
}

/** Measures whose values add up, so a part can be a share of the whole. */
export const ADDITIVE: readonly Measure[] = ["revenue", "units", "orders"];
/** Measures whose axis never needs a tick between whole numbers: counts, and dollars of revenue. */
export const WHOLE_TICKS: readonly Measure[] = [
  "revenue",
  "units",
  "orders",
  "checkouts",
  "ratings",
];

/** Short form for axes and tight spaces: "Q4" rather than "Q4 2193". */
export function formatDimensionShort(
  dimension: Dimension,
  value: string | null | undefined,
  among: readonly string[] = [],
): string {
  if (dimension === "quarter" && value) return value.replace(/^\d+-/, "");
  // "Mar", or "2193 Mar" when the months beside it span more than one year.
  if (dimension === "month" && value) {
    const full = formatDimensionValue(dimension, value);
    return new Set(among.map((m) => m.slice(0, 4))).size > 1 ? full : full.replace(/^\d{4} /, "");
  }
  if (dimension === "weekday" && value) return value.slice(0, 3);
  return formatDimensionValue(dimension, value);
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const cents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMeasure(
  measure: Measure,
  value: number | null | undefined,
  options: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined) return "No data";
  switch (measure) {
    case "revenue":
      return options.compact && Math.abs(value) >= 1000
        ? `$${compact.format(value)}`
        : money.format(value);
    case "avg_order_value":
      return cents.format(value);
    case "orders_per_day":
      return options.compact ? compact.format(value) : value.toFixed(1);
    case "avg_discount":
      return `${(value * 100).toFixed(1)}%`;
    case "avg_rating":
      return value.toFixed(2);
    default:
      return options.compact ? compact.format(value) : whole.format(value);
  }
}

export interface Change {
  /** Display text, e.g. "-41.1%" or "+2.3 pts". */
  text: string;
  direction: "up" | "down" | "flat";
  /** Whether the direction is good news for the store; null when it's neither. */
  good: boolean | null;
}

/**
 * Quarter-over-quarter change. Averages of fractions change in percentage
 * points; totals change by percent.
 */
export function change(
  measure: Measure,
  current: number | null,
  previous: number | null,
): Change | null {
  if (current === null || previous === null) return null;
  const points = measure === "avg_discount";
  if (!points && previous === 0) return null;
  const delta = points ? (current - previous) * 100 : ((current - previous) / previous) * 100;
  const rounded = Math.round(delta * 10) / 10;
  const direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  const text = `${sign}${Math.abs(rounded).toFixed(1)}${points ? " pts" : "%"}`;
  const upIsGood = ["revenue", "units", "orders", "avg_order_value", "orders_per_day"].includes(
    measure,
  );
  return { text, direction, good: direction === "flat" || !upIsGood ? null : direction === "up" };
}

/** The relative quarters' names (Plot's copy, section 9): none says "this quarter", which is being planned. */
export const RELATIVE_NAMES: Record<RelativeQuarter, string> = {
  latest: "Latest quarter",
  "latest-1": "Quarter before latest",
  "latest-4": "Same quarter, a year earlier",
};
/** Their shared tooltip. */
export const RELATIVE_HINT =
  "Moves on as you play: always counted from the newest quarter with sales";

/** A relative quarter with the quarter it is now: `Latest quarter: Q1 2194`; its name alone with nothing visible. */
export function relativeLabel(token: RelativeQuarter, periods: readonly string[]): string {
  const quarter = resolveQuarter(token, periods);
  return quarter && isAvailable(quarter, periods)
    ? `${RELATIVE_NAMES[token]}: ${formatDimensionValue("quarter", quarter)}`
    : RELATIVE_NAMES[token];
}

/** Why a relative quarter can't be shown now, or null when it can (Plot's reasons). */
export function relativeReason(token: RelativeQuarter, periods: readonly string[]): string | null {
  const quarter = resolveQuarter(token, periods);
  if (isAvailable(quarter, periods)) return null;
  if (token === "latest-4") return "The ledgers start in 2193: there's no year before it";
  const first = [...periods].sort()[0];
  return first
    ? `${formatDimensionValue("quarter", first)} is the first quarter in the ledgers: there's no quarter before it`
    : "There are no quarters in the ledgers yet";
}
