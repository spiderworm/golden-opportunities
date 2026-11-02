import { DATA_VERSION_HEADER, queryCache, queryKey, type Loaded } from "~/platform/query-cache.client";
import type { Query, QueryErrorResponse, QueryResult } from "~/query/types";

export class QueryRequestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Runs a query through POST /api/query, the same endpoint Dewey's tools use.
 * The server decides which periods are visible; the browser only sends the query.
 * Answers are kept in the page's query cache for the save's data version, so a pin or report shown again, or two
 * cards asking the same thing, cost one request. The server records discovery evidence when it answers; a cached
 * answer is one it already answered, and recorded, for the same version. A failed recording is an error response
 * (RATE_LIMITED), and errors are never kept.
 */
export function fetchQuery(query: Query, signal?: AbortSignal): Promise<QueryResult> {
  return queryCache.load(`query:${queryKey(query)}`, () => postQuery(query), signal);
}

async function postQuery(query: Query): Promise<Loaded<QueryResult>> {
  const response = await fetch("/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
  });
  const text = await response.text().catch(() => "");
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: reported below as the status.
  }
  if (!response.ok) {
    const error = (body as QueryErrorResponse | null)?.error;
    throw new QueryRequestError(error?.code ?? `HTTP_${response.status}`, error?.message ?? "The query didn't run.");
  }
  // Kept only under the version the server says it computed this for; no header, nothing kept.
  return { value: body as QueryResult, bytes: text.length, version: response.headers.get(DATA_VERSION_HEADER) };
}
