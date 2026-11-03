import { type RouteConfig, route } from "@react-router/dev/routes";

/** The player's saved segments, for Investigate's Segment menu: a resource route, outside the shell's layout. */
export const segmentsApiRoutes = [route("api/segments", "segments/api.ts")] satisfies RouteConfig;
