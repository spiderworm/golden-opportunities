// How the engine starts our MCP server, and the secrets it gets.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ToolServer } from "../server/claudeCode.server.ts";
import { SERVER_NAME } from "./definitions.ts";

const PORT = /^\d{1,5}$/;

/**
 * The URL this server's /api/query answers at: a loopback IP literal (a hostname would be resolved, and the tool
 * server refuses one) and this server's own port, never from a request, whose Host header is the client's to choose
 * (#150). ORBITAL_QUERY_URL overrides it, and the tool server checks that too. The port, in order:
 * - ORBITAL_LISTEN_PORT: the dev server's actual address, recorded by vite.config.ts. Vite moves to 5174 when 5173
 *   is busy, and only the server knows where it ended up.
 * - PORT: `npm start` sets it (3000 unless it's set already), and react-router-serve listens there.
 * - Vite's 5173.
 * The host is 127.0.0.1 when the server listens on IPv4 only, else [::1]. Vite listens on [::1] here (measured
 * 30 Oct), and its address is ORBITAL_LISTEN_HOST. `npm start` passes react-router-serve HOST, 127.0.0.1 unless
 * ORBITAL_HOST says otherwise (David, 2 Nov: this computer only). A HOST that isn't an IP (a hostname) needs
 * ORBITAL_QUERY_URL.
 */
export function defaultQueryUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ORBITAL_QUERY_URL) return env.ORBITAL_QUERY_URL;
  const listening = PORT.test(env.ORBITAL_LISTEN_PORT ?? "") ? env.ORBITAL_LISTEN_PORT : undefined;
  const port = listening ?? (PORT.test(env.PORT ?? "") ? env.PORT : "5173");
  const bound = listening ? env.ORBITAL_LISTEN_HOST : env.HOST;
  const host = ["127.0.0.1", "0.0.0.0"].includes(bound ?? "") ? "127.0.0.1" : "[::1]";
  return `http://${host}:${port}/api/query`;
}

/**
 * The tool server's source file. It runs as its own process, from source, with this Node (native TypeScript
 * stripping), so the production build can't bundle it: from source (dev, tests) it's beside this module, and from
 * the build (build/server/index.js, which bundles this module) it's back in src/assistant/tools. Throws if neither
 * exists, so a missing file fails the question loudly rather than as a tool server that never starts.
 */
export function toolServerPath(moduleUrl: string | URL = import.meta.url): string {
  for (const candidate of ["./server.ts", "../../src/assistant/tools/server.ts"]) {
    const file = fileURLToPath(new URL(candidate, moduleUrl));
    if (existsSync(file)) return file;
  }
  throw new Error("The assistant's tool server (src/assistant/tools/server.ts) is missing.");
}

/** Runs from source with this Node (native TypeScript stripping); revisit when the app is hosted. */
export function orbitalToolServer(token: string, { pins = true, queryUrl = defaultQueryUrl() }: { pins?: boolean; queryUrl?: string } = {}): ToolServer {
  return {
    name: SERVER_NAME,
    command: process.execPath,
    args: [toolServerPath()],
    env: { ORBITAL_QUERY_TOKEN: token, ORBITAL_QUERY_URL: queryUrl, ORBITAL_PINS: pins ? "1" : "0" },
  };
}
