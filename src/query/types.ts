import type { DeepReadonly, SaleLine } from "../bookshop/types";
import type { SaleCells } from "./sale-cells";
import type { Evidence, EvidenceUnit } from "./evidence";

export const DIMENSIONS = [
  "quarter",
  "month",
  "weekday",
  "genre",
  "format",
  "publisher",
  "series",
  "title",
  "author",
  "discounted",
  "discount_rate",
  "stars",
  "awarded",
  "award",
  "volume",
  "in_series",
  "edition",
  "list_price",
  "price_band",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const MEASURES = [
  "revenue",
  "units",
  "orders",
  "avg_discount",
  "avg_rating",
  "checkouts",
  "avg_order_value",
  "orders_per_day",
  "ratings",
] as const;
export type Measure = (typeof MEASURES)[number];

/**
 * What Dewey's tools may use. A new dimension or measure joins only once Probe has reviewed it against Dewey's
 * figures gate (Goldy, 2 Nov); until then it's Investigate-only, and the query endpoint refuses it from Dewey's
 * token as well as leaving it out of the tools.
 */
export const AGENT_DIMENSIONS = [
  "quarter",
  "month",
  "weekday",
  "genre",
  "format",
  "publisher",
  "series",
  "title",
  "author",
  "discounted",
  "discount_rate",
  "edition",
  "list_price",
  "price_band",
] as const satisfies readonly Dimension[];
export const AGENT_MEASURES = [
  "revenue",
  "units",
  "orders",
  "avg_discount",
  "avg_rating",
  "checkouts",
  "avg_order_value",
  "orders_per_day",
] as const satisfies readonly Measure[];
export type AgentDimension = (typeof AGENT_DIMENSIONS)[number];
export type AgentMeasure = (typeof AGENT_MEASURES)[number];

export interface Query {
  measure: Measure;
  /** Zero, one, or two distinct dimensions; enforced at runtime. */
  by: readonly Dimension[];
  /** Exact values, OR within a dimension and AND across dimensions. */
  filter?: Partial<Record<Dimension, readonly string[]>>;
  sort?: { column: Dimension | Measure; direction: "asc" | "desc" };
  /** 1–200; defaults to 200. Total is computed before this limit. */
  limit?: number;
  /** "last_year": each row's and the total's figure a year earlier too, as `lastYear` (last-year.ts). */
  vs?: "last_year";
}

/**
 * A figure a year earlier: null when there's no last year to compare (it's before the data, or outside the
 * periods the player can see); `value` null when last year had no value (an average over no sales).
 */
export type LastYear = { value: number | null } | null;

export type Period = `${number}-Q${1 | 2 | 3 | 4}`;
/** Trusted server state, NEVER accepted from a query request or an agent tool. */
export interface QueryView {
  /** Explicit allowed calendar quarters, e.g. 2193-Q1. Empty means no sales. */
  periods: readonly Period[];
  /** Explicit permission for the undated ratings/yearless checkout snapshot. */
  includeUndated: boolean;
  /** Future save integration: already-produced facts, still gated by periods. */
  simulatedSales?: readonly DeepReadonly<SaleLine>[];
  /** The same facts rolled up (sale-cells.ts): a view carries its simulated sales as lines or as cells, not both. */
  simulatedCells?: SaleCells;
  /**
   * The save's data version (data-version.server.ts), naming exactly these simulated lines: set by the server with
   * them, so results over them can be cached. Without it, a view with simulated lines is never cached.
   */
  version?: string;
}

export interface QueryColumn {
  key: Dimension | Measure;
  label: string;
  type: "string" | "number";
  nullable: boolean;
}
export type QueryRow = Partial<Record<Dimension, string | null>> &
  Partial<Record<Measure, number | null>>;
export interface QueryResult {
  /** True if the row limit omitted groups. Optional for older consumers. */
  truncated?: boolean;
  /** Grouping columns in query order, then the measure column. */
  columns: QueryColumn[];
  rows: QueryRow[];
  /** Aggregate of all matching visible facts, not the sum/mean of result rows. */
  total: number | null;
  /** Player-visible provenance, including fact grain, scope, and truncation. */
  source: string;
  /**
   * With `vs: "last_year"`: each row's figure a year earlier, in the rows' order, and the total's, with their
   * evidence (null where the figure is).
   */
  lastYear?: {
    rows: LastYear[];
    total: LastYear;
    evidence: { rows: (Evidence | null)[]; total: Evidence | null };
  };
  /**
   * How many items each row's figure and the total's are over, and their standard errors, in the rows' order
   * (evidence.ts). `unit` names what an average is over, null for other measures. Dewey's tool server turns it into
   * fields the figures gate renders by ref (withEvidence), never passing the standard errors to the model.
   */
  evidence?: { unit: EvidenceUnit | null; rows: Evidence[]; total: Evidence };
}

export type QueryErrorCode =
  | "INVALID_QUERY"
  | "INCOMPATIBLE_DIMENSION"
  | "UNAVAILABLE_FACTS"
  | "INVALID_VIEW"
  | "UNAUTHORIZED"
  | "SESSION_ENDED"
  | "METHOD_NOT_ALLOWED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "RESULT_TOO_LARGE"
  | "SAVE_NOT_REPLAYABLE";
export interface QueryErrorResponse {
  error: { code: QueryErrorCode; message: string };
}
export type QueryTrack = (event: string, props?: Record<string, string | number | boolean>) => void;

/**
 * A request header for views that are context, never discovery evidence: `none` answers the query without recording
 * what it showed. A pinned heatmap sends it (Plot, #266: #63's rule is about the heatmap as a kind of view, wherever
 * it's shown). It can only withhold evidence, so a forged one costs only its sender.
 */
export const EVIDENCE_HEADER = "X-Orbital-Evidence";

export const QUERY_LIMITS = {
  dimensions: 2,
  rows: 200,
  filterValues: 50,
  filterValueLength: 200,
  requestBytes: 16_384,
  responseBytes: 131_072,
  labelLength: 200,
  sourceLength: 4096,
  errorMessageLength: 300,
} as const;

const BOOK_DIMENSIONS = [
  "genre",
  "series",
  "title",
  "author",
  "awarded",
  "award",
  "volume",
  "in_series",
] as const;
/** List price bands, in order (#169). */
export const PRICE_BANDS = ["under $10", "$10 to $19.99", "$20 to $29.99", "$30 and up"] as const;
/**
 * Dimensions that can filter but never group or sort: a book can hold several awards (The Mallemaroking has a
 * Hugo and a Nebula), so grouping by award would count its facts once per award.
 */
export const FILTER_ONLY_DIMENSIONS = ["award"] as const satisfies readonly Dimension[];
/** A sale line's dimensions: everything but the ratings' own. */
const SALE_DIMENSIONS = DIMENSIONS.filter((d) => d !== "stars");
/** Applies equally to grouping and filtering; no fanout through editions/sales. */
export const MEASURE_DIMENSIONS: Readonly<Record<Measure, readonly Dimension[]>> = {
  revenue: SALE_DIMENSIONS,
  units: SALE_DIMENSIONS,
  orders: SALE_DIMENSIONS,
  avg_discount: SALE_DIMENSIONS,
  avg_order_value: SALE_DIMENSIONS,
  orders_per_day: SALE_DIMENSIONS,
  avg_rating: BOOK_DIMENSIONS,
  // Stars only for the count: an average rating by stars would just be the stars.
  ratings: [...BOOK_DIMENSIONS, "stars"],
  checkouts: [...BOOK_DIMENSIONS, "month"],
};
const isAgentDimension = (d: Dimension): d is AgentDimension =>
  (AGENT_DIMENSIONS as readonly Dimension[]).includes(d);
/** MEASURE_DIMENSIONS as Dewey's tools see it. */
export const AGENT_MEASURE_DIMENSIONS = Object.fromEntries(
  AGENT_MEASURES.map((m) => [m, MEASURE_DIMENSIONS[m].filter(isAgentDimension)]),
) as unknown as Readonly<Record<AgentMeasure, readonly AgentDimension[]>>;
/**
 * The first measure, dimension or option in a valid query that Dewey may not use yet, or null if it may use them
 * all. Last year's figures wait for Sage and the figures gate (Goldy, 3 Nov 2026).
 */
export function investigateOnly(query: Query): Measure | Dimension | "vs" | null {
  if (!(AGENT_MEASURES as readonly Measure[]).includes(query.measure)) return query.measure;
  if (query.vs) return "vs";
  const used = [
    ...query.by,
    ...(Object.keys(query.filter ?? {}) as Dimension[]),
    ...(query.sort ? [query.sort.column] : []),
  ];
  return (
    (used.find((key) => key !== query.measure && !isAgentDimension(key as Dimension)) as
      Dimension | undefined) ?? null
  );
}
