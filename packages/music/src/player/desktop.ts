// The player for a web app made for a computer (Orbital Books), with what the
// first one taught us as its defaults, so the next needn't learn it again
// (David, 31 Oct 2026). Anything given overrides them.
//
// - remember: a reload, a closed tab or a crash carries on where it was.
// - oneTab: one of the app's tabs plays at a time.
// - pauseWhenHidden on a touch screen only: on a computer the music is a
//   backdrop and keeps playing behind other tabs and desktops; on a tablet,
//   putting the browser away still stops it, as an app's would.
import { createMusic, type Music, type MusicOptions } from "./player.ts";

export const desktopDefaults = {
  remember: true,
  oneTab: true,
  pauseWhenHidden: () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches,
} satisfies Partial<MusicOptions>;

export function createDesktopMusic(o: MusicOptions): Music {
  const d = desktopDefaults;
  return createMusic({ ...o, remember: o.remember ?? d.remember, oneTab: o.oneTab ?? d.oneTab, pauseWhenHidden: o.pauseWhenHidden ?? d.pauseWhenHidden });
}
