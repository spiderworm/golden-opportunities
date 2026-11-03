// "Share play data" for one visitor, when the game is deployed (Audit, #368). On a laptop the switch is the copy's
// own: one player, so it turns the server's analytics off or on for the whole process, as it always did. Deployed,
// many players share the process, so one's choice mustn't stop or resume the others': the switch sets a cookie for
// that browser instead, every request runs with its visitor's choice, and trackServer drops an opted-out visitor's
// events. Events outside any request (the server starting) are the copy's own and still go.
import { AsyncLocalStorage } from "node:async_hooks";
import type { MiddlewareFunction } from "react-router";

/** The visitor's choice, set by the switch on the deployed host: `off` stops their server events. */
export const SHARING_COOKIE = "ob_share";
const YEAR = 60 * 60 * 24 * 365;

const visitor = new AsyncLocalStorage<{ sharing: boolean }>();

/** Whether this request's visitor turned sharing off, from their cookie. */
export function visitorSharing(request: Request): boolean {
  const cookies = (request.headers.get("cookie") ?? "").split(";").map((c) => c.trim());
  return !cookies.includes(`${SHARING_COOKIE}=off`);
}

/** The cookie that keeps a visitor's choice. */
export const sharingCookie = (on: boolean, secure: boolean) =>
  `${SHARING_COOKIE}=${on ? "on" : "off"}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${YEAR}${secure ? "; Secure" : ""}`;

/** Runs fn as this request's visitor, so trackServer knows their choice. */
export const asVisitor = <T>(request: Request, fn: () => T): T =>
  visitor.run({ sharing: visitorSharing(request) }, fn);

/**
 * Runs fn with a choice made earlier: Dewey's lookups arrive from his tool server with no browser cookie, so they
 * carry the choice of the visitor whose question issued their token (Audit and Probe, #368).
 */
export const withSharing = <T>(sharing: boolean, fn: () => T): T => visitor.run({ sharing }, fn);

/** Whether server events may go now: false only inside a request whose visitor turned sharing off. */
export const visitorAllowsSharing = () => visitor.getStore()?.sharing ?? true;

/**
 * Root middleware: every request runs as its visitor. A streamed body (Dewey's answer) is read after the middleware
 * has returned, outside the request's context, so for a visitor who turned sharing off each read of it runs in their
 * context too (Probe, #368).
 */
export const visitorSharingMiddleware: MiddlewareFunction<Response> = async ({ request }, next) => {
  const store = { sharing: visitorSharing(request) };
  const response = await visitor.run(store, next);
  if (store.sharing || !response.body) return response;
  return new Response(inContext(response.body, store), response);
};

/** A stream whose every read, and so the code producing it, runs in this visitor's context. */
function inContext(body: ReadableStream<Uint8Array>, store: { sharing: boolean }) {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    pull: (controller) =>
      visitor.run(store, async () => {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      }),
    cancel: (reason) => reader.cancel(reason),
  });
}
