# Analytics: the M4 check

*Frank, 31 October 2026, against `main` at `9e952f9`. Reviewers: Audit and Sage.*

The goal: "Analytics are complete, with an instance ID; agent text is held on the device; the privacy page and sharing switch are in place." This doc checks each part against the code.

| Check | Result |
| --- | --- |
| Every event the game records is described accurately on the privacy page (`public/privacy.html`) | **Yes, after this PR.** All 87 fit what the page describes. Before this PR, the page left out some device and server fields; it now names them. |
| Held agent text never leaves the device | **Yes** |
| The sharing switch stops both browser and server sending | **Yes**, and it survives a server restart |
| Automated browsers never send | **Yes, from the browser.** The server's own events need `ORBITAL_ANALYTICS=off`, which the e2e server sets (see "Known limits") |
| `.data/instance.json` is created, and git-ignored | **Yes** |

## How it was checked

- **Finding the events:** every event name in `src/` and `packages/`, found two ways:
  - literal names passed to `track`, `trackServer`, `emit` or `event`;
  - every `"snake_case", {` pair, which catches names passed second, like `emit(track, "query_completed", …)`.
  - A third pass looked for calls whose event name isn't a literal. That added `song_excluded` and `song_hearted`, and `phone_blocked` comes from a constant (`PHONE_EVENT`).
- **Checking them:** I read each event's props for content against the page, and read the code paths for held events, sharing and automation.
- **Tests:** `src/platform/analytics` and `src/assistant/ui` pass 27 of 27, and the analytics package's own tests (`node --test`, client and environment) pass 19 of 19.

## The events (90)

