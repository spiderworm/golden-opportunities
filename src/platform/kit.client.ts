// Orbital Books, as the studio's packages know it (@tellim/kit): the app said
// once, and started the first time anything asks, analytics or the music, so
// it's the same however the page mounts.
import { defineApp, startApp, type Started } from "@tellim/kit/app";
import { track } from "./analytics/analytics.client";
import { BUILD, VERSION } from "./analytics/track";

export const app = defineApp({ id: "orbital-books", version: VERSION, build: BUILD });

// The game's WebGL context, once a scene has made one (setAnalyticsGl).
let gl: (() => WebGLRenderingContext | null) | undefined;
export function setGl(get: () => WebGLRenderingContext | null) {
  gl = get;
}

let started: Started | undefined;

/**
 * The studio's packages for this page: a computer's web app. Local runs send
 * too (David, 30 Oct 2026: "every bit, to me"), marked as platform "webdev";
 * automated browsers (webdriver, ?analytics-test=1) never send. The music
 * reports through the platform's track, so a phone sends only what it may.
 */
export function studio(): Started {
  return (started ??= startApp(app, {
    form: "desktop",
    analytics: { platform: import.meta.env.DEV ? "webdev" : "web", gl: () => gl?.() ?? null },
    track,
  }));
}
