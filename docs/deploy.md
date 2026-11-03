# Deploying Orbital Books

David (3 Nov 2026): "We do need to deploy this to AWS, actually. Today."

The game is built to run on one machine and refuse browser requests from anywhere else: every gate that takes a
browser's request (queries, game moves, the plan form, Dewey's questions, the Share play data switch) checks that the
page came from this same server. Deployed behind a proxy, it also needs to know its one public address.

## The setting

`ORBITAL_PUBLIC_ORIGIN` is the public origin players use, exactly, for example `https://play.example.com`. It must be
https, with no path, query or trailing slash. The server checks it at start-up and won't start if it's wrong. Unset,
the game behaves exactly as it does on a laptop.

With it set, a browser request is the game's own when, as before, it's from a loopback page with its own Origin, or
when:

- its `Origin` header is the configured origin, exactly (no look-alike host, no http, no other port);
- its `Host` is the configured origin's host; and
- `Sec-Fetch-Site` is `same-origin`, or absent.

A request with no Origin, a cross-site one, or one for another Host is refused, as on a laptop
(`src/platform/origin.server.ts`, tested in `origin.server.test.ts`). Session and entry cookies are marked `Secure`
on the deployed host.

**Share play data** is each player's own when deployed (Audit, #368): the switch sets an `ob_share` cookie for that
browser, and the server drops that visitor's events, instead of turning the whole server's analytics off or on for
everyone (`visitor-sharing.server.ts`).

## The proxy

Caddy ends TLS and forwards to the app on `http://127.0.0.1:3000`, keeping the browser's `Host`. So the app sees
`http://play.example.com/…` while the browser's `Origin` says `https://…`: the gates compare the Origin
with the configured origin, never with the request's own scheme, and they never read `X-Forwarded-*` headers.

- Keep the app bound to `127.0.0.1`, so only Caddy reaches it: `npm start` does by default (`ORBITAL_HOST`, which
  defaults to `127.0.0.1`). With the setting on, the loopback rule still applies too, which is harmless only while
  nothing but Caddy can reach the port (Sage, #368).
- Keep Caddy forwarding the original `Host` (its default).
- Dewey's tool server still calls the app on its loopback address (`ORBITAL_QUERY_URL`), with its bearer token.

## Building it

React Router checks every action (a page's form or fetcher posting to a route) against the request's own origin, and
behind the proxy that's http against the browser's https, so without help it refuses them all with a bare `400 Bad
Request` before the game's gates run (David saw `POST /alert/seen.data 400`). `react-router.config.ts` names the
deployed host in `allowedActionOrigins`, read from `ORBITAL_PUBLIC_ORIGIN` **when the server is built**, so build it
with the setting it will run with. The game's own gates still require the exact https origin.

## Running it

```sh
npm ci && ORBITAL_PUBLIC_ORIGIN=https://play.example.com npm run build
ORBITAL_PUBLIC_ORIGIN=https://play.example.com PORT=3000 npm start
```

`npm run close` and `npm run open` switch the game to its closed page and back, as on a laptop.
