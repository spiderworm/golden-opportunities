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

/** Whether server events may go now: false only inside a request whose visitor turned sharing off. */
export const visitorAllowsSharing = () => visitor.getStore()?.sharing ?? true;

/** Root middleware: every request runs as its visitor. */
export const visitorSharingMiddleware: MiddlewareFunction<Response> = ({ request }, next) =>
  asVisitor(request, next);
