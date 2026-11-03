// Which browser requests are the game's own (David, 3 Nov 2026: "We do need to deploy this to AWS, actually.
// Today."). On this machine, a page served from localhost, 127.0.0.1 or [::1] whose Origin is that same origin, as
// always. Deployed, also a page from the one public origin the server is told, ORBITAL_PUBLIC_ORIGIN
// (`https://play.example.com`), exactly. A proxy (Caddy) ends TLS and forwards to the app over http
// with the original Host, so request.url says http while the browser's Origin says https: the public rule compares
// the Origin with the configured origin and the Host with its host, never with request.url's scheme, and never
// trusts X-Forwarded-* headers. Unset, nothing changes.

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/**
 * ORBITAL_PUBLIC_ORIGIN, checked: an https origin and nothing more (no path, query, fragment, credentials or
 * trailing slash), or null when unset. Anything else throws, so a misconfigured server fails at start-up instead of
 * refusing every player or, worse, accepting the wrong site.
 */
export function parsePublicOrigin(value: string | undefined): string | null {
  if (value === undefined || value === "") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `ORBITAL_PUBLIC_ORIGIN must be an https origin, like https://example.com: got ${value}`,
    );
  }
  if (url.protocol !== "https:" || url.origin !== value)
    throw new Error(
      `ORBITAL_PUBLIC_ORIGIN must be exactly an https origin, with no path or trailing slash: got ${value}`,
    );
  return value;
}

/** The deployed origin, read once at start-up. */
export const PUBLIC_ORIGIN = parsePublicOrigin(process.env.ORBITAL_PUBLIC_ORIGIN);

/** Sec-Fetch-Site, where a browser sends it, says the request came from the page's own origin. */
const sameSite = (request: Request) => {
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
};

/** The rule on this machine, as it always was: a loopback host, and the Origin is the request's own origin. */
export function isLoopbackBrowserRequest(request: Request): boolean {
  const url = new URL(request.url);
  return (
    LOOPBACK.includes(url.hostname) &&
    request.headers.get("origin") === url.origin &&
    sameSite(request)
  );
}

/**
 * The deployed rule: the Origin is the configured origin exactly, the Host is its host, and the browser says
 * same-origin (or nothing). A look-alike host, http for https, another port or a missing Origin is refused.
 */
export function isPublicOriginRequest(request: Request, origin = PUBLIC_ORIGIN): boolean {
  if (!origin) return false;
  return (
    request.headers.get("origin") === origin &&
    new URL(request.url).host === new URL(origin).host &&
    sameSite(request)
  );
}

/** Whether a request is for the deployed host (as the proxy forwards it), where only the deployed rule applies. */
export const forPublicHost = (request: Request, origin = PUBLIC_ORIGIN) =>
  !!origin && new URL(request.url).host === new URL(origin).host;

/** A same-origin browser request to the game: on this machine, or from the deployed origin. */
export const isSameOriginBrowserRequest = (request: Request) =>
  isLoopbackBrowserRequest(request) || isPublicOriginRequest(request);

/**
 * Whether the page was served over https, for a cookie's Secure flag: request.url's own scheme, or, behind the
 * proxy that ended TLS, a request for the deployed host.
 */
export function servedOverHttps(request: Request, origin = PUBLIC_ORIGIN): boolean {
  const url = new URL(request.url);
  return url.protocol === "https:" || (!!origin && url.host === new URL(origin).host);
}
