// One block for one lookup (David, 3 Nov 2026: "In cases where dewey puts both in chat, they only need to do one").
// When Dewey's answer shows a query_data table and a show_chart chart of the same query, the panel keeps one
// block, the chart, which the player can switch to its table. The server keeps both tool results apart, for the
// figures gate's refs and the regression cases (Sage); only the panel folds them, as they arrive and on restore.

/** A lookup as the panel keeps it: only what folding reads. */
interface Foldable {
  type: string;
  /** A data lookup's query, in chats stored with one. */
  query?: unknown;
  /** A data lookup's pin: the query that ran (the wire's data event carries it here, not as `query`). */
  pin?: object;
  /** A chart lookup's spec. */
  chart?: object;
}

const queryIn = (o: object | undefined): unknown =>
  o && "query" in o ? (o as { query: unknown }).query : undefined;

/** The query a data lookup ran: its own, or its pin's; undefined for a comparison or a lookup that can't be pinned. */
export const dataQuery = (lookup: Foldable): unknown => lookup.query ?? queryIn(lookup.pin);

/** A query as canonical JSON: object keys sorted, so the same query matches however its keys came. */
export function canonicalQuery(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sort(value));
}

/** The query a table or chart lookup shows, as canonical JSON; null for any other lookup. */
function keyOf(lookup: Foldable): string | null {
  const query = lookup.type === "data" ? dataQuery(lookup) : undefined;
  if (query) return canonicalQuery(query);
  const shown = lookup.type === "chart" ? queryIn(lookup.chart) : undefined;
  if (shown) return canonicalQuery(shown);
  return null;
}

/**
 * The lookups with each query shown once: a chart takes the place of an earlier table of the same query, and a
 * later table or a repeat of the same query is left out. Order is kept otherwise.
 */
export function foldLookups<L extends Foldable>(lookups: readonly L[]): L[] {
  const kept: L[] = [];
  for (const lookup of lookups) {
    const key = keyOf(lookup);
    const earlier = key === null ? -1 : kept.findIndex((k) => keyOf(k) === key);
    if (earlier < 0) kept.push(lookup);
    else if (lookup.type === "chart" && kept[earlier]!.type === "data") kept[earlier] = lookup;
  }
  return kept;
}
