import { gameSessionMiddleware } from "~/game/session.server";
import { Outlet } from "react-router";

import type { Route } from "./+types/layout";
import { Shell } from "./Shell";
import { getStationState } from "./station-state";
import { track } from "~/platform/analytics/analytics.client";

export const middleware: Route.MiddlewareFunction[] = [gameSessionMiddleware];

export function loader({ request }: Route.LoaderArgs) {
  return getStationState(request);
}

export default function ShellLayout({ loaderData }: Route.ComponentProps) {
  return (
    <Shell stationDate={loaderData.date} notifications={loaderData.alerts} track={track}>
      <Outlet />
    </Shell>
  );
}
