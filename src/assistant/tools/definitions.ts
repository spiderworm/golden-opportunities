// The assistant's tools: the whole of what the model can do. This is the attack surface, so each tool is
// narrow, every input is checked here before anything runs, and nothing can choose what data is visible:
// queries go to POST /api/query, whose view is server state (src/query/contract.md).
//
// No file, shell, eval or free-form query tools, and none that reach the scenario's cause, the simulation or
// the scoring.

// Dewey sees only the reviewed lists (AGENT_*): a new dimension or measure stays Investigate-only until Probe has
// reviewed it against the figures gate.
import {
  AGENT_DIMENSIONS as DIMENSIONS,
  AGENT_MEASURE_DIMENSIONS as MEASURE_DIMENSIONS,
  AGENT_MEASURES as MEASURES,
  QUERY_LIMITS,
  type Dimension,
  type Measure,
  type Query,
} from "../../query/types.ts";

export const SERVER_NAME = "orbital";
export const CHART_KINDS = ["bar", "line", "table"] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
/** What show_chart draws in the chat: a table is what query_data already shows. */
export const SHOWN_CHART_KINDS = ["bar", "line"] as const;
export interface ChartSpec {
  title: string;
  kind: ChartKind;
  query: Query;
}
export const TITLE_MAX = 80;

/** Two values of one dimension compared on one measure: the comparison the assistant would otherwise work out itself. */
export interface Comparison {
  measure: Measure;
  /** The dimension whose two values are compared, e.g. quarter. */
  across: Dimension;
  from: string;
  to: string;
  /** At most one dimension to break the comparison down by. */
  by: readonly Dimension[];
  filter?: Partial<Record<Dimension, readonly string[]>>;
}
export interface ComparisonFigures {
  from: number | null;
  to: number | null;
  change: number | null;
  percent_change: number | null;
  /** The change's direction in words, from `from` to `to`, so the assistant can't state it backwards. */
  direction: "rose" | "fell" | "unchanged" | null;
}
export interface ComparisonResult {
  /** The compared values as the data returned them; null where a side matched nothing. */
  labels: { from: string | null; to: string | null };
  columns: { key: string; label: string; type: "string" | "number"; nullable: boolean }[];
  rows: Record<string, string | number | null>[];
  total: ComparisonFigures;
  source: string;
}

const queryProperties = {
  measure: { type: "string", enum: MEASURES, description: "What to measure." },
  by: {
    type: "array",
    items: { type: "string", enum: DIMENSIONS },
    maxItems: QUERY_LIMITS.dimensions,
    uniqueItems: true,
    description: "Up to two dimensions to group by; empty for one total.",
  },
  filter: {
    type: "object",
    description:
      "Exact, case-sensitive values to keep, per dimension. Values within a dimension are OR; dimensions are AND.",
    properties: Object.fromEntries(
      DIMENSIONS.map((d) => [
        d,
        {
          type: "array",
          items: { type: "string", maxLength: QUERY_LIMITS.filterValueLength },
          minItems: 1,
          maxItems: QUERY_LIMITS.filterValues,
        },
      ]),
    ),
    additionalProperties: false,
  },
  sort: {
    type: "object",
    properties: {
      column: { type: "string", enum: [...DIMENSIONS, ...MEASURES] },
      direction: { type: "string", enum: ["asc", "desc"] },
    },
    required: ["column", "direction"],
    additionalProperties: false,
  },
  limit: { type: "integer", minimum: 1, maximum: QUERY_LIMITS.rows },
} as const;