| Area | Events |
| --- | --- |
| Kit and lifecycle | `instance`, `device`, `app_shown`, `app_hidden`, `sharing_set`, `lazy_import_failed`, `server_started`, `phone_blocked`, `bookshop_loaded`, `entry_shown` (the entry page, served in place of a page), `entry_accepted` (`music`: `on` or `off`, the entry page's Play the music) |
| Station and shell | `station_viewed`, `station_failed`, `station_frame_sample`, `camera_moved`, `boss_scene_failed`, `bubble_focused`, `menu_toggled`, `nav_selected`, `notifications_opened`, `notification_selected`, `alert_shown`, `alert_dismissed`, `alert_strip_clicked`, `settings_opened`, `settings_reset_asked`, `settings_reset_cancelled` (both with `from`: settings, or replay for the "can't be replayed" screen) |
| Investigate | `investigate_loaded`, `investigate_measure_changed` (with the chosen measures and their count), `investigate_series_toggled`, `investigate_heatmap_changed` (the heatmap's measure, its two axes and its period), `investigate_regrouped`, `investigate_compare_toggled`, `investigate_scatter_toggled` (`on`: whether the chart became a scatter plot), `investigate_filter_changed`, `investigate_filter_added`, `investigate_filter_removed`, `investigate_filters_cleared`, `investigate_discount_filtered`, `investigate_award_filtered`, `investigate_series_filtered`, `investigate_drilldown`, `investigate_title_closed`, `investigate_table_toggled`, `investigate_plan_link`, `investigate_pin_added`, `investigate_pin_removed`, `investigate_pin_rejected`, `investigate_pin_failed`, `investigate_pin_reported` (Add to report on a pin: its kind, who pinned it, and `to`: `existing` or `new`), `table_toggled` (a Table toggle anywhere but the main chart: `where` (`heatmap`, `pin`, and later `report`, `decide` and `dewey`), `shown` (whether the table now shows, as `investigate_table_toggled` has it) and the pin's or lookup's `kind`; never its title or values. The main chart keeps `investigate_table_toggled`) |
| Queries (server) | `query_completed`, `query_failed`, `query_request_completed`, `query_request_failed` |
| Alma (server) | `alma_event_chosen` (the quarter, the source, the event's type, timing, attempts and a failure code from a fixed list; no text), `alma_event_dropped` (a late or orphaned record, with a fixed reason), `alma_failed`, `backstory_written` (source, take, attempts, a failure code from a fixed list and duration; no text), `backstory_failed` |
| Query cache (browser) | `query_cache_summary`: once per page view that used the cache, with the page's route name and counts only (hits, misses, shared requests, bytes served from the cache, evictions, times the page was found out of date, entries) |
| Dewey | `agent_asked` (**held**), `assistant_sentence_withheld` (**held**), `assistant_question_sent`, `assistant_reply_shown`, `assistant_answered`, `assistant_refused`, `assistant_limited`, `assistant_unavailable`, `assistant_offline_shown`, `assistant_pin_placed`, `assistant_lookup_pinned`, `assistant_conversation_restored`, `assistant_conversation_cleared`, `assistant_faces_shown` (once per panel: `3d`, or `portraits` with a reason: reduced motion, no WebGL 2, or the model failed; a second time, as `portraits` and `failed`, only if the 3D faces fail after drawing) |
| Game state (server) | `save_replay_refused` (the first quarter whose replay no longer matches its hash, and `ENGINE_VERSION`), `game_save_created`, `game_quarter_committed`, `game_quarter_failed` (both with `quarter`: Q1 or Q2, and from Q3 2194 the quarter's name, like 2194-Q3), `game_query_session_started`, `game_query_session_revoked`, `discovery_found` (A to F; from Q3 2194, `event`, `record` or `weakest` with the `quarter`), `discovery_part_found`, `discovery_record_deferred`, `game_reset` (with `quarter`: Q1, Q2, finished or unknown, how far the old game had got) |
| Reports | `reports_viewed` (counts of shop reports, new ones and the player's), `report_shop_opened` (the quarter, whether it was new, and `via`: `card` or `results`), `report_created` (`charts`, `notes` with one, `summary` (yes or no), and `from`: `reports` or `investigate`), `report_edited` (the same counts, `renamed`, and the charts `added`, `removed` and `moved`), `report_edit_cancelled` (`changed`), `report_deleted` (`charts`), `report_refused` (`reason`: `full`, `limit`, `no_title`, `no_charts` or `invalid`), `report_chart_failed` (`code`). Counts only: never a title, summary, note or chart title (reports.md section 5) |
| Reports (server) | `game_report_saved` (`intent`: create, update or delete, the player's report count, and the report's `charts`, `notes` and `summary`), `game_report_refused` (`intent` and `reason`) |
| Decide and results | `plan_move_toggled`, `plan_move_refused`, `plan_confirm_opened`, `plan_keep_investigating`, `plan_submitted` (with `reportsRead`: how many reports were chosen in Decide's panel before submitting), `plan_reports_opened` (the quarter and the counts of the player's and the shop's reports), `plan_report_read` (the quarter, `type`: `player` or `shop`, and its `charts`), `result_viewed`, `result_assumptions_opened`, `result_bosses_opened`, `result_continued` (Continue to Q2), `result_play_again` |
| Music | `music_player_opened`, `music_paused`, `music_resumed`, `music_shuffle_set`, `music_volume_set`, `music_other_tab`, `music_manifest_skipped`, `song_started`, `song_ended`, `song_restarted`, `song_moved`, `song_hearted`, `song_unhearted`, `song_included`, `song_excluded` |

**What they carry:** IDs from fixed lists, counts, lengths, durations, outcomes and codes. Only `agent_asked` and `assistant_sentence_withheld` carry text, and both are held. The new Inspector Ryeslton volume has no events of its own: it's data, which the player meets through Investigate and the results, whose events already cover it.

**Not in use:** the kit's check-in (`checkin_shown`, `checkin`, `checkin_reason`), a one-tap "how's it going?". Nothing in the game starts it, so those events can't fire, and the page doesn't need to describe them. If it's ever turned on, the page will have to say that the game asks how it's going.

## What changed on the privacy page

The page is Goldy's (#12). Goldy asked me to bring it up to date, so the edits are in this PR. It describes events by kind, with examples, not as a list, and every event fits a kind it names. It left out some details, which this PR adds:
- **The device event** (`packages/analytics/src/device/device.ts`) also records:
  - the browser engine's version (`chrome`);
  - where the browser shares them, through client hints: the device's model and its operating system's version.
  - The page named only the graphics chip, memory, cores and screen size. It now names these too.
- **The server's events** also record the Node.js version (`server_started`) and why Dewey is unavailable when it is (`assistant_unavailable`, with a reason). The version line now says so.
- **The date** now reads "Effective 30 October 2026 · Updated 31 October 2026", as the page promises.

## Held agent text

Two events carry text, and both are tracked with `{ hold: "agent_text" }`:
- `agent_asked`: the question as typed, from `src/assistant/ui/AssistantPanel.tsx`.
- `assistant_sentence_withheld` (#152's follow-up, Probe's Q2 red-team): a sentence of Dewey's reply that the figures gate withheld, cut at 1,000 characters, with its length and the question's kind, from `src/assistant/server/ask.server.ts`. The server's analytics keep it with their other held events in `.data/analytics-server.json`, which are never sent. The browser and the sent events get only the count.
- **Where it's kept:** the analytics package keeps held events in a store of their own on the device, outside the log and the outbox (`packages/analytics/src/client/analytics.ts`, `track`).
- **How it could leave:** only through `release("agent_text")`. That sends nothing while sharing is off, and **nothing in the app calls it**. The two `release()` calls in `src/assistant/server/ask.server.ts` release a concurrency slot, not analytics.
- **On the server:** apart from `assistant_sentence_withheld`, Dewey's events record only the question's length and a fixed kind (`open`, `advice` or `specific`, from `questionKind`), never its text.
- **Tests:** the package's "held events stay on the device…" and "release waits while sharing is off; discard deletes unsent".

## The sharing switch

Settings' "Share play data" switch calls `setSharing(on)` (`src/platform/analytics/analytics.client.ts`):
- **In the browser:** turning it off drops the outbox and sends only `sharing_set`, then nothing more until it's turned back on (package test "turned off: only the turning off is sent, then nothing…").
- **On the server:** the browser POSTs the choice to the server (`sharing.server.ts`, same-origin only). The server's analytics write "off" to `.data/analytics-server.json` and read it back on start, so a restart doesn't resume sending. A browser with sharing off also tells a fresh server again at each page load. Settings says so if the server hasn't confirmed.

## Automated browsers

- **In the browser:** the analytics package gives no endpoint to a browser that reports `navigator.webdriver`, or that opened with `?analytics-test=1` (it sticks for the tab), so automated runs keep a log and send nothing (package tests "automation: …" and "every game: automated runs send nothing…").
- **On the server:** sending is off when `ORBITAL_ANALYTICS=off`, under Vitest, and when `NODE_ENV=test` (`analytics.server.ts`, `sendingEnabled`). `e2e/server.mjs` sets `ORBITAL_ANALYTICS=off`, so `npm run test:e2e` sends nothing from either side.

## The instance ID

`instanceId()` (`src/platform/analytics/instance.server.ts`) writes `.data/instance.json` (a random UUID and its creation time) on first use, and reuses it after that. `ORBITAL_DATA_DIR` moves the folder. `.gitignore` lists `/.data/`, so the ID is never committed, and each copy gets its own. The server's analytics use it as their install ID, and the browser sends it in its `instance` event, so both sides of one copy line up.

## Known limits

- **Automation the server can't see:** if someone drives a browser against `npm start` or `npm run dev` without `ORBITAL_ANALYTICS=off`, the browser sends nothing, but the server still sends its own events (`game_save_created`, `query_*`, `assistant_*`). The server can't tell that its visitor is automated. Our own runs set the variable (`e2e/server.mjs`, and Sim's fresh-clone check), and `CLAUDE.md` documents it.
- **One switch per copy:** the sharing switch is per browser, and it also switches off the server for the whole copy. One browser turning sharing off stops the server for everyone playing that copy, which errs on the side of not sending.

## Withheld sentences (done)

The privacy page's list of what stays on the computer now reads:

> The questions you type to Dewey, and any sentence of Dewey's reply the game held back instead of showing you. These are kept on your computer and are **not** sent to us. If that ever changes, this page will be updated first, and the date above will change.

Nothing else on the page needed to change: held events stay on the device whatever they hold.
