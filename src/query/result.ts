import { QueryError } from "./errors";
import { QUERY_LIMITS, queryMeasures } from "./types";
import type { Measure, Query, QueryResult } from "./types";

export function tooLarge(): never {
  throw new QueryError(
    "RESULT_TOO_LARGE",
    "Query output exceeds its bounds; reduce the grouping or row limit.",
  );
}
export function checkLabel(value: string | null | undefined): void {
  if (typeof value === "string" && value.length > QUERY_LIMITS.labelLength) tooLarge();
}
/** Enforce the same limits for direct server consumers and HTTP consumers. */
export function serializeResult(result: QueryResult): string {
  if (result.rows.length > QUERY_LIMITS.rows || result.source.length > QUERY_LIMITS.sourceLength)
    tooLarge();
  for (const column of result.columns) checkLabel(column.label);
  for (const event of result.events?.list ?? []) checkLabel(event.label);
  for (const row of result.rows)
    for (const value of Object.values(row)) {
      if (typeof value === "string") checkLabel(value);
      if (typeof value === "number" && !Number.isFinite(value))
        throw new QueryError("INVALID_VIEW", "Aggregation exceeded the supported numeric range.");
    }
  const lastYear = result.lastYear ? [...result.lastYear.rows, result.lastYear.total] : [];
  if (
    (result.total !== null && !Number.isFinite(result.total)) ||
    Object.values(result.measures ?? {}).some(
      (m) => m.total !== null && !Number.isFinite(m.total),
    ) ||
    lastYear.some((figure) => figure?.value != null && !Number.isFinite(figure.value))
  )
    throw new QueryError("INVALID_VIEW", "Aggregation exceeded the supported numeric range.");
  const body = JSON.stringify(result);
  if (new TextEncoder().encode(body).byteLength > QUERY_LIMITS.responseBytes) tooLarge();
  return body;
}

/**
 * A lookup of several measures as one lookup per measure: its query with only that measure, and its result with only
 * that measure's column, figures, total and evidence (contract.md, "Several measures"). For code that reads one measure
 * at a time, such as discovery's rules (Plot). One measure: as it is.
 *
 * Each measure's figures, total and evidence are what it gives alone, but its rows are the lookup's: sorted by
 * another measure, a split's query drops that sort while its rows keep that order, and with a limit they're the top
 * N by that other measure, not its own (Frank and Audit, #415). Such a split is `truncated` whenever rows were cut,
 * and discovery's rules skip truncated results (Plot).
 */
export function perMeasure(
  query: Query,
  result: QueryResult,
): { query: Query; result: QueryResult }[] {
  if (!query.also) return [{ query, result }];
  const { also: _also, sort: _sort, ...base } = query;
  return queryMeasures(query).map((measure) => {
    const figures = result.measures?.[measure];
    const others = queryMeasures(query).filter((m) => m !== measure);
    const sort =
      query.sort && others.includes(query.sort.column as Measure) ? undefined : query.sort;
    const { measures: _measures, ...rest } = result;
    return {
      query: sort ? { ...base, measure, sort } : { ...base, measure },
      result: {
        ...rest,
        columns: result.columns.filter((c) => !others.includes(c.key as Measure)),
        rows: result.rows.map((row) => {
          const one = { ...row };
          for (const m of others) delete one[m];
          return one;
        }),
        total: figures?.total ?? null,
        ...(figures ? { evidence: figures.evidence } : {}),
      },
    };
  });
}
