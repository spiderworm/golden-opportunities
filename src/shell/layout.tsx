import { gameSessionMiddleware } from "~/game/session.server";
import { Outlet, useFetcher } from "react-router";

import type { Route } from "./+types/layout";
import { Shell } from "./Shell";
import { getStationState } from "./station-state";
import { track } from "~/platform/analytics/analytics.client";

export const middleware: Route.MiddlewareFunction[] = [gameSessionMiddleware];

export function loader({ request }: Route.LoaderArgs) {
  return getStationState(request);
}

export default function ShellLayout({ loaderData }: Route.ComponentProps) {
  const seen = useFetcher();
  return (
    <Shell
      stationDate={loaderData.date}
      notifications={loaderData.alerts}
      // The Shell shows only Q1's memo so far; Q2's arrives with its own copy (Sage).
      standingOrder={loaderData.standingOrder.quarter === "2194-Q1" ? loaderData.standingOrder : undefined}
      onAlertSeen={() => seen.submit(null, { method: "post", action: "/alert/seen" }).catch(() => {})}
      track={track}
    >
      <Outlet />
    </Shell>
  );
}
