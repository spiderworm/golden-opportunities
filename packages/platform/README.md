# @tellim/platform

Who an app is, said once and given to every studio package (David, 31 Oct
2026). Until now each package asked for a name of its own: Waddleberg was
`game: "waddleberg"` to analytics and the store, `key: "cubeberg"` to its saved
data, and `/cubeberg/` on the web.

| Part | What it does |
|---|---|
| `src/app/apps.ts` | The studio's apps, by id: the one list, so no two apps claim an id or keep their data under one prefix, however many share a host. Add an app here first. An id is for good; a rename changes the name only. |
| `src/app/app.ts` | `defineApp({ id, version, build, home })`: the app, frozen. Its name and its older storage prefix (Waddleberg's `cubeberg`) come from the list. `storageKey(name)` and `channelName(scope)` give keys and channels of its own. An id not on the list is warned about in the console, and still works. |
| `src/environment/` | Where the app is running: Google Play's test robots (`testLab(userAgent)`, from the mark `packages/analytics/android/TestLab.md` adds to the Android app's WebView) and automated runs (`automation()`: `navigator.webdriver` or `?analytics-test=1`, kept for the tab). Moved from `@tellim/analytics` (1 Nov 2026), which still re-exports it. |
| `src/presence/` | `createPresence(app)`: the studio's tabs open on this host, this app's (`mine()`) and others' (`peers()`), over one channel they all share. The address is only checked here, never the identity: one id at two homes is two apps claiming it, and the console says so. A browser shows a page only its own host's tabs. |

## Using it

```ts
import { defineApp } from "@tellim/platform/app";
export const app = defineApp({ id: "pizza", version: __VERSION__, build: __BUILD_ID__, home: import.meta.env.BASE_URL });
```

Then give `app` to the packages: `createMusic({ app, ... })`. Their own `key` / `game` options still
work while the games move over.

## Coming

- Most apps take it through `@tellim/kit` (`startApp(app, { form })`), with music and analytics.
