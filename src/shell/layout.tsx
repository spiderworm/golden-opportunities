import { gameSessionMiddleware } from "~/game/session.server";
import { useEffect, useRef, type ReactNode } from "react";
import { Outlet, isRouteErrorResponse, useFetcher, useLocation, useRevalidator, useRouteLoaderData } from "react-router";

import type { Route } from "./+types/layout";
import type { loader as rootLoader } from "../root";
import { Shell } from "./Shell";
import { getStationState, type StationState } from "./station-state";
import { ReplayMismatch, replayMismatchOf } from "./replay-mismatch";
import { revalidateAbovePage } from "~/platform/revalidate";
import { track } from "~/platform/analytics/analytics.client";
import { flushQueryCacheStats, pageOf, queryCache } from "~/platform/query-cache.client";

export const middleware: Route.MiddlewareFunction[] = [gameSessionMiddleware];

export function loader({ request }: Route.LoaderArgs) {
  return getStationState(request);
}

export const shouldRevalidate = revalidateAbovePage;

function Frame({ station, children }: { station: StationState; children: ReactNode }) {
  const seen = useFetcher();
  return (
    <Shell
      stationDate={station.date}
      notifications={station.alerts}
      standingOrder={station.standingOrder}
      q1={station.q1}
      onAlertSeen={() => seen.submit(null, { method: "post", action: "/alert/seen" }).catch(() => {})}
      track={track}
    >
      {children}
    </Shell>
  );
}

export default function ShellLayout({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation();
  // In render, before any child's effects run, so a pin fetched on mount is filed under this version (Frank's
  // note on #189). Only in the browser: the cache module is client-only. Idempotent: setting the version it
  // already has keeps the cache, so a re-render or React's double render in development changes nothing.
  if (typeof document !== "undefined") queryCache.setVersion(loaderData.dataVersion);

  // The page looks again when an answer shows its data is out of date (a plan committed in another tab), and when
  // the player comes back to this tab or window, so it learns the new version before serving anything cached
  // (Audit, #191). Two windows side by side never hide each other, so focus counts too.
  const revalidator = useRevalidator();
  const revalidate = useRef(revalidator.revalidate);
  revalidate.current = revalidator.revalidate;
  useEffect(() => {
    const stop = queryCache.onStale(() => void revalidate.current());
    const shown = () => {
      if (document.visibilityState === "visible") void revalidate.current();
    };
    const focused = () => void revalidate.current();
    document.addEventListener("visibilitychange", shown);
    window.addEventListener("focus", focused);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", shown);
      window.removeEventListener("focus", focused);
    };
  }, []);

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
    <Frame station={loaderData}>
      <Outlet />
    </Frame>
  );
}

/**
 * A page's error, inside the shell, so the navigation stays (Plot, #198). A save that no longer replays gets its
 * own screen, with Start over; anything else reads as the root's would. If the shell's own loader failed, there's
 * no shell to keep, and the error shows alone.
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const station = useRouteLoaderData<typeof loader>("shell/layout");
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const quarter = replayMismatchOf(error);
  const content = quarter ? (
    <ReplayMismatch quarter={quarter} instance={root?.instance} />
  ) : (
    <main>
      <h1>{isRouteErrorResponse(error) && error.status === 404 ? "Not found" : "Something went wrong"}</h1>
      <p>{isRouteErrorResponse(error) && error.status === 404 ? "The requested page could not be found." : "An unexpected error occurred."}</p>
    </main>
  );
  return station ? <Frame station={station}>{content}</Frame> : content;
}
