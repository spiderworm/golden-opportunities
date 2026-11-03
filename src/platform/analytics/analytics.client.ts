import type { Analytics } from "@tellim/kit/analytics/client";
import { setGl, studio } from "../kit.client";
import { isPhoneScreen, PHONE_EVENT } from "../phone";
import { GAME, type Props, type Track, type TrackOptions } from "./track";

let analytics: Analytics | undefined;
// Whether the server has confirmed the player's sharing choice. Pending until
// it answers; false (and remembered across reloads) until it confirms.
const UNCONFIRMED_KEY = `${GAME}.sharingUnconfirmed`;
let serverConfirmed: Promise<boolean> = Promise.resolve(true);
// Events tracked before startAnalytics() runs, sent once it does.
const early: [string, Props | undefined, TrackOptions | undefined][] = [];

/**
 * Starts the browser's analytics once per page load, through the studio's
 * kit (../kit.client: where they're sent, and from what).
 */
export function startAnalytics(
  instance: string,
  gl?: () => WebGLRenderingContext | null,
): Analytics {
  if (analytics) return analytics;
  if (gl) setGl(gl);
  analytics = studio().analytics!;
  analytics.track("instance", { id: instance });
  // A fresh server doesn't know this browser's choice; tell it if sharing is off.
  if (!analytics.sharing()) serverConfirmed = tellServer(false);
  else if (remembered()) serverConfirmed = tellServer(true);
  for (const [event, props, options] of early.splice(0)) analytics.track(event, props, options);
  return analytics;
}

/**
 * For a 3D scene: hands over its renderer's WebGL context so the device
 * event records the GPU. The studio package reads it once, shortly after
 * analytics start, so the GPU is recorded only when a scene is up by then
 * (e.g. arriving on the Station screen).
 */
export function setAnalyticsGl(get: () => WebGLRenderingContext | null) {
  setGl(get);
}

/**
 * track() for browser code. On a phone, the only event it sends is
 * phone_blocked: the game's pages mount once while the page hydrates, before
 * the phone screen takes over, and their events (station_viewed, say) would
 * describe a game the player never saw. A phone still records what doesn't
 * come through here: the analytics package's own instance and device events
 * at start, and the server's game_save_created when the first load makes
 * the browser's save.
 */
export const track: Track = (event, props, options) => {
  if (event !== PHONE_EVENT && isPhoneScreen()) return;
  if (analytics) analytics.track(event, props, options);
  else early.push([event, props, options]);
};

/** For the Settings screen: the "Share play data" switch and the install ID shown under it. */
export const sharing = () => analytics?.sharing() ?? true;
/**
 * The "Share play data" switch, for the browser and the server together.
 * Resolves true once the server has confirmed. On false, the browser's
 * choice still stands; if sharing is off, the server is told again at the
 * next page load.
 */
export async function setSharing(on: boolean): Promise<boolean> {
  analytics?.setSharing(on);
  serverConfirmed = tellServer(on);
  return serverConfirmed;
}

/**
 * Whether the server has confirmed the current choice: waits for any
 * pending attempt, including the one made at page load. False means the
 * server may still be sending, and Settings must say so.
 */
export const sharingConfirmed = (): Promise<boolean> => serverConfirmed;
export const installId = () => analytics?.install() ?? "";

/** The server keeps its own play data (queries, Dewey); the same switch stops it. True once it confirms. */
async function tellServer(on: boolean): Promise<boolean> {
  let confirmed = false;
  try {
    const res = await fetch("/api/analytics/sharing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ on }),
    });
    if (res.ok) {
      const body: unknown = await res.json();
      confirmed = typeof body === "object" && body !== null && (body as { on?: unknown }).on === on;
    }
  } catch {
    // offline or the server is down
  }
  remember(!confirmed);
  return confirmed;
}

function remembered(): boolean {
  try {
    return localStorage.getItem(UNCONFIRMED_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(unconfirmed: boolean) {
  try {
    if (unconfirmed) localStorage.setItem(UNCONFIRMED_KEY, "1");
    else localStorage.removeItem(UNCONFIRMED_KEY);
  } catch {
    // storage blocked: the warning lasts for this page load only
  }
}
