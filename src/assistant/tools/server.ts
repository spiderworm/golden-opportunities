// The assistant's MCP server: started by Claude Code over stdio (`node src/assistant/tools/server.ts`), one per
// answer. It speaks just enough MCP for tools (initialize, tools/list, tools/call, ping), by hand, so there is
// no SDK surface to audit. Queries go to the app's POST /api/query with the bearer token from the environment
// (ORBITAL_QUERY_URL, ORBITAL_QUERY_TOKEN); the URL's host must be a loopback IP literal, so the token can't be
// sent away.
// ORBITAL_PINS=0 removes pin_chart, for pages with nowhere to put a pin.

import { createInterface } from "node:readline";
import type { QueryColumn, QueryResult } from "../../query/types.ts";
import { checkChart, checkComparison, checkQuery, describeData, SERVER_NAME, ToolInputError, TOOLS, type Comparison, type ComparisonFigures, type ComparisonResult } from "./definitions.ts";

const MAX_LINE = 65_536;
const MAX_RESPONSE = 1_000_000;
const QUERY_TIMEOUT_MS = 15_000;
const LOOPBACK = ["127.0.0.1", "[::1]"];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: unknown; arguments?: unknown; protocolVersion?: unknown } };
type Content = { content: { type: "text"; text: string }[]; isError?: boolean };

export function queryEndpoint(env: NodeJS.ProcessEnv = process.env): { url: URL; token: string } {
  const token = env.ORBITAL_QUERY_TOKEN;
  if (!token) throw new Error("ORBITAL_QUERY_TOKEN is not set.");
  const url = new URL(env.ORBITAL_QUERY_URL ?? "");
  // Loopback IP literals only, never a hostname (not even localhost): a hostname is resolved, and a hostile
  // resolver or hosts file could send the bearer token off the machine.
  if (url.protocol !== "http:" || !LOOPBACK.includes(url.hostname) || url.username || url.password) throw new Error("ORBITAL_QUERY_URL must be http to a loopback IP (127.0.0.1 or [::1]).");
  return { url, token };
}

