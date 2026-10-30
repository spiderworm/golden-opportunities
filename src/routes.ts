import { type RouteConfig, index } from "@react-router/dev/routes";
import { queryRoutes } from "./query/routes";

export default [index("station/route.tsx"), ...queryRoutes] satisfies RouteConfig;
