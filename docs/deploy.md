# Deploying Orbital Books

David (3 Nov 2026): "We do need to deploy this to AWS, actually. Today."

The game is built to run on one machine and refuse browser requests from anywhere else: every gate that takes a
browser's request (queries, game moves, the plan form, Dewey's questions, the Share play data switch) checks that the
page came from this same server. Deployed behind a proxy, it also needs to know its one public address.

## The setting

`ORBITAL_PUBLIC_ORIGIN` is the public origin players use, exactly: `https://21pqa9rxuayp.tellimgames.com`. It must be
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

## The proxy

Caddy ends TLS and forwards to the app on `http://127.0.0.1:3000`, keeping the browser's `Host`. So the app sees
`http://21pqa9rxuayp.tellimgames.com/…` while the browser's `Origin` says `https://…`: the gates compare the Origin
with the configured origin, never with the request's own scheme, and they never read `X-Forwarded-*` headers.

- Keep the app bound to `127.0.0.1` (`HOST=127.0.0.1 npm start`), so only Caddy reaches it.
- Keep Caddy forwarding the original `Host` (its default).
- Dewey's tool server still calls the app on its loopback address (`ORBITAL_QUERY_URL`), with its bearer token.

## Running it

```sh
npm ci && npm run build
ORBITAL_PUBLIC_ORIGIN=https://21pqa9rxuayp.tellimgames.com HOST=127.0.0.1 PORT=3000 npm start
```

`npm run close` and `npm run open` switch the game to its closed page and back, as on a laptop.
