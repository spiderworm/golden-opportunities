import { createAnalytics, type Analytics } from "@tellim/analytics/client";
import { deployed } from "@tellim/analytics/deployed";
import { BUILD, GAME, VERSION, type Props, type Track, type TrackOptions } from "./track";

let analytics: Analytics | undefined;
// Events tracked before startAnalytics() runs, sent once it does.
const early: [string, Props | undefined, TrackOptions | undefined][] = [];

/**
 * Starts the browser's analytics once per page load. Local runs send too
 * (David, 30 Oct 2026: "every bit, to me"), marked as platform "webdev".
 * Automated browsers (webdriver, ?analytics-test=1) never send.
 */
export function startAnalytics(instance: string, gl?: () => WebGLRenderingContext | null): Analytics {
  if (analytics) return analytics;
  analytics = createAnalytics({
    game: GAME,
    key: GAME,
    endpoint: deployed.endpoint,
    build: BUILD,
    version: VERSION,
    platform: import.meta.env.DEV ? "webdev" : "web",
    gl,
  });
  analytics.track("instance", { id: instance });
  for (const [event, props, options] of early.splice(0)) analytics.track(event, props, options);
  return analytics;
}

/** track() for browser code. */
export const track: Track = (event, props, options) => {
  if (analytics) analytics.track(event, props, options);
  else early.push([event, props, options]);
};

/** For the Settings screen: the "Share play data" switch and the install ID shown under it. */
export const sharing = () => analytics?.sharing() ?? true;
export const setSharing = (on: boolean) => analytics?.setSharing(on);
export const installId = () => analytics?.install() ?? "";
