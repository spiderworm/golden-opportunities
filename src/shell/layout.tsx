import { Outlet } from "react-router";

import type { Route } from "./+types/layout";
import type { StationNotification } from "./NotificationsBell";
import { Shell } from "./Shell";
import { noopTrack } from "./track";

export function loader(_: Route.LoaderArgs) {
  // Placeholders until the simulation owns the clock and the Discover step owns
  // the alerts: the station sits just after Q4 2193, with the M1 alert waiting.
  const stationDate = "2194-01-04";
  const notifications: StationNotification[] = [
    {
      id: "q4-revenue-down",
      title: "Q4 revenue is down 41% on Q3",
      detail: "Find out what happened before the next quarter starts.",
      unread: true,
      to: "/investigate",
    },
  ];
  return { stationDate, notifications };
}

export default function ShellLayout({ loaderData }: Route.ComponentProps) {
  return (
    <Shell stationDate={loaderData.stationDate} notifications={loaderData.notifications} track={noopTrack}>
      <Outlet />
    </Shell>
  );
}
