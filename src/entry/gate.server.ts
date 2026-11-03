import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { redirectDocument, type MiddlewareFunction } from "react-router";

import { trackServer } from "~/platform/analytics/analytics.server";
import { hasAgreed } from "./cookie";
import { EntryPage } from "./EntryPage";

/** Every response asks not to be indexed (David's "not share this site externally"); public/robots.txt agrees. */
export const NO_INDEX = "noindex, nofollow";

/** The entry page's own action, which must get through before the player has agreed. */
export const ENTRY_PATH = "/entry";

/** Dewey's tool server asks the query API for figures with its own bearer token, never the player's cookies. */
const QUERY_PATH = "/api/query";

/**
 * The entry gate (David, 3 Nov 2026), as root middleware: until the player has agreed, any page they ask for is
 * the entry page instead, at the same URL, so no loader runs and nothing of the app loads (no shell, no music, no
 * 3D). Static files (public/, the build's assets, privacy.html) are served before the app and never reach it.
 */
export const entryGate: MiddlewareFunction<Response> = async ({ request }, next) => {
  const url = new URL(request.url);
  if (
    hasAgreed(request.headers.get("Cookie")) ||
    url.pathname === ENTRY_PATH ||
    isTool(request, url)
  ) {
    return noIndex(await next());
  }
  if (isDocument(request)) {
    trackServer("entry_shown", {});
    return entryResponse(`${url.pathname}${url.search}`);
  }
  // A page's data, from a browser tab opened before the agreement changed: load the page itself, which is the
  // entry page. React Router answers a data request's redirect with a reload, not another request.
  if (request.method === "GET" && !url.pathname.startsWith("/api/"))
    throw redirectDocument(`${url.pathname}${url.search}`);
  return new Response("Continue from the entry page first.", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": NO_INDEX },
  });
};

/** Dewey's tool server: the query API checks the token itself (src/query/access.server.ts). */
function isTool(request: Request, url: URL): boolean {
  return (
    url.pathname === QUERY_PATH &&
    (request.headers.get("Authorization") ?? "").startsWith("Bearer ")
  );
}

/**
 * A page, as against the app's own data requests and API calls. A browser says which with Sec-Fetch-Dest; a client
 * that sends none (curl, a test runner's readiness check) asking for anything but the API gets the page too, since
 * redirecting it to the page it asked for would loop.
 */
export function isDocument(request: Request): boolean {
  // Never a POST, with or without Sec-Fetch-Dest (an old browser's form): that falls to the gate's 403.
  if (request.method !== "GET") return false;
  const dest = request.headers.get("Sec-Fetch-Dest");
  if (dest) return dest === "document";
  return !new URL(request.url).pathname.startsWith("/api/");
}

export function entryResponse(to: string): Response {
  const html = `<!DOCTYPE html>${renderToStaticMarkup(createElement(EntryPage, { to }))}`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": NO_INDEX,
    },
  });
}

function noIndex(response: Response): Response {
  try {
    response.headers.set("X-Robots-Tag", NO_INDEX);
  } catch {
    // An immutable response (a redirect made by Response.redirect) keeps its own headers.
  }
  return response;
}

/** Where Continue goes: the page the player asked for, on this site only. */
export function safeReturn(to: FormDataEntryValue | null): string {
  // Control characters out first: browsers drop a tab or line break from a URL before resolving it, so
  // "/\t/evil.example" would land on //evil.example (Chart, #317). Backslashes too: browsers read them as slashes.
  if (typeof to !== "string" || !to.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(to))
    return "/";
  // Then wherever it resolves must still be this site.
  const at = new URL(to, ORIGIN);
  if (at.origin !== ORIGIN || at.pathname === ENTRY_PATH) return "/";
  return `${at.pathname}${at.search}`;
}

/** A stand-in origin for resolving a path: anything off it is off this site. */
const ORIGIN = "http://entry.invalid";
