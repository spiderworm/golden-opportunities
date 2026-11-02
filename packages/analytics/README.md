# @tellim/analytics

The studio's game analytics, shared by every game (David, 22 Oct 2026: "should
also be done in a way that can be re-used and useful for other games we
build"). How We Build, principle 3: one `track(event, props)`, what happened
and never content, recorded on the device first.

| Part | What it does |
|---|---|
| `src/client/` | `createAnalytics()`: `track()`, the on-device log, the outbox that sends batches to the endpoint, the player's on/off switch (`sharing`, `setSharing`), and `app_shown`/`app_hidden` events. |
| `src/device/` | `deviceProps()`: GPU, model, Android version, memory, cores and screen, never the full user agent. `createAnalytics` sends it as a `device` event once per startup. |
| `src/environment/` | Where the game runs: Google Play's test robots (labeled `testlab`, see `android/TestLab.md`) and automated runs (`navigator.webdriver` or `?analytics-test=1`: nothing sent). Moved to `@tellim/platform/environment` (1 Nov 2026); this path re-exports it. |
| `android/TestLab.md` | The few lines each Android app's `MainActivity` needs so Play's test robots are labeled. |
| `android/StudioId.md` | The TellimStudio plugin (Android's app set ID, later the iPhone's identifierForVendor) that `link: true` uses to tie one player's play together across Tellim games. |
| `src/checkin/` | `createCheckin()`: now and then, at a natural pause, "How's <game> going?" 👍 😐 👎, then a reason to tap. Never a store-rating prompt. |
| `src/ingest/` | The endpoint: a Lambda (`handler.cjs`) that keeps each good batch in a private S3 bucket, behind CloudFront with an edge function (`edge.js`) and a firewall (`waf.ts`); its CloudFormation stack (`stack.ts`). `deployed.ts` says where it is. |
| `src/report/` | `fetch.ts` brings a game's batches down to the Mac; `report.ts` turns them into players (each with a made-up name, `placeholderName()`: "Patient Beluga", never shown in a game), sessions, times of day, retention, who's stopped, and the game's own `signals` for why. |

## Adding it to a game

1. `npm install --save "@tellim/analytics@file:../../packages/analytics"`, from the game's folder.
2. Make the game's `platform/analytics/track.ts` (see `prototypes/cubeberg/src/platform/analytics/track.ts`):
   ```ts
   const analytics = createAnalytics({ game: "slice-shift", key: "pizza", endpoint: dev ? undefined : deployed.endpoint, build, platform });
   export const track = analytics.track;
   ```
   Or pass the app instead (`@tellim/platform`'s `defineApp()`, read structurally): `createAnalytics({ app, endpoint, platform })`
   takes `game` from `app.id`, `key` from `app.storagePrefix` (else `app.id`), and `build` and `version` from the app.
   Options given explicitly still win, e.g. Pizza's `key: local ? "pizza.test" : "pizza"`.
   Pass `gl: () => renderer.getContext()` (the game's own WebGL context) so the device event has the GPU.
   Features call `track()` and nothing else.

   Every game then gets, without code of its own (David, 27 Oct 2026: shared logic lives here, so all games benefit):
   a `device` event once per startup; Play's test robots sending as platform `testlab` (left out of reports,
   never dropped); automated runs sending nothing, in a log of their own; events cleaned to what the endpoint
   takes; the log from before sending began sent once.
   Held events (David, 30 Oct 2026, a knowing exception to "never content"): `track(e, props, { hold: "agent_text" })`
   keeps an event on the device only, in its own store (at most 1000 a class, apart from the log), sending nothing.
   `release("agent_text")` sends them later with their own time and running number (not while sharing is off);
   `held(class)` reads them, `discard(class)` deletes them. A held string may run to 7000 characters, kept in
   pieces the endpoint takes (`text`, `text_2`, …); `joined(p, "text")` in `src/report` puts it back together.
   One player across Tellim games (David, 1 Nov 2026): `link: true` sends a `linked` event once per startup,
   `{ studio, source }`. On Android the id is the app set ID and on iPhone the identifierForVendor, both
   from the app's TellimStudio plugin (`android/StudioId.md`). On the web it's one id shared by the
   studio's games on the site. The report then names the player from it, the same in every game.
   Turn it on only in the build whose privacy policy says so.
3. Put a "Share play data" switch in the game's menu (`sharing()` / `setSharing()`), and show the install id (`install()`) in its diagnostics.
4. Android: add `android/TestLab.md`'s lines to `MainActivity`.
5. Add the game's name to the stack's `Games` parameter and deploy it again (below). The endpoint refuses games it doesn't know.
6. Update the game's privacy policy and its Play Data Safety form before the build that sends ships (Waddleberg's `privacy.html` is the model).
7. Optionally, a check-in (`createCheckin`) and a `signals(lastSession, events)` function for the report; then a `report` script like `prototypes/cubeberg/tools/report.ts`.

## The endpoint

Stack `tellim-analytics` (us-west-1), with its firewall in stack `tellim-analytics-waf` (us-east-1,
where CloudFront's WAF must be). Hardened on 22 Oct 2026 after Cube pointed out that a public URL
that writes could be flooded:

- The Lambda's function URL is AWS_IAM: only the CloudFront distribution may call it, signing each
  request (an origin access control). A POST's signature needs the body's SHA-256, so the client sends
  it as `x-amz-content-sha256`.
- The edge function answers the CORS preflight and lets through only a signed `POST /`.
- WAF blocks bodies over 16 KB and more than 300 requests in five minutes from one address.
  The client keeps batches under 12 KB.
- At most 3 copies of the Lambda run at once, a ceiling on cost. Above that, CloudFront answers
  with an error and the client keeps the batch for later.
- The AWS budget `game-endpoints` ($15 a month across Lambda, S3, CloudFront and WAF) emails
  tellim.games@gmail.com if the month's spend goes over, or is forecast to.
- No request is proved genuine. Anyone who reads a game's code can send plausible events slowly enough,
  so the report should treat an install with impossible volumes as noise.

Batches land at
`s3://<bucket>/events/game=<game>/dt=<day>/<ms>-<uuid>.json.gz`, one batch an object,
`{ rt, game, install, platform, build, tz, events: [{ t, s, n, e, p }] }`, and expire after two years.
No IP address or request is logged. To change it:

```sh
node src/ingest/stack.ts > /tmp/stack.json
aws cloudformation deploy --region us-west-1 --stack-name tellim-analytics \
  --template-file /tmp/stack.json --capabilities CAPABILITY_IAM \
  --parameter-overrides Games=waddleberg,slice-shift   # WebAclArn stays as it was
# the firewall, if its rules change:
node src/ingest/waf.ts > /tmp/waf.json
aws cloudformation deploy --region us-east-1 --stack-name tellim-analytics-waf --template-file /tmp/waf.json
```

## Tests

`npm test` here (Node's own runner). `npm install` first for `fetch.ts`'s AWS SDK.
