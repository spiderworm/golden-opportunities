import { useRouteLoaderData } from "react-router";

import type { ShellHandle } from "~/shell/Shell";
import type { loader as shellLoader } from "~/shell/layout";
import type { Route } from "./+types/route";
import { StationView } from "./StationView";

export const handle: ShellHandle = { title: "Station" };

// TODO(game-state): a played quarter sets these once Frank's game state
// lands. Until then the shop is quiet after the Q4 slump, and the featured
// title is the first of the Q1 Books of the Month the previous manager
// scheduled (docs/design/m1-slice.md, section 3).
const BUSYNESS = 0.35;
const FEATURED_TITLE = "The Mallemaroking";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Orbital Books" },
    { name: "description", content: "Run a bookstore in orbit, and find out what your data is telling you." },
  ];
}

export default function Station() {
  // The shell owns the Commerce Office's alerts; the station only reflects them.
  const shell = useRouteLoaderData<typeof shellLoader>("shell/layout");
  const alert = shell?.alerts.some((a) => a.unread) ?? false;
  return <StationView busyness={BUSYNESS} featuredTitle={FEATURED_TITLE} alert={alert} />;
}
