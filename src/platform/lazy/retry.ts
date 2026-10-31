// A 3D scene's code is the largest thing a page loads after it's up, and one
// failed fetch of it (a dropped connection, a dev server re-bundling its
// dependencies) shouldn't cost the player the scene. So its import gets a
// second try, a moment later; only then is it given up on. Chromium fetches
// a failed module again; WebKit keeps it as failed, so there the second try
// fails at once without a request (measured, 31 Oct 2026).
export const RETRY_MS = 1000;

/** A lazy import that failed twice: the code didn't arrive, which says nothing about the device. */
export class ImportFailed extends Error {
  constructor(cause: unknown) {
    super("A lazy import failed twice", { cause });
    this.name = "ImportFailed";
  }
}

/** Imports with `load`, and if that fails, once more after `wait` ms; a second failure rejects with ImportFailed. */
export function retryImport<T>(load: () => Promise<T>, wait = RETRY_MS): Promise<T> {
  return load()
    .catch(() => new Promise<void>((done) => setTimeout(done, wait)).then(load))
    .catch((error: unknown) => {
      throw new ImportFailed(error);
    });
}
