import { gameSessionMiddleware } from "~/game/session.server";
import { useEffect } from "react";
import { Outlet, useFetcher, useLocation } from "react-router";

import type { Route } from "./+types/layout";
import { Shell } from "./Shell";
import { getStationState } from "./station-state";
import { revalidateAbovePage } from "~/platform/revalidate";
import { track } from "~/platform/analytics/analytics.client";
import { flushQueryCacheStats, pageOf, queryCache } from "~/platform/query-cache.client";

export const middleware: Route.MiddlewareFunction[] = [gameSessionMiddleware];

export function loader({ request }: Route.LoaderArgs) {
  return getStationState(request);
}

export const shouldRevalidate = revalidateAbovePage;

export default function ShellLayout({ loaderData }: Route.ComponentProps) {
  const seen = useFetcher();
  const { pathname } = useLocation();
  // In render, before any child's effects run, so a pin fetched on mount is filed under this version (Frank's
  // note on #189). Only in the browser: the cache module is client-only. Idempotent: setting the version it
  // already has keeps the cache, so a re-render or React's double render in development changes nothing.
  if (typeof document !== "undefined") queryCache.setVersion(loaderData.dataVersion);

  useEffect(() => {
    const page = pageOf(pathname);
    const hidden = () => flushQueryCacheStats(queryCache, track, page);
    window.addEventListener("pagehide", hidden);
    return () => {
      window.removeEventListener("pagehide", hidden);
      flushQueryCacheStats(queryCache, track, page);
    };
  }, [pathname]);

  return (
    <Shell
      stationDate={loaderData.date}
      notifications={loaderData.alerts}
      standingOrder={loaderData.standingOrder}
      q1={loaderData.q1}
      onAlertSeen={() => seen.submit(null, { method: "post", action: "/alert/seen" }).catch(() => {})}
      track={track}
    >
      <Outlet />
    </Shell>
  );
}
