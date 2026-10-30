// How the engine starts our MCP server, and the secrets it gets.

import { fileURLToPath } from "node:url";
import type { ToolServer } from "../server/claudeCode.server.ts";
import { SERVER_NAME } from "./definitions.ts";

/**
 * The URL this server's /api/query answers at, built from a loopback IP literal and this server's own port (PORT,
 * else Vite's 5173), never from a request. [::1], because Vite listens on [::1] only here (measured 30 Oct);
 * a hostname would be resolved, and the tool server refuses one. ORBITAL_QUERY_URL overrides it, and the tool
 * server checks that too.
 */
export function defaultQueryUrl(env: NodeJS.ProcessEnv = process.env): string {
  const port = /^\d{1,5}$/.test(env.PORT ?? "") ? env.PORT : "5173";
  return env.ORBITAL_QUERY_URL ?? `http://[::1]:${port}/api/query`;
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
