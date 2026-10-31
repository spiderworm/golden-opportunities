# M1 browser guarantee

After installing dependencies and Playwright Chromium/WebKit (`npx playwright install chromium webkit`), run:

```sh
npm run test:e2e -- --workers=2
# Only the full game loop:
npm run test:e2e -- e2e/game/m1-loop.spec.ts --workers=2
```

The config builds production assets and starts a new server on 127.0.0.1:5187. It refuses to reuse an existing listener. `e2e/server.mjs` allocates a new temporary data directory for each run, overrides ORBITAL_DATA_DIR, disables server analytics, and forces the fake assistant provider. It never reads or deletes a developer's .data. Graceful shutdown removes the temporary directory after the server exits (an OS-level force kill can leave it behind).

Both browser contexts use the same mute/external-request-blocking fixture. Initial and bookmarked navigations include `analytics-test=1`; automated-browser detection and blocked external requests also prevent browser analytics during link navigation. No real-model calls or data seeding are involved.

The test follows the station alert, earns A with genre/quarter and average-order-value views, deliberately selects a weekday comparison for B, and opens three real 15% title/month drilldowns for C. It selects two moves and confirms through the UI. The result checks the minimum of the four displayed scores, binding rows and boss speaker, certificates, and three found discoveries. Assertions use each random save's actual report rather than a hardcoded seed or grade.

A separate context starts unplayed even after the first player commits. Its two promotion months are a near-miss for C. It holds course and receives three hints rather than inheriting any discoveries. Reloads verify both results persist independently. Views are opened with the screen's bookmarkable URLs where a canvas click would be brittle; plans are never submitted through an API shortcut.

Firefox remains disabled for the existing macOS profile-folder launch failure documented in the config. This is a playability test, not a performance benchmark or a real-provider assistant evaluation.
