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
 */
export async function fetchQuery(query: Query, signal?: AbortSignal): Promise<QueryResult> {
  const response = await fetch("/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as QueryErrorResponse | null)?.error;
    throw new QueryRequestError(error?.code ?? `HTTP_${response.status}`, error?.message ?? "The query didn't run.");
  }
  return body as QueryResult;
}