export const TOOLS = [
  {
    name: "describe_data",
    description:
      "Lists the measures and dimensions the player's data terminal offers, and which dimensions each measure supports. Call it before querying if you aren't sure a measure or dimension exists.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "query_data",
    description:
      "Runs one query on the store's data, exactly as the player's dashboard would, over the periods the player can see. Returns a ref for the result and one for each row, columns, rows, the total, and a source line describing where the figures come from. The player sees the result and its source under your reply. Cite its figures by ref, as your rules say.",
    inputSchema: {
      type: "object",
      properties: queryProperties,
      required: ["measure", "by"],
      additionalProperties: false,
    },
  },
  {
    name: "compare_data",
    description:
      "Compares one measure between two values of one dimension (two quarters, two weekdays, two genres), optionally broken down by one other dimension. Returns a ref for the result and one for each row, each side's figure, the change (to minus from), the percent change and the direction, computed by the data terminal, with a source line. Use it whenever the player asks for a difference, a change, a rise or fall, which is higher, or a percent change, in either order. Cite its figures and comparisons by ref, as your rules say; never state a direction yourself.",
    inputSchema: {
      type: "object",
      properties: {
        measure: queryProperties.measure,
        across: {
          type: "string",
          enum: DIMENSIONS,
          description: "The dimension whose two values are compared.",
        },
        from: {
          type: "string",
          minLength: 1,
          maxLength: QUERY_LIMITS.filterValueLength,
          description:
            "The earlier or baseline value, exactly as the terminal labels it (e.g. 2193-Q3, or a month like 2193-03).",
        },
        to: {
          type: "string",
          minLength: 1,
          maxLength: QUERY_LIMITS.filterValueLength,
          description: "The value compared with it (e.g. 2193-Q4, or a month like 2193-04).",
        },
        by: {
          type: "array",
          items: { type: "string", enum: DIMENSIONS },
          maxItems: 1,
          description:
            "Optionally, one dimension to break the comparison down by; empty for the overall figures.",
        },
        filter: queryProperties.filter,
      },
      required: ["measure", "across", "from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "show_chart",
    description:
      "Runs one query, exactly as query_data does, and draws its result as a chart under your reply instead of a table. Use it when the player asks for a chart, graph or plot, or to see something drawn. It returns the same refs, rows, total and source as query_data; cite its figures by ref, as your rules say. The terminal chooses the chart (a line over months or quarters, bars for anything else) and titles it from its query.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "object",
          properties: queryProperties,
          required: ["measure", "by"],
          additionalProperties: false,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "pin_chart",
    description:
      "Pins a chart of one query to the player's dashboard. Only when the player asks you to pin or keep a chart. The terminal chooses the chart as show_chart does (a line over months or quarters, bars for anything else, a table for one total) and titles it from its query. Set table to true only when the player asks to pin a table.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "object",
          properties: queryProperties,
          required: ["measure", "by"],
          additionalProperties: false,
        },
        table: { type: "boolean" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
] as const;
export type ToolName = (typeof TOOLS)[number]["name"];

export class ToolInputError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const has = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);
function onlyKeys(o: Record<string, unknown>, allowed: readonly string[], what: string) {
  const extra = Object.keys(o).filter((k) => !allowed.includes(k));
  if (extra.length)
    throw new ToolInputError(`${what} has unknown fields: ${extra.slice(0, 5).join(", ")}.`);
}

/** Checks a query from the model and rebuilds it from known parts only. Throws ToolInputError. */
export function checkQuery(input: unknown): Query {
  if (!isObject(input)) throw new ToolInputError("The query must be an object.");
  onlyKeys(input, ["measure", "by", "filter", "sort", "limit"], "The query");
  const { measure, by = [], filter, sort, limit } = input;
  if (!has(MEASURES, measure))
    throw new ToolInputError(`Unknown measure. Measures: ${MEASURES.join(", ")}.`);
  if (
    !Array.isArray(by) ||
    by.length > QUERY_LIMITS.dimensions ||
    !by.every((d) => has(DIMENSIONS, d)) ||
    new Set(by).size !== by.length
  ) {
    throw new ToolInputError(
      `"by" must list up to ${QUERY_LIMITS.dimensions} different dimensions from: ${DIMENSIONS.join(", ")}.`,
    );
  }
  const allowed: readonly Dimension[] = MEASURE_DIMENSIONS[measure];
  const query: { -readonly [K in keyof Query]: Query[K] } = { measure, by: by as Dimension[] };
  for (const d of by as Dimension[])
    if (!allowed.includes(d))
      throw new ToolInputError(
        `${measure} can't be grouped by ${d}. It supports: ${allowed.join(", ")}.`,
      );
  if (filter !== undefined) {
    if (!isObject(filter)) throw new ToolInputError('"filter" must be an object.');
    const clean: Partial<Record<Dimension, string[]>> = {};
    for (const [d, values] of Object.entries(filter)) {
      if (!has(DIMENSIONS, d))
        throw new ToolInputError(`Unknown filter dimension: ${d.slice(0, 40)}.`);
      if (!allowed.includes(d)) throw new ToolInputError(`${measure} can't be filtered by ${d}.`);
      if (
        !Array.isArray(values) ||
        values.length < 1 ||
        values.length > QUERY_LIMITS.filterValues ||
        !values.every((v) => typeof v === "string" && v.length <= QUERY_LIMITS.filterValueLength)
      ) {
        throw new ToolInputError(
          `The ${d} filter must be 1 to ${QUERY_LIMITS.filterValues} strings.`,
        );
      }
      clean[d] = values as string[];
    }
    query.filter = clean;
  }
  if (sort !== undefined) {
    if (!isObject(sort)) throw new ToolInputError('"sort" must be an object.');
    onlyKeys(sort, ["column", "direction"], '"sort"');
    const columns: (Dimension | Measure)[] = [measure, ...(by as Dimension[])];
    if (!has(columns, sort.column) || (sort.direction !== "asc" && sort.direction !== "desc"))
      throw new ToolInputError(
        `"sort" must name one of ${columns.join(", ")} and a direction, asc or desc.`,
      );
    query.sort = { column: sort.column, direction: sort.direction };
  }
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > QUERY_LIMITS.rows)
      throw new ToolInputError(`"limit" must be a whole number from 1 to ${QUERY_LIMITS.rows}.`);
    query.limit = limit as number;
  }
  return query;
}

