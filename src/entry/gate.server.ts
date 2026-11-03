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
  const page = pagePath(url);
  // A page's data or a form's post (".data", which a production build keeps in the URL), from a tab opened before
  // the agreement changed: reload the page itself, which is the entry page (Audit, #317).
  if (url.pathname.endsWith(".data")) return reloadDocument(page);
  if (isDocument(request)) {
    trackServer("entry_shown", {});
    return entryResponse(page);
  }
  // The same from a browser whose URL React Router has already normalized.
  if (request.method === "GET" && !url.pathname.startsWith("/api/")) throw redirectDocument(page);
  return new Response("Continue from the entry page first.", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": NO_INDEX },
  });
};

/**
 * The page a request is for, as the player would see it: React Router's data suffix ("/decide.data", "/_.data" for
 * the root) and its "_routes" parameter taken off, and one leading slash (as #310's closedDataResponse does).
 */
export function pagePath(url: URL): string {
  const pathname = url.pathname
    .replace(/^\/+/, "/")
    .replace(/\/_\.data$/, "/")
    .replace(/\.data$/, "");
  const search = new URLSearchParams(url.search);
  search.delete("_routes");
  return `${pathname}${search.size ? `?${search}` : ""}`;
}

/** React Router's reload-document redirect for a data request: the browser loads `to` as a page. */
function reloadDocument(to: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "X-Remix-Redirect": to,
      "X-Remix-Status": "302",
      "X-Remix-Reload-Document": "true",
      "Cache-Control": "no-store",
      "X-Robots-Tag": NO_INDEX,
    },
  });
}

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
  // Not the entry action, and not a page's data, which would land the player on raw turbo-stream (Audit, #317).
  if (at.origin !== ORIGIN || at.pathname === ENTRY_PATH || at.pathname.endsWith(".data"))
    return "/";
  // One leading slash: "/.//evil.example" resolves to the path "//evil.example", which a browser reads as another
  // site (Probe, #330).
  return `${at.pathname.replace(/^\/+/, "/")}${at.search}`;
}

/** A stand-in origin for resolving a path: anything off it is off this site. */
const ORIGIN = "http://entry.invalid";
