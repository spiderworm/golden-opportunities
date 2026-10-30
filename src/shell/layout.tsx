import { Outlet } from "react-router";

import type { Route } from "./+types/layout";
import { Shell } from "./Shell";
import { getStationState } from "./station-state";
import { noopTrack } from "./track";

export function loader(_: Route.LoaderArgs) {
  return getStationState();
}

export default function ShellLayout({ loaderData }: Route.ComponentProps) {
  return (
    <Shell stationDate={loaderData.date} notifications={loaderData.alerts} track={noopTrack}>
      <Outlet />
    </Shell>
  );
}
