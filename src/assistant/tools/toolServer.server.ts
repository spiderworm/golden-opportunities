// How the engine starts our MCP server, and the secrets it gets.

import { fileURLToPath } from "node:url";
import type { ToolServer } from "../server/claudeCode.server.ts";
import { SERVER_NAME } from "./definitions.ts";

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * The URL this server's /api/query answers at, always a loopback IP literal: a hostname would be resolved, and the
 * tool server refuses one. ORBITAL_QUERY_URL overrides it, and the tool server checks that too. The port is this
 * server's own:
 * - PORT, when it's set: the server listens there.
 * - Otherwise the port of the question's own request. `npm start` without PORT listens on the first free port from
 *   3000, and the app can't see which. Only a loopback request counts, and the assistant answers only same-origin
 *   requests from this machine (#26), so this is the port the player's browser reached this server on.
 * - Otherwise Vite's 5173.
 * The host is 127.0.0.1 when the request used it, else [::1]: Vite listens on [::1] only here (measured 30 Oct),
 * and react-router-serve on every interface (measured 31 Oct).
 */
export function defaultQueryUrl(env: NodeJS.ProcessEnv = process.env, request?: Request): string {
  if (env.ORBITAL_QUERY_URL) return env.ORBITAL_QUERY_URL;
  const own = request ? new URL(request.url) : null;
  const local = own && own.protocol === "http:" && LOOPBACK_HOSTS.includes(own.hostname) ? own : null;
  const port = /^\d{1,5}$/.test(env.PORT ?? "") ? env.PORT : local ? local.port || "80" : "5173";
  const host = !/^\d{1,5}$/.test(env.PORT ?? "") && local?.hostname === "127.0.0.1" ? "127.0.0.1" : "[::1]";
  return `http://${host}:${port}/api/query`;
}

/** Runs from source with this Node (native TypeScript stripping); revisit when the app is hosted. */
export function orbitalToolServer(token: string, { pins = true, queryUrl = defaultQueryUrl() }: { pins?: boolean; queryUrl?: string } = {}): ToolServer {
  return {
    name: SERVER_NAME,
    command: process.execPath,
    args: [fileURLToPath(new URL("./server.ts", import.meta.url))],
    env: { ORBITAL_QUERY_TOKEN: token, ORBITAL_QUERY_URL: queryUrl, ORBITAL_PINS: pins ? "1" : "0" },
  };
}
