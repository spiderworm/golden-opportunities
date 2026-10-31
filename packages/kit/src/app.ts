// What a studio app starts with (David, 31 Oct 2026: "we don't have to
// rediscover these things over and over"): the app said once, analytics
// started for it, and its music when it wants it, each with its form's
// defaults (a computer's web app, or a phone game), and anything given wins.
// The music is loaded only when asked for, so it's no weight on the first
// page; the parts are also here one by one (@tellim/kit/music/dock, ...).
import { createAnalytics, type Analytics, type Options as AnalyticsOptions } from "@tellim/analytics/client";
import { deployed } from "@tellim/analytics/deployed";
import type { Music } from "@tellim/music/player";
import type { App } from "@tellim/platform/app";
import type { Form, MusicStart } from "./music.ts";

export { defineApp, type App, type AppInfo } from "@tellim/platform/app";
export type { Form, MusicStart } from "./music.ts";

export type Track = (event: string, props?: Record<string, string | number | boolean>) => void;

export type StartOptions = {
  /** a computer's web app (Orbital Books) or a phone game (Waddleberg, Pizza) */
  form: Form;
  /** analytics for the app (default: the studio's endpoint, platform "web"), or false: none */
  analytics?: false | (Omit<AnalyticsOptions, "app" | "platform"> & { platform?: string });
  /** what the music (and the kit's other parts) report through (default: the analytics' track) */
  track?: Track;
};

export type Started = {
  app: App;
  form: Form;
  /** null with `analytics: false` */
  analytics: Analytics | null;
  track: Track;
  /** the music, loaded the first time it's asked for: null when there are no songs (or no browser) */
  music(o: MusicStart): Promise<Music | null>;
};

export function startApp(app: App, o: StartOptions): Started {
  const analytics = o.analytics === false ? null : createAnalytics({ endpoint: deployed.endpoint, ...o.analytics, app, platform: o.analytics?.platform ?? "web" });
  const track: Track = o.track ?? analytics?.track ?? (() => {});
  let music: Promise<Music | null> | undefined;
  return {
    app,
    form: o.form,
    analytics,
    track,
    music: (m) => (music ??= import("./music.ts").then(({ startMusic }) => startMusic(app, o.form, { track, ...m }))),
  };
}
