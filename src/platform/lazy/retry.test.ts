// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { ImportFailed, retryImport } from "./retry";

describe("retryImport", () => {
  it("loads once when the first try works", async () => {
    const load = vi.fn(async () => "scene");
    await expect(retryImport(load, 0)).resolves.toBe("scene");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("tries again after a moment, and takes the second try's module", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module")).mockResolvedValueOnce("scene");
    const loaded = retryImport(load, 1000);
    await vi.advanceTimersByTimeAsync(999);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(loaded).resolves.toBe("scene");
    expect(load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("gives up after the second failure, saying the import failed", async () => {
    const second = new TypeError("Failed to fetch dynamically imported module");
    const load = vi.fn().mockRejectedValueOnce(new TypeError("first")).mockRejectedValueOnce(second);
    const failed = await retryImport(load, 0).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(ImportFailed);
    expect((failed as ImportFailed).cause).toBe(second);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
