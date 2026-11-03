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
// afresh: it still rejects inside the canvas, so R3F reports it as a page
// error too, and the station shows its still picture. (Decide's 3D scene,
// which has a 2D one to fall back on, keeps its real failures quiet.) Kept
// for the page's life, as drei's own cache was.

// The manager is the whole page's, so this also cancels Decide's and the phone scene's model loads, which aren't
// held: a page that stays after all (a download link) clicked while one of them loads shows its 2D scene or still
// picture instead. Rare, and safe.
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

/** The loads that failed, kept (so a render after the failure meets it and fails) until the next visit's scene. */
const failed = new Set<string>();

/**
 * One load per key for the page's life. A load that fails stays failed for this visit: forgotten at once, a render
 * after the failure started it again and suspended on it again, round and round (measured: ~800 requests a second
 * for an aborted model, the station stuck on Loading…), and the failure never reached the scene's boundary. The
 * next visit's scene tries again (forgetFailedLoads).
 */
function once<T>(key: string, start: () => Promise<T>): Promise<T> {
  let load = loads.get(key) as Promise<T> | undefined;
  if (!load) {
    load = held(start);
    loads.set(key, load);
    load.catch(() => failed.add(key));
  }
  return load;
}

/** A new visit to the station: the loads that failed last time are tried again. */
export function forgetFailedLoads() {
  for (const key of failed) loads.delete(key);
  failed.clear();
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
