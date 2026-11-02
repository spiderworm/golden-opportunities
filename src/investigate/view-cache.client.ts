// Investigate's views, cached in the browser (David's caching request, PR 2). A view is the screen's loader data
// for one question: the URL's search, as parseState reads it. The server loader records discovery evidence from
// what it shows, so a view may be served from the cache only if the server has already shown it, and recorded
// that, under the page's data version. Entries come only from the server's own answers, filed under the data
// version that answer names, and only when its evidence was recorded: a deferred recording (the save was busy)
// is shown, never kept, so showing that view again asks the server again.
import type { QueryCache } from "~/platform/query-cache.client";
import { parseState, toSearchParams } from "./state";

export interface ServerView {
  /** The data version the server computed the view under (src/query/data-version.server.ts). */
  dataVersion: string;
  /** Whether the server recorded the view's discovery evidence, or had to defer it. */
  evidence: "recorded" | "deferred";
}

/** One key per question, however its URL is written: parameters the screen doesn't read don't count. */
export function viewKey(url: string): string {
  return `investigate:${toSearchParams(parseState(new URL(url).searchParams)).toString()}`;
}

/** The cached view for this URL, or the server's, kept if its evidence was recorded under the page's version. */
export async function cachedView<T extends ServerView>(cache: QueryCache, url: string, serverLoader: () => Promise<T>): Promise<T> {
  const key = viewKey(url);
  const hit = cache.peek<T>(key);
  if (hit !== undefined) return hit;
  cache.noteMiss();
  const view = await serverLoader();
  if (view.evidence === "recorded") cache.put(key, view, JSON.stringify(view).length, view.dataVersion);
  return view;
}
