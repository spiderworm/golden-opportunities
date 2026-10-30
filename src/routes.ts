import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("shell/layout.tsx", [
    index("station/route.tsx"),
    route("investigate", "investigate/route.tsx"),
  ]),
] satisfies RouteConfig;
