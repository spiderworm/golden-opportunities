import path from "node:path";
import { createAnalytics, type Analytics } from "@tellim/analytics/client";
import { deployed } from "@tellim/analytics/deployed";
import { fileStorage } from "./file-storage.server";
import { DATA_DIR, instanceId } from "./instance.server";
import { BUILD, GAME, VERSION, type Track } from "./track";

const KEY = "orbital-books-server";
const FLUSH_MS = 60_000;

/** Sending is off in tests and when ORBITAL_ANALYTICS=off; events are still logged on disk. */
export function sendingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ORBITAL_ANALYTICS !== "off" && env.NODE_ENV !== "test" && !env.VITEST;
}

let analytics: Analytics | undefined;

/**
 * The server's analytics: events from server-side features (queries, the
 * in-game agent's process). Its install ID is this copy's instance ID, so
 * server events and browser events from the same copy line up.
 */
export function serverAnalytics(): Analytics {
  if (analytics) return analytics;
  const storage = fileStorage(path.join(DATA_DIR, "analytics-server.json"));
  if (!storage.getItem(`${KEY}.install`)) storage.setItem(`${KEY}.install`, JSON.stringify(instanceId()));
  analytics = createAnalytics({
    game: GAME,
    key: KEY,
    endpoint: sendingEnabled() ? deployed.endpoint : undefined,
    build: BUILD,
    version: VERSION,
    platform: import.meta.env.DEV ? "serverdev" : "server",
    storage,
    env: { userAgent: `Node.js/${process.versions.node}`, webdriver: false, search: "" },
  });
  // No page lifecycle on the server, so flush on a timer of our own.
  setInterval(() => void analytics?.flush(), FLUSH_MS).unref();
  analytics.track("server_started", { node: process.versions.node });
  return analytics;
}

/** track() for server-side code. */
export const trackServer: Track = (event, props, options) => serverAnalytics().track(event, props, options);
