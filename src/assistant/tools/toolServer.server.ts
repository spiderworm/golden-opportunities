// How the engine starts our MCP server, and the secrets it gets. Frank's getQueryToken() lands with
// src/query/access.server.ts; until then the caller passes the token in.

import { fileURLToPath } from "node:url";
import type { ToolServer } from "../server/claudeCode.server.ts";
import { SERVER_NAME } from "./definitions.ts";

/** Runs from source with this Node (native TypeScript stripping); revisit when the app is hosted. The default URL
 * says localhost, not 127.0.0.1: Vite listens on [::1] only here (measured 30 Oct). */
export function orbitalToolServer(token: string, { pins = true, queryUrl = process.env.ORBITAL_QUERY_URL ?? "http://localhost:5173/api/query" }: { pins?: boolean; queryUrl?: string } = {}): ToolServer {
  return {
    name: SERVER_NAME,
    command: process.execPath,
    args: [fileURLToPath(new URL("./server.ts", import.meta.url))],
    env: { ORBITAL_QUERY_TOKEN: token, ORBITAL_QUERY_URL: queryUrl, ORBITAL_PINS: pins ? "1" : "0" },
  };
}