/** Checks a comparison from the model and rebuilds it from known parts only. Throws ToolInputError. */
export function checkComparison(input: unknown): Comparison {
  if (!isObject(input)) throw new ToolInputError("The comparison must be an object.");
  onlyKeys(input, ["measure", "across", "from", "to", "by", "filter"], "The comparison");
  const { measure, across, from, to, by = [], filter } = input;
  if (!has(DIMENSIONS, across))
    throw new ToolInputError(`"across" must be one of: ${DIMENSIONS.join(", ")}.`);
  for (const [name, v] of [
    ["from", from],
    ["to", to],
  ] as const) {
    if (typeof v !== "string" || !v || v.length > QUERY_LIMITS.filterValueLength)
      throw new ToolInputError(
        `"${name}" must be 1 to ${QUERY_LIMITS.filterValueLength} characters.`,
      );
  }
  if (from === to) throw new ToolInputError('"from" and "to" must differ.');
  if (!Array.isArray(by) || by.length > 1)
    throw new ToolInputError('"by" may name at most one dimension.');
  if (by.includes(across))
    throw new ToolInputError(`"by" can't be ${across}, the dimension being compared.`);
  if (isObject(filter) && across in filter)
    throw new ToolInputError(`Don't filter on ${across}; "from" and "to" choose its values.`);
  // checkQuery checks the measure, dimensions and filter as one query would.
  const query = checkQuery({
    measure,
    by: [...by, across],
    ...(filter === undefined ? {} : { filter }),
  });
  return {
    measure: query.measure,
    across,
    from: from as string,
    to: to as string,
    by: query.by.slice(0, -1),
    ...(query.filter ? { filter: query.filter } : {}),
  };
}

const MEASURE_TITLES: Record<Measure, string> = {
  revenue: "Revenue",
  units: "Units",
  orders: "Orders",
  avg_discount: "Average discount",
  avg_rating: "Average rating",
  checkouts: "Checkouts",
  avg_order_value: "Average order value",
  orders_per_day: "Orders per day",
  ratings: "Ratings",
};

/** A chart's title, built from its query: the model doesn't title pins (Probe X1, #32). */
export const chartTitle = (query: Query) =>
  `${MEASURE_TITLES[query.measure]}${query.by.length ? ` by ${query.by.join(" and ").replace(/_/g, " ")}` : ""}${query.filter && Object.keys(query.filter).length ? ", filtered" : ""}`;

const DIMENSION_WORDS = (by: readonly Dimension[]) => by.join(" and ").replace(/_/g, " ");

/**
 * A comparison's title, built from its measure and dimensions only: the compared values are the model's free
 * text, shown only as the data returns them (Audit, #32).
 */
export const comparisonTitle = (c: Comparison) =>
  `${MEASURE_TITLES[c.measure]} compared across ${DIMENSION_WORDS([c.across])}${c.by.length ? ` by ${DIMENSION_WORDS(c.by)}` : ""}${c.filter && Object.keys(c.filter).length ? ", filtered" : ""}`;

