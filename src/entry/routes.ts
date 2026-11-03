import { type RouteConfig, route } from "@react-router/dev/routes";

/** The entry page's action (the page itself is served by the gate, gate.server.ts, at whatever URL was asked for). */
export default [route("entry", "entry/route.ts")] satisfies RouteConfig;
