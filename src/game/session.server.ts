import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import path from "node:path";
import { data, type MiddlewareFunction } from "react-router";
import { loadBookshop } from "../bookshop/loader.server";
import type { QueryView } from "../query/types";
import { BASELINE_VIEW } from "../query/view.server";
import { dataVersion } from "../query/data-version.server";
import { DATA_DIR, instanceId } from "../platform/analytics/instance.server";
import { servedOverHttps } from "../platform/origin.server";
import { trackServer } from "../platform/analytics/analytics.server";
import { onGameStarted } from "../alma/backstory.server";
import { createSaveStore, isSaveId, SaveError } from "./store.server";
import { quarterCells, ReplayMismatch } from "./replay.server";
import { mergeCells } from "../query/sale-cells";
import { eventsForSave } from "./events.server";
import type { TurnEvent } from "../simulation/turn";
import type { GameSave } from "./types";
import { saveDate } from "./progress";

export const saves = createSaveStore(path.join(DATA_DIR, "saves"));
/**
 * The save cookie's name, one per copy of the app (David's bug, 3 Nov 2026: "What you found" showed nothing he'd
 * found). Browsers keep cookies by host, not port, so every copy on localhost (live on :5173, each agent's dev
 * server) shared one `orbital_save`: a visit to another copy replaced it with a save this copy doesn't hold, and the
 * next visit here silently started a new game. Named for a hash of this copy's instance ID (so the cookie says
 * nothing of the ID analytics sends; Sim, #320), copies never share one.
 */
export const saveCookieName = () =>
  `${LEGACY_COOKIE}_${createHash("sha256").update(instanceId()).digest("hex").slice(0, 8)}`;
/** The name every copy used before, read only while this copy's own cookie is absent, so an old game carries on. */
const LEGACY_COOKIE = "orbital_save";
const active = new AsyncLocalStorage<string>();
/**
 * New games each process starts per minute. ORBITAL_NEW_GAMES_PER_MINUTE raises it for automated
 * browsers, where every test is a fresh save; anything but a positive integer keeps the default.
 */
export function newGamesPerMinute(value = process.env.ORBITAL_NEW_GAMES_PER_MINUTE): number {
  return value && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : 30;
}
const NEW_GAMES_PER_MINUTE = newGamesPerMinute();
let creationWindow = Date.now();
let creations = 0;
export function saveCookie(id: string, request: Request): string {
  if (!isSaveId(id)) throw new SaveError("INVALID_SAVE");
  return `${saveCookieName()}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${servedOverHttps(request) ? "; Secure" : ""}`;
}
/** The values a request's cookie header holds under one name. */
function cookieValues(request: Request, name: string): string[] {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(name + "="))
    .map((v) => v.slice(name.length + 1));
}
/**
 * The save a request's cookie names, and whether it came under the old shared name. This copy's own cookie decides
 * whenever it's sent; the old name is read only without it. Two values under one name select nothing.
 */
export function cookieSave(request: Request): { id: string; legacy: boolean } | null {
  const own = cookieValues(request, saveCookieName());
  const values = own.length ? own : cookieValues(request, LEGACY_COOKIE);
  if (values.length !== 1 || !isSaveId(values[0]!)) return null;
  return { id: values[0]!, legacy: own.length === 0 };
}
export function cookieSaveId(request: Request): string | null {
  return cookieSave(request)?.id ?? null;
}
/** Only the HttpOnly cookie (or middleware's bootstrap) selects a browser save. */
export function resolveSaveId(request: Request): string {
  const id = active.getStore() ?? cookieSaveId(request);
  if (!id) throw new SaveError("MISSING_SAVE");
  saves.read(id);
  return id;
}
/** A quarter's Alma event as the engine reads it (type, params, stretch and drop), or null: Q1 and Q2 have none. */
export function eventOf(save: GameSave, quarter: string): TurnEvent | null {
  const record = save.alma?.find((r) => r.quarter === quarter);
  return record
    ? {
        type: record.type,
        params: record.params,
        stretch: record.stretch,
        ...(record.drop === undefined ? {} : { drop: record.drop }),
      }
    : null;
}
export function queryViewForSave(save: GameSave): QueryView {
  // Each quarter's cells, replayed, checked and rolled up once per process (replay.server.ts), or from an older
  // save's stored lines.
  const cells = mergeCells(
    save.played.map((q) =>
      quarterCells(save.id, save.seed, q, loadBookshop, eventOf(save, q.period)),
    ),
  );
  const periods = [...BASELINE_VIEW.periods, ...save.played.map((q) => q.period)];
  if (!cells.lines) return { ...BASELINE_VIEW, periods };
  // What a time series can mark, from the played quarters only (events.server.ts). It changes only with them, so
  // the data version names it too.
  const events = eventsForSave(save, loadBookshop());
  // The data version names these cells, so results over them can be cached (run-query.server.ts).
  return {
    ...BASELINE_VIEW,
    periods,
    version: dataVersion(save),
    simulatedCells: cells,
    ...(events.length ? { events } : {}),
  };
}
/**
 * The request's save, its date, and its query view. The view replays the played quarters' lines, so it's built
 * only when read: the shell's loader on every page reads just the save and the date, and a save whose replay no
 * longer matches (REPLAY_MISMATCH) still opens every page that doesn't need lines, Settings' Reset game
 * included (Plot, #198).
 */
export function getGameSession(request: Request) {
  const save = saves.read(resolveSaveId(request));
  let view: QueryView | undefined;
  return {
    save,
    date: saveDate(save),
    get queryView() {
      try {
        return (view ??= queryViewForSave(save));
      } catch (error) {
        // For a page's loader: the shell's error boundary shows "Your save can't be replayed" for this quarter.
        if (error instanceof ReplayMismatch)
          throw data(
            { replayMismatch: error.quarter },
            { status: 409, headers: { "Cache-Control": "no-store" } },
          );
        throw error;
      }
    },
  };
}
/** A new save, under the per-minute limit shared by first visits and Play again. The caller sets its cookie. */
export function startGame(replacing?: "missing"): string {
  if (Date.now() - creationWindow >= 60_000) {
    creationWindow = Date.now();
    creations = 0;
  }
  if (creations >= NEW_GAMES_PER_MINUTE)
    throw new Response("Too many new games. Try again shortly.", {
      status: 429,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  creations++;
  const save = saves.create();
  // `replacing`: the cookie named a save this copy doesn't hold (it's gone, or it was another copy's).
  trackServer("game_save_created", { version: 1, ...(replacing ? { replacing } : {}) });
  // Alma writes the station's backstory in the background; the arrival never waits for it (src/alma).
  onGameStarted({ saveId: save.id, seed: save.seed }, { saves });
  return save.id;
}
/** One bootstrap before parallel shell/child loaders; never creates saves for API callers or POSTs. */
export const gameSessionMiddleware: MiddlewareFunction<Response> = async ({ request }, next) => {
  const found = cookieSave(request);
  let id = found?.id ?? null;
  let missing = false;
  try {
    if (id) saves.read(id);
  } catch (error) {
    if (error instanceof SaveError && error.code === "MISSING_SAVE") {
      id = null;
      missing = true;
    } else throw error;
  }
  if (!id) {
    if (request.method !== "GET") throw new Response("Start a game first.", { status: 401 });
    id = startGame(missing ? "missing" : undefined);
  }
  const response = await active.run(id, next);
  response.headers.set("Cache-Control", "private, no-store");
  // A new game, or an old game found under the shared name: from now on it's under this copy's own.
  if (id !== found?.id || found.legacy)
    response.headers.append("Set-Cookie", saveCookie(id, request));
  return response;
};