/**
 * What the player can pin from a lookup Dewey showed: the query or comparison that ran, never its rows, so
 * Investigate runs it again through POST /api/query. Structurally one of Chart's PinSpecs
 * (src/investigate/pins/spec.ts).
 */
export type LookupPin =
  | { title: string; kind: "table" | (typeof SHOWN_CHART_KINDS)[number]; query: Query }
  | { title: string; kind: "comparison"; comparison: Comparison };

/** The pin for a lookup that ran, from the tool's input checked as the tool server checked it; null if it doesn't check. */
export function lookupPin(tool: string, input: unknown): LookupPin | null {
  try {
    if (tool === "query_data") {
      const query = checkQuery(input);
      return { title: chartTitle(query), kind: "table", query };
    }
    if (tool === "compare_data") {
      const comparison = checkComparison(input);
      return { title: comparisonTitle(comparison), kind: "comparison", comparison };
    }
    if (tool === "show_chart") return checkShownChart(input);
  } catch (e) {
    if (!(e instanceof ToolInputError)) throw e;
  }
  return null;
}

/** The chart a query is drawn as: a line over months or quarters, bars for anything else (Audit, #252). */
const drawnKind = (query: Query): (typeof SHOWN_CHART_KINDS)[number] =>
  query.by[0] === "month" || query.by[0] === "quarter" ? "line" : "bar";

/**
 * Checks a chart to pin, and makes it from its query, as show_chart does: the title, and the kind, a table only
 * when the model asks for one (the player did) or there's no dimension to draw. A title from the model is ignored.
 * The model chooses no bar or line: a line across genres on a pin would suggest a trend too (Chart, after #258).
 * Throws ToolInputError.
 */
export function checkChart(input: unknown): ChartSpec {
  if (!isObject(input)) throw new ToolInputError("The chart must be an object.");
  onlyKeys(input, ["title", "query", "table"], "The chart");
  if (input.table !== undefined && typeof input.table !== "boolean")
    throw new ToolInputError("table must be true or false.");
  const checked = checkQuery(input.query);
  return {
    title: chartTitle(checked),
    kind: input.table === true || !checked.by.length ? "table" : drawnKind(checked),
    query: checked,
  };
}

/**
 * Checks a chart to show in the chat, and makes it from its query alone: the title, and the kind, a line over
 * months or quarters and bars for anything else. The model chooses neither: a line across genres would suggest a
 * trend (Audit, #252). Throws ToolInputError.
 */
export function checkShownChart(
  input: unknown,
): ChartSpec & { kind: (typeof SHOWN_CHART_KINDS)[number] } {
  if (!isObject(input)) throw new ToolInputError("The chart must be an object.");
  onlyKeys(input, ["query"], "The chart");
  const checked = checkQuery(input.query);
  const [x] = checked.by;
  if (!x)
    throw new ToolInputError('A chart needs a dimension in "by"; for one total, use query_data.');
  return { title: chartTitle(checked), kind: drawnKind(checked), query: checked };
}

/** What describe_data returns: the contract's names, so new measures and dimensions appear without changes here. */
export function describeData() {
  return {
    measures: MEASURES.map((m) => ({ name: m, dimensions: MEASURE_DIMENSIONS[m] })),
    dimensions: DIMENSIONS,
    rules: [
      `Group by up to ${QUERY_LIMITS.dimensions} dimensions. Filters are exact, case-sensitive matches; group by a dimension first to see its values.`,
      `At most ${QUERY_LIMITS.rows} rows per query. The total covers every matching fact, before grouping or the row limit.`,
      "Only the periods the player can see are included; asking for others returns nothing.",
      "Labels: quarter like 2193-Q4; month as year and month, like 2193-04 (each year's months are separate); weekday Monday to Sunday; discounted yes or no; discount_rate a percent like 0% or 15%; list_price a price like $27.99; price_band one of under $10, $10 to $19.99, $20 to $29.99, $30 and up. Filter with these exactly; no need to look them up first.",
      "edition is a title and its format, like Post Alley (Hardcover), with the year where a book has two editions in one format: group by edition to see them. list_price is a book's list price, before any discount.",
    ],
  };
}
