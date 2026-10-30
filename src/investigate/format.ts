import type { Dimension, Measure } from "~/query/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MEASURE_LABELS: Record<Measure, string> = {
  revenue: "Revenue",
  units: "Items sold",
  orders: "Orders",
  avg_discount: "Average discount",
  avg_rating: "Average rating",
  checkouts: "Checkouts",
};

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
};

/** How a dimension value reads on screen: "2193-Q4" as "Q4 2193", "03" as "Mar". */
export function formatDimensionValue(dimension: Dimension, value: string | null | undefined): string {
  if (value === null || value === undefined) return "Unknown";
  if (dimension === "quarter") {
    const match = /^(\d+)-(Q[1-4])$/.exec(value);
    return match ? `${match[2]} ${match[1]}` : value;
  }
  if (dimension === "month") return MONTHS[Number(value) - 1] ?? value;
  if (dimension === "discounted") return value === "yes" ? "Discounted" : "Full price";
  return value;
}

/** Short form for axes and tight spaces: "Q4" rather than "Q4 2193". */
export function formatDimensionShort(dimension: Dimension, value: string | null | undefined): string {
  if (dimension === "quarter" && value) return value.replace(/^\d+-/, "");
  if (dimension === "weekday" && value) return value.slice(0, 3);
  return formatDimensionValue(dimension, value);
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatMeasure(measure: Measure, value: number | null | undefined, options: { compact?: boolean } = {}): string {
  if (value === null || value === undefined) return "No data";
  switch (measure) {
    case "revenue":
      return options.compact ? `$${compact.format(value)}` : money.format(value);
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
export function change(measure: Measure, current: number | null, previous: number | null): Change | null {
  if (current === null || previous === null) return null;
  const points = measure === "avg_discount";
  if (!points && previous === 0) return null;
  const delta = points ? (current - previous) * 100 : ((current - previous) / previous) * 100;
  const rounded = Math.round(delta * 10) / 10;
  const direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  const text = `${sign}${Math.abs(rounded).toFixed(1)}${points ? " pts" : "%"}`;
  const upIsGood = measure === "revenue" || measure === "units" || measure === "orders";
  return { text, direction, good: direction === "flat" || !upIsGood ? null : direction === "up" };
}
