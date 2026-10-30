import { type RouteConfig, route } from "@react-router/dev/routes";

/** A resource route, so it sits outside the shell's layout. */
export default [route("api/assistant", "assistant/route.ts")] satisfies RouteConfig;
