import { type RouteConfig, route } from "@react-router/dev/routes";

/** The shell's resource routes (its pages' layout is composed in src/routes.ts). */
export default [route("alert/seen", "shell/alert-seen.ts")] satisfies RouteConfig;
