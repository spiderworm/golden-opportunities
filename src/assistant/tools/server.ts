// The assistant's MCP server: started by Claude Code over stdio (`node src/assistant/tools/server.ts`), one per
// answer. It speaks just enough MCP for tools (initialize, tools/list, tools/call, ping), by hand, so there is
// no SDK surface to audit. Queries go to the app's POST /api/query with the bearer token from the environment
// (ORBITAL_QUERY_URL, ORBITAL_QUERY_TOKEN); the URL's host must be a loopback IP literal, so the token can't be
// sent away.
// ORBITAL_PINS=0 removes pin_chart, for pages with nowhere to put a pin.

import { createInterface } from "node:readline";
import { QUERY_LIMITS, type QueryResult } from "../../query/types.ts";
import { combineComparison, comparisonQueries } from "./comparison.ts";
import { checkChart, checkComparison, checkQuery, describeData, SERVER_NAME, ToolInputError, TOOLS, type Comparison, type ComparisonResult } from "./definitions.ts";

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

/**
 * Runs a comparison as two queries, one per side, and works out the change here (comparison.ts), so the
 * assistant never does arithmetic of its own: every figure it can state comes back from a tool, with a source.
 */
async function runComparison(c: Comparison, endpoint: { url: URL; token: string }): Promise<{ result: ComparisonResult; sides: number[] }> {
  const [a, b] = await Promise.all(comparisonQueries(c).map((q) => runQuery(q, endpoint)));
  return { result: combineComparison(c, a!, b!), sides: [a!.rows.length, b!.rows.length] };
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
function withRefs<T extends { rows: object[] }>(result: T, complete: boolean): T & { ref: string; complete: boolean } {
  const ref = nextRef();
  return { ref, ...result, rows: result.rows.map((row, i) => ({ ref: `${ref}${i + 1}`, ...row })), complete };
}
/**
 * Whether a result holds every group, so "the highest" can be said of it. A limit or the row cap may have cut
 * it; when the rows reach either, it's treated as cut, even if it happens to be whole.
 */
const isComplete = (rows: number, limit: number = QUERY_LIMITS.rows) => rows < Math.min(limit, QUERY_LIMITS.rows);

const ok = (value: unknown): Content => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
const fail = (message: string): Content => ({ content: [{ type: "text", text: message }], isError: true });

/** Runs one tool call. Never throws: errors become tool errors the model can read. */
export async function callTool(name: unknown, args: unknown, env: NodeJS.ProcessEnv = process.env): Promise<Content> {
  try {
    if (name === "describe_data") return ok(describeData());
    if (name === "query_data") {
      const query = checkQuery(args);
      const result = await runQuery(query, queryEndpoint(env));
      return ok(withRefs(result, isComplete(result.rows.length, query.limit)));
    }
    if (name === "compare_data") {
      const { result, sides } = await runComparison(checkComparison(args), queryEndpoint(env));
      return ok(withRefs(result, sides.every((n) => isComplete(n))));
    }
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
