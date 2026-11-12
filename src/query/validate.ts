import { QueryError } from "./errors";
import { isRelativeQuarter, RELATIVE_QUARTERS } from "./relative";
import {
  DIMENSIONS,
  FILTER_ONLY_DIMENSIONS,
  isSalesMeasure,
  queryMeasures,
  MEASURES,
  MEASURE_DIMENSIONS,
  QUERY_LIMITS,
} from "./types";
import type { Dimension, Measure, Query } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
const dimension = (value: unknown): value is Dimension =>
  typeof value === "string" && (DIMENSIONS as readonly string[]).includes(value);
const measure = (value: unknown): value is Measure =>
  typeof value === "string" && (MEASURES as readonly string[]).includes(value);
function invalid(message: string): never {
  throw new QueryError("INVALID_QUERY", message);
}
function keys(object: Record<string, unknown>, allowed: readonly string[], name: string): void {
  if (Object.keys(object).some((key) => !allowed.includes(key)))
    invalid(`${name} contains an unknown property.`);
}

/** Strict allowlist, shared by HTTP and direct server callers. Returns a fresh value. */
export function validateQuery(input: unknown): Query {
  if (!isRecord(input)) invalid("Query must be a JSON object.");
  keys(input, ["measure", "also", "by", "filter", "sort", "limit", "vs"], "Query");
  if (!measure(input.measure)) invalid(`Measure must be one of: ${MEASURES.join(", ")}.`);
  if (Object.hasOwn(input, "also")) {
    const also = input.also;
    if (
      !Array.isArray(also) ||
      also.length < 1 ||
      also.length > QUERY_LIMITS.measures - 1 ||
      !also.every(measure)
    )
      invalid(
        `also takes 1 to ${QUERY_LIMITS.measures - 1} more measures, from: ${MEASURES.join(", ")}.`,
      );
    if (new Set([input.measure, ...also]).size !== also.length + 1)
      invalid("Measures must be distinct.");
    // Sales measures come from sale lines, the others from book records: one table would line up figures over
    // different periods (contract.md, "Several measures").
    const sales = isSalesMeasure(input.measure);
    const other = also.find((m) => isSalesMeasure(m) !== sales);
    if (other) {
      const [a, b] = sales ? [input.measure, other] : [other, input.measure];
      throw new QueryError(
        "INCOMPATIBLE_MEASURES",
        `${a} and ${b} can't share a query: ${a} comes from sales, and ${b} from book records (ratings and checkouts). Query them separately.`,
      );
    }
  }
  if (
    !Array.isArray(input.by) ||
    input.by.length > QUERY_LIMITS.dimensions ||
    !input.by.every(dimension)
  )
    invalid("by must contain zero to two allowed dimensions.");
  if (new Set(input.by).size !== input.by.length) invalid("Grouping dimensions must be distinct.");
  const filterOnly = (input.by as Dimension[]).find((d) =>
    (FILTER_ONLY_DIMENSIONS as readonly Dimension[]).includes(d),
  );
  if (filterOnly)
    invalid(`${filterOnly} can filter but not group: a book with two awards would count twice.`);
  const result: Query = { measure: input.measure, by: [...input.by] };
  if (Array.isArray(input.also)) result.also = [...(input.also as Measure[])];
  const measures = queryMeasures(result);
  if (Object.hasOwn(input, "filter")) {
    if (!isRecord(input.filter)) invalid("filter must be an object of dimension arrays.");
    const filter: NonNullable<Query["filter"]> = {};
    for (const [key, values] of Object.entries(input.filter)) {
      if (!dimension(key)) invalid("filter contains an unknown dimension.");
      if (
        !Array.isArray(values) ||
        values.length < 1 ||
        values.length > QUERY_LIMITS.filterValues ||
        !values.every(
          (v) =>
            typeof v === "string" && v.length > 0 && v.length <= QUERY_LIMITS.filterValueLength,
        )
      )
        invalid(
          `Each filter must have 1–${QUERY_LIMITS.filterValues} nonempty strings of at most ${QUERY_LIMITS.filterValueLength} characters.`,
        );
      // A quarter is one by its name ("2194-Q1"), or a relative quarter resolved at query time (relative.ts): the
      // tokens are accepted here only.
      if (
        key === "quarter" &&
        !(values as string[]).every((v) => /^\d{4}-Q[1-4]$/.test(v) || isRelativeQuarter(v))
      )
        invalid(
          `Quarter filters are quarters like 2194-Q1, or ${RELATIVE_QUARTERS.join(", ")} (counted back from the latest quarter with sales).`,
        );
      // A month names its year ("2193-04"): a bare "04" would match nothing now that two years can be visible.
      if (key === "month" && !(values as string[]).every((v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v)))
        invalid("Month filters are year and month, like 2193-04.");
      filter[key] = [...new Set(values as string[])];
    }
    result.filter = filter;
  }
  const used = [...result.by, ...(Object.keys(result.filter ?? {}) as Dimension[])];
  // Every measure supports every dimension used: the query's dimensions are those all its measures share.
  for (const key of used)
    for (const m of measures)
      if (!MEASURE_DIMENSIONS[m].includes(key))
        throw new QueryError(
          "INCOMPATIBLE_DIMENSION",
          `${m} does not support ${key}. Allowed dimensions: ${MEASURE_DIMENSIONS[m].join(", ")}.`,
        );
  if (Object.hasOwn(input, "sort")) {
    if (!isRecord(input.sort)) invalid("sort must be an object.");
    keys(input.sort, ["column", "direction"], "sort");
    const { column, direction } = input.sort;
    if (
      !(measure(column) && measures.includes(column)) &&
      !(dimension(column) && result.by.includes(column))
    )
      invalid("Sort column must be a selected measure or a grouped dimension.");
    if (direction !== "asc" && direction !== "desc") invalid("Sort direction must be asc or desc.");
    result.sort = { column, direction };
  }
  if (Object.hasOwn(input, "limit")) {
    if (
      typeof input.limit !== "number" ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > QUERY_LIMITS.rows
    )
      invalid(`limit must be an integer from 1 to ${QUERY_LIMITS.rows}.`);
    result.limit = input.limit;
  }
  if (Object.hasOwn(input, "vs")) {
    if (input.vs !== "last_year") invalid('vs must be "last_year".');
    if (result.also) invalid("Last year's figures are for one measure at a time for now.");
    // Last year is a year of quarters earlier: ratings and checkouts have no quarters.
    if (!MEASURE_DIMENSIONS[result.measure].includes("quarter"))
      throw new QueryError(
        "INCOMPATIBLE_DIMENSION",
        `${result.measure} has no quarters to compare with last year.`,
      );
    result.vs = "last_year";
  }
  return result;
}
