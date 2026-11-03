// A boss model that didn't arrive, answered as a value instead of an error. Kept apart from BossScene3D so
// it can be tested without three's runtime.

/**
 * A model that didn't arrive, in its place. A failed load mustn't be thrown inside the canvas: R3F's root
 * reports every error there with reportError, even one a boundary catches, so a page left mid-download
 * (WebKit cancels the fetches) showed page errors. The loader answers with this instead, and the scene
 * gives up quietly.
 */
export const FAILED = Symbol("model failed");
export type Failed = { [FAILED]: unknown };
export const failedLoad = (model: object): model is Failed => FAILED in model;

/** What this needs of a loader (three.js loaders, GLTFLoader among them). */
interface Loader {
  load(
    url: string,
    onLoad: (data: unknown) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): unknown;
}

/**
 * Makes a loader answer a failed load of one of `urls` with FAILED rather than an error, once per loader.
 * R3F keeps one loader per class for the whole page, so every other URL's error still reaches its onError:
 * another scene's useGLTF must fail as it always has.
 */
export function softFailFor(urls: readonly string[]) {
  const soft = new Set(urls);
  return (loader: Loader) => {
    const marked = loader as Loader & { [FAILED]?: true };
    if (marked[FAILED]) return;
    marked[FAILED] = true;
    const load = loader.load.bind(loader);
    loader.load = (url, onLoad, onProgress, onError) =>
      load(url, onLoad, onProgress, (error) => {
        // R3F's useLoader always passes onError; a caller that doesn't is left as the loader leaves it.
        if (soft.has(url) && onError) onLoad({ [FAILED]: error });
        else onError?.(error);
      });
  };
}
