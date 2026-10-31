import type { DeepReadonly, SaleLine } from '../bookshop/types';

export const DIMENSIONS = ['quarter', 'month', 'weekday', 'genre', 'format', 'publisher', 'series', 'title', 'author', 'discounted', 'discount_rate'] as const;
export type Dimension = typeof DIMENSIONS[number];
export const MEASURES = ['revenue', 'units', 'orders', 'avg_discount', 'avg_rating', 'checkouts', 'avg_order_value', 'orders_per_day'] as const;
export type Measure = typeof MEASURES[number];

export interface Query {
  measure: Measure;
  /** Zero, one, or two distinct dimensions; enforced at runtime. */
  by: readonly Dimension[];
  /** Exact values, OR within a dimension and AND across dimensions. */
  filter?: Partial<Record<Dimension, readonly string[]>>;
  sort?: { column: Dimension | Measure; direction: 'asc' | 'desc' };
  /** 1–200; defaults to 200. Total is computed before this limit. */
  limit?: number;
}

export type Period = `${number}-Q${1 | 2 | 3 | 4}`;
/** Trusted server state, NEVER accepted from a query request or an agent tool. */
export interface QueryView {
  /** Explicit allowed calendar quarters, e.g. 2193-Q1. Empty means no sales. */
  periods: readonly Period[];
  /** Explicit permission for the undated ratings/yearless checkout snapshot. */
  includeUndated: boolean;
  /** Future save integration: already-produced facts, still gated by periods. */
  simulatedSales?: readonly DeepReadonly<SaleLine>[];
}

export interface QueryColumn {
  key: Dimension | Measure;
  label: string;
  type: 'string' | 'number';
  nullable: boolean;
}
export type QueryRow = Partial<Record<Dimension, string | null>> & Partial<Record<Measure, number | null>>;
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
}

export type QueryErrorCode = 'INVALID_QUERY' | 'INCOMPATIBLE_DIMENSION' | 'UNAVAILABLE_FACTS' | 'INVALID_VIEW' | 'UNAUTHORIZED' | 'SESSION_ENDED' | 'METHOD_NOT_ALLOWED' | 'UNSUPPORTED_MEDIA_TYPE' | 'PAYLOAD_TOO_LARGE' | 'RATE_LIMITED' | 'INTERNAL_ERROR' | 'RESULT_TOO_LARGE';
export interface QueryErrorResponse { error: { code: QueryErrorCode; message: string } }
export type QueryTrack = (event: string, props?: Record<string, string | number | boolean>) => void;

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

const BOOK_DIMENSIONS = ['genre', 'series', 'title', 'author'] as const;
/** Applies equally to grouping and filtering; no fanout through editions/sales. */
export const MEASURE_DIMENSIONS: Readonly<Record<Measure, readonly Dimension[]>> = {
  revenue: DIMENSIONS, units: DIMENSIONS, orders: DIMENSIONS, avg_discount: DIMENSIONS,
  avg_order_value: DIMENSIONS, orders_per_day: DIMENSIONS,
  avg_rating: BOOK_DIMENSIONS,
  checkouts: [...BOOK_DIMENSIONS, 'month'],
};