async function runQuery(query: unknown, endpoint: { url: URL; token: string }): Promise<QueryResult> {
  const res = await fetch(endpoint.url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${endpoint.token}` },
    body: JSON.stringify(query),
    redirect: "error",
    signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
  });
  const text = await res.text();
  if (text.length > MAX_RESPONSE) throw new ToolInputError("The result was too large; group by fewer values or set a limit.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`The data terminal answered ${res.status} without data.`);
  }
  if (!res.ok) {
    const error = (body as { error?: { code?: unknown; message?: unknown } }).error;
    throw new ToolInputError(`${String(error?.code ?? res.status)}: ${String(error?.message ?? "the query failed").slice(0, 300)}`);
  }
  const { columns, rows, total, source } = body as QueryResult;
  return { columns, rows, total, source };
}

const figures = (from: number | null | undefined, to: number | null | undefined): ComparisonFigures => {
  const a = typeof from === "number" ? from : null;
  const b = typeof to === "number" ? to : null;
  const change = a === null || b === null ? null : b - a;
  const direction = change === null ? null : change > 0 ? "rose" : change < 0 ? "fell" : "unchanged";
  return { from: a, to: b, change, percent_change: change === null || !a ? null : (change / Math.abs(a)) * 100, direction };
};

/**
 * Runs a comparison as two queries, one per side, and works out the change here, so the assistant never does
 * arithmetic of its own: every figure it can state comes back from a tool, with a source.
 */
async function runComparison(c: Comparison, endpoint: { url: URL; token: string }): Promise<ComparisonResult> {
  const side = (value: string) => runQuery(checkQuery({ measure: c.measure, by: c.by, filter: { ...c.filter, [c.across]: [value] } }), endpoint);
  const [a, b] = await Promise.all([side(c.from), side(c.to)]);
  const dim = c.by[0];
  const number = (label: string, key: string): ComparisonResult["columns"][number] => ({ key, label, type: "number", nullable: true });
  const columns = [
    ...(dim ? [a.columns.find((col: QueryColumn) => col.key === dim) ?? { key: dim, label: dim, type: "string" as const, nullable: true }] : []),
    number(c.from, "from"),
    number(c.to, "to"),
    number("Change", "change"),
    number("Change (%)", "percent_change"),
  ];
  let rows: ComparisonResult["rows"] = [];
  if (dim) {
    const key = (row: Record<string, unknown>) => (row[dim] ?? null) as string | null;
    const toByKey = new Map(b.rows.map((r) => [key(r), r[c.measure]]));
    const keys = [...new Set([...a.rows.map(key), ...b.rows.map(key)])];
    const fromByKey = new Map(a.rows.map((r) => [key(r), r[c.measure]]));
    rows = keys.map((k) => ({ [dim]: k, ...figures(fromByKey.get(k), toByKey.get(k)) }));
  }
  const source = [
    `${c.measure} compared across ${c.across}, ${c.from} against ${c.to}. Change is ${c.to} minus ${c.from}; percent change is that change divided by ${c.from}, worked out by the data terminal.`,
    `${c.from}: ${a.source}`,
    `${c.to}: ${b.source}`,
  ].join(" ");
  return { columns, rows, total: figures(a.total, b.total), source };
}

// Every successful lookup gets a ref ("a", "b", ...) and each of its rows one more ("a1", "a2", ...). The model
// cites figures by ref and the app fills them in (src/assistant/server/figures.server.ts), so it never writes
// a number itself. One server runs per answer, so refs are unique within an answer.
let lookups = 0;
export const resetRefsForTests = () => void (lookups = 0);
function nextRef(): string {
  let n = lookups++;
  let ref = "";
  do {
    ref = String.fromCharCode(97 + (n % 26)) + ref;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return ref;
}
function withRefs<T extends { rows: object[] }>(result: T): T & { ref: string } {
  const ref = nextRef();
  return { ref, ...result, rows: result.rows.map((row, i) => ({ ref: `${ref}${i + 1}`, ...row })) };
}

const ok = (value: unknown): Content => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
const fail = (message: string): Content => ({ content: [{ type: "text", text: message }], isError: true });

/** Runs one tool call. Never throws: errors become tool errors the model can read. */
export async function callTool(name: unknown, args: unknown, env: NodeJS.ProcessEnv = process.env): Promise<Content> {
  try {
    if (name === "describe_data") return ok(describeData());
    if (name === "query_data") return ok(withRefs(await runQuery(checkQuery(args), queryEndpoint(env))));
    if (name === "compare_data") return ok(withRefs(await runComparison(checkComparison(args), queryEndpoint(env))));
    if (name === "pin_chart" && env.ORBITAL_PINS !== "0") {
      const chart = checkChart(args);
      const { source, rows } = await runQuery(chart.query, queryEndpoint(env));
      return ok({ pinned: true, chart, rows: rows.length, source });
    }
    return fail("Unknown tool.");
  } catch (e) {
    if (e instanceof ToolInputError) return fail(e.message);
    // Anything else is ours, not the model's: say little, and nothing that could carry the token.
    return fail("The data terminal is unavailable right now.");
  }
}

export async function handle(message: Rpc, env: NodeJS.ProcessEnv = process.env): Promise<object | null> {
  const { id, method, params } = message;
  if (id === undefined || id === null) return null; // a notification
  const reply = (result: object) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      return reply({ protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: "1" } });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: env.ORBITAL_PINS === "0" ? TOOLS.filter((t) => t.name !== "pin_chart") : TOOLS });
    case "tools/call":
      return reply(await callTool(params?.name, params?.arguments ?? {}, env));
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
  }
}

if (import.meta.main) {
  const send = (m: object) => process.stdout.write(`${JSON.stringify(m)}\n`);
  createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", async (line) => {
    if (line.length > MAX_LINE) return send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } });
    let message: Rpc;
    try {
      message = JSON.parse(line);
    } catch {
      return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    const response = await handle(message);
    if (response) send(response);
  });
}
