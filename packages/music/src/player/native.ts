// The device's media session in an Android app (android/, the TellimMusic
// Capacitor plugin): its WebView has no navigator.mediaSession, and Android
// hands earbuds' and Bluetooth buttons only to an app with a session of its
// own (David, 4 Nov 2026: Waddleberg's earbuds did nothing). The player sees
// it as the browser's (media-keys.ts), so a game does nothing for it: the
// plugin comes with the package, found by `cap sync`.
import type { Session } from "./media-keys.ts";

/** what's used of Capacitor, which its app puts on the page (no dependency on @capacitor/core) */
type Capacitor = {
  isNativePlatform?(): boolean;
  isPluginAvailable?(name: string): boolean;
  registerPlugin?<T>(name: string): T;
};
type Plugin = {
  set(o: { state: MediaSessionPlaybackState; title?: string; album?: string }): Promise<void>;
  addListener(event: "action", f: (e: { action: MediaSessionAction }) => void): Promise<unknown>;
};

let made: Session | null | undefined;

/** The app's media session, or undefined outside an Android app with the plugin. Made once. */
export function nativeSession(cap = (globalThis as { Capacitor?: Capacitor }).Capacitor): Session | undefined {
  if (made !== undefined) return made ?? undefined;
  if (!cap?.isNativePlatform?.() || !cap.isPluginAvailable?.("TellimMusic") || !cap.registerPlugin) {
    made = null;
    return undefined;
  }
  const plugin = cap.registerPlugin<Plugin>("TellimMusic");
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler>();
  void plugin.addListener("action", (e) => handlers.get(e.action)?.({ action: e.action }));
  let metadata: MediaMetadata | null = null;
  let playbackState: MediaSessionPlaybackState = "none";
  const send = () => void plugin.set({ state: playbackState, title: metadata?.title, album: metadata?.album }).catch(() => {});
  return (made = {
    setActionHandler: (action, f) => void (f ? handlers.set(action, f) : handlers.delete(action)),
    get metadata() {
      return metadata;
    },
    set metadata(m) {
      metadata = m;
      send();
    },
    get playbackState() {
      return playbackState;
    },
    set playbackState(s) {
      if (s === playbackState) return;
      playbackState = s;
      send();
    },
  });
}

/** for tests: forget the session made */
export function forgetNativeSession() {
  made = undefined;
}
