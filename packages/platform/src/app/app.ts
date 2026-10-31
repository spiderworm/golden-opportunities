// Who the app is, said once and given to every studio package (music,
// analytics, the store, and what comes): until now each asked for a name of
// its own, and Waddleberg was "waddleberg" to one, "cubeberg" to another and
// /cubeberg/ on the web (David, 31 Oct 2026). The id is what counts: never
// shown, never changed. The address can't say which app it is, as many share
// a host, so it's only checked (../presence).
import { APPS } from "./apps.ts";

export type AppInfo = {
  /** for good, from the studio's list (apps.ts), e.g. "waddleberg" */
  id: string;
  /** shown to players; may change (the list's, if not given) */
  name?: string;
  /** the release, e.g. "0.1.12-alpha" */
  version?: string;
  /** the build it is */
  build?: string;
  /** what this app's saved data is kept under, where that's older than the id (the list's, if not given) */
  storagePrefix?: string;
  /** where the app lives on its host, e.g. "/cubeberg/" (default "/"): only checked, never its identity */
  home?: string;
};

export type App = Readonly<{
  id: string;
  name: string;
  version?: string;
  build?: string;
  storagePrefix: string;
  home: string;
  /** a storage key of this app's own: `${storagePrefix}.${name}` */
  storageKey(name: string): string;
  /** a channel (or lock) of this app's own, shared by its tabs */
  channelName(scope: string): string;
}>;

const ID = /^[a-z][a-z0-9-]*$/;
const listed = APPS as Record<string, { name: string; storagePrefix?: string } | undefined>;

export function defineApp(info: AppInfo): App {
  if (!ID.test(info.id)) throw new Error(`app id "${info.id}": lowercase letters, digits and dashes`);
  const known = listed[info.id];
  if (!known) console.warn(`app id "${info.id}" isn't in @tellim/platform's list of apps (src/app/apps.ts): add it, so no other app takes it`);
  else if (info.storagePrefix && info.storagePrefix !== (known.storagePrefix ?? info.id))
    console.warn(`app "${info.id}": storagePrefix "${info.storagePrefix}" isn't the list's`);
  const storagePrefix = info.storagePrefix ?? known?.storagePrefix ?? info.id;
  return Object.freeze({
    id: info.id,
    name: info.name ?? known?.name ?? info.id,
    version: info.version,
    build: info.build,
    storagePrefix,
    home: info.home ?? "/",
    storageKey: (name: string) => `${storagePrefix}.${name}`,
    channelName: (scope: string) => `tellim.${info.id}.${scope}`,
  });
}
