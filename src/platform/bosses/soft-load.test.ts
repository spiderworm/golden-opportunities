import { describe, expect, it, vi } from "vitest";

import { failedLoad, softFailFor } from "./soft-load";

/** A loader whose every load fails, as R3F's shared GLTFLoader does when a fetch is cut off. */
function failingLoader() {
  return {
    load: vi.fn(
      (
        _url: string,
        _onLoad: (data: unknown) => void,
        _onProgress?: unknown,
        onError?: (error: unknown) => void,
      ) => {
        onError?.(new Error("Load failed"));
      },
    ),
  };
}

describe("softFailFor", () => {
  it("answers a failed boss model with FAILED, not an error", () => {
    const loader = failingLoader();
    softFailFor(["/models/bosses/overall.glb"])(loader);
    const onLoad = vi.fn();
    const onError = vi.fn();
    loader.load("/models/bosses/overall.glb", onLoad, undefined, onError);
    expect(onError).not.toHaveBeenCalled();
    expect(onLoad).toHaveBeenCalledOnce();
    expect(failedLoad(onLoad.mock.calls[0]![0])).toBe(true);
  });

  it("leaves every other URL's failure to its onError, since the loader is shared", () => {
    const loader = failingLoader();
    softFailFor(["/models/bosses/overall.glb"])(loader);
    const onLoad = vi.fn();
    const onError = vi.fn();
    loader.load("/models/phone/robot.glb", onLoad, undefined, onError);
    expect(onLoad).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("patches a loader once, however many times it's extended", () => {
    const loader = failingLoader();
    const soft = softFailFor(["/models/bosses/overall.glb"]);
    soft(loader);
    const patched = loader.load;
    soft(loader);
    expect(loader.load).toBe(patched);
  });
});
