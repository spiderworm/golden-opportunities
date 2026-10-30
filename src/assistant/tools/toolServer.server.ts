// How the engine starts our MCP server, and the secrets it gets. Frank's getQueryToken() lands with
// src/query/access.server.ts; until then the caller passes the token in.

import { fileURLToPath } from "node:url";
import type { ToolServer } from "../server/claudeCode.server.ts";
import { SERVER_NAME } from "./definitions.ts";

/** Runs from source with this Node (native TypeScript stripping); revisit when the app is hosted. */
export function orbitalToolServer(token: string, queryUrl = process.env.ORBITAL_QUERY_URL ?? "http://127.0.0.1:5173/api/query"): ToolServer {
  return {
    name: SERVER_NAME,
    command: process.execPath,
    args: [fileURLToPath(new URL("./server.ts", import.meta.url))],
    env: { ORBITAL_QUERY_TOKEN: token, ORBITAL_QUERY_URL: queryUrl },
  };
}
