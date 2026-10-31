import { use } from "react";
import { DefaultLoadingManager, TextureLoader, type Texture } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import { onPageLeaving, pageLeaving, whenStayed } from "~/platform/lazy/cut-off";

// The station's models and textures, loaded so that leaving the page while
// they're still coming isn't an error (Sage, Music: page errors in WebKit
// when "/" is left mid-load). WebKit cuts off every fetch still in flight as
// the page goes, and reports each as a page error, unless the page cancelled
// it first (measured, 31 Oct 2026: none at all across 40 moments of leaving
// once it had). So as the page starts going, the station cancels its own
// loads: three.js's loading manager, which every three.js loader's fetch
// listens to. And a load cut off that way neither resolves nor rejects, since
// R3F reports every error its scene throws, even one a boundary catches; if
// the page stays after all (beforeunload also fires for a download), it loads
// again. Any other failure is a failure, as before, and the next visit tries
// afresh. Kept for the page's life, as drei's own cache was.

if (typeof window !== "undefined") onPageLeaving(() => DefaultLoadingManager.abort());

const loads = new Map<string, Promise<unknown>>();

/**
 * `start`'s load, held, not failed, if the page's going cuts it off; loaded again if the page stays. Nor does one
 * start while the page is going: some of the station's models load one after another (each waits for the one before
 * it), and one that arrives as the page goes would start the next after the cancelling, where nothing cancels it.
 */
export function held<T>(start: () => Promise<T>): Promise<T> {
  if (pageLeaving()) return whenStayed().then(() => held(start));
  return start().catch((error: unknown) => {
    if (!pageLeaving()) throw error;
    return whenStayed().then(() => held(start));
  });
}

/** One load per key for the page's life; a load that fails is forgotten, so a later visit tries again. */
function once<T>(key: string, start: () => Promise<T>): Promise<T> {
  let load = loads.get(key) as Promise<T> | undefined;
  if (!load) {
    load = held(start);
    loads.set(key, load);
    load.catch(() => loads.delete(key));
  }
  return load;
}

const models = new GLTFLoader();
const textures = new TextureLoader();

/** The station's models, by URL, suspending until they're in (all of them fetched at once). */
export function useStationModels(urls: readonly string[]): GLTF[] {
  const loading = urls.map((url) => once(`model ${url}`, () => models.loadAsync(url)));
  const loaded: GLTF[] = [];
  for (const load of loading) loaded.push(use(load));
  return loaded;
}

/** One of the station's models. */
export const useStationModel = (url: string): GLTF => useStationModels([url])[0]!;

/** The station's textures, by URL, suspending until they're in. */
export function useStationTextures(urls: readonly string[]): Texture[] {
  const loading = urls.map((url) => once(`texture ${url}`, () => textures.loadAsync(url)));
  const loaded: Texture[] = [];
  for (const load of loading) loaded.push(use(load));
  return loaded;
}
