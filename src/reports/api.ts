import type { Route } from "./+types/api";
import { reportsData } from "./data.server";

/**
 * GET /api/reports: Reports' data for the panels that read it on other pages (Decide's, Investigate's Add to
 * report), fetched with a plain fetch, not a fetcher. A fetcher's load goes through React Router, which imports
 * the Reports page's module for it, and a full navigation away that cuts that import off makes React Router reload
 * the page being left, which in WebKit can win over the player's own navigation (Frank, #352). An aborted fetch
 * only rejects.
 */
export function loader({ request }: Route.LoaderArgs) {
  return Response.json(reportsData(request), { headers: { "Cache-Control": "no-store" } });
}
