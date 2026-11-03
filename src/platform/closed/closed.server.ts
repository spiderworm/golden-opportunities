import { existsSync } from "node:fs";
import path from "node:path";
import type { MiddlewareFunction } from "react-router";

import { trackServer } from "../analytics/analytics.server";
import { DATA_DIR } from "../analytics/instance.server";
import { CLOSED_PAGE } from "./closed-page";

// Closed mode (David, 3 Nov 2026): "If things start looking spikey, we want a
// one-command, a shell script, to run locally, to switch the whole thing over
// to a simple, static, 'sorry we can't do that for you right now' kind of page."
// `npm run close` makes the flag file and `npm run open` removes it; the server
// looks for it at most once a second, so switching needs no restart.

export const CLOSED_FILE = path.join(DATA_DIR, "closed");
const CHECK_MS = 1000;
/** Seconds a browser or crawler is asked to wait before trying again. */
export const RETRY_AFTER = 300;

let checkedAt = -Infinity;
let closed: boolean | undefined;

/** Whether the game is closed: ORBITAL_CLOSED=1, or the flag file exists. */
export function isClosed(now = Date.now()): boolean {
  if (now - checkedAt < CHECK_MS && closed !== undefined) return closed;
  checkedAt = now;
  const next = process.env.ORBITAL_CLOSED === "1" || existsSync(CLOSED_FILE);
  // One event when it switches (or when the server starts closed); none per request.
  if (next !== closed && (closed !== undefined || next)) {
    trackServer("closed_mode_changed", { closed: next });
  }
  closed = next;
  return closed;
}

/** For tests: forget the last check, so the next one reads the flag again. */
export function resetClosedCheck() {
  checkedAt = -Infinity;
  closed = undefined;
}

export function closedResponse(): Response {
  return new Response(CLOSED_PAGE, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": String(RETRY_AFTER),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      // The page is one file: nothing it could load, and no scripts.
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    },
  });
}

/**
 * A client navigation or form asks for `<path>.data`. The closed page as its
 * answer would show the game's error screen, so it gets React Router's
 * reload-document redirect instead: the browser loads the page itself, and gets
 * the closed page.
 */
export function closedDataResponse(url: URL): Response {
  // One leading slash, so "//elsewhere.data" can't send the browser off the site.
  const pathname = url.pathname
    .replace(/^\/+/, "/")
    .replace(/_\.data$/, "")
    .replace(/\.data$/, "");
  const search = new URLSearchParams(url.search);
  search.delete("_routes");
  const query = search.size ? `?${search}` : "";
  return new Response(null, {
    status: 204,
    headers: {
      "X-Remix-Redirect": pathname + query,
      "X-Remix-Status": "302",
      "X-Remix-Reload-Document": "true",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * The root route's middleware: while closed, every page, resource route and
 * data request is answered here, before any loader or action runs. Static
 * files never reach React Router, so they're still served.
 */
export const closedMiddleware: MiddlewareFunction<Response> = ({ request }, next) => {
  if (!isClosed()) return next();
  const url = new URL(request.url);
  return url.pathname.endsWith(".data") ? closedDataResponse(url) : closedResponse();
};
