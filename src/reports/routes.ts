import { type RouteConfig, route } from "@react-router/dev/routes";

export default [route("reports", "reports/route.tsx")] satisfies RouteConfig;

/** Reports' data for panels on other pages: a resource route, outside the shell's layout. */
export const reportsApiRoutes = [route("api/reports", "reports/api.ts")] satisfies RouteConfig;
