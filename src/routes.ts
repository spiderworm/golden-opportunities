import { type RouteConfig, layout } from "@react-router/dev/routes";

import assistantRoutes from "./assistant/routes";
import investigateRoutes from "./investigate/routes";
import analyticsRoutes from "./platform/analytics/routes";
import { queryRoutes } from "./query/routes";
import settingsRoutes from "./settings/routes";
import stationRoutes from "./station/routes";

// Each feature lists its own routes; this file only composes them.
// Pages go inside the shell's layout; resource routes go outside it.
export default [
  layout("shell/layout.tsx", [...stationRoutes, ...investigateRoutes, ...settingsRoutes]),
  ...queryRoutes,
  ...assistantRoutes,
  ...analyticsRoutes,
] satisfies RouteConfig;
