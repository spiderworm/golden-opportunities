// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());
vi.mock("~/platform/analytics/analytics.client", () => ({ track }));

// Leaving "/" while the station loads isn't an error (loading.ts): a load the page's going cuts off is held, never
// rejected (R3F would report it as a page error), and loaded again if the page stays; any other failure still fails.
describe("station loads", () => {
  it("fail as before while the page stays, are held while it goes, and load again if it stays after all", async () => {
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal("window", {});
    vi.stubGlobal("addEventListener", (type: string, f: () => void) => (listeners[type] = f));
    vi.resetModules();
    const { held } = await import("./loading");
    const { onPageLeaving } = await import("~/platform/lazy/cut-off");
    const failed = new TypeError("Load failed");

    // A real failure, the page staying: it fails.
    await expect(held(() => Promise.reject(failed))).rejects.toBe(failed);

    // A load under way when the page starts going: listeners hear it once, the load is cut off, and it's held, not
    // failed.
    const going = vi.fn();
    onPageLeaving(going);
    vi.useFakeTimers();
    let tries = 0;
    let cut!: (error: unknown) => void;
    const settled = vi.fn();
    held(() =>
      ++tries === 1 ? new Promise((_, reject) => (cut = reject)) : Promise.resolve("model"),
    ).then(settled, settled);
    listeners.beforeunload!();
    listeners.pagehide!();
    expect(going).toHaveBeenCalledTimes(1);
    cut(failed);
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).not.toHaveBeenCalled();
    expect(tries).toBe(1);

    // And none starts while it's going (the next of a run of models, after one arrived as the page went).
    let started = 0;
    const waiting = vi.fn();
    held(() => (++started, Promise.resolve("next"))).then(waiting);
    await vi.advanceTimersByTimeAsync(1000);
    expect(started).toBe(0);

    // It stayed after all (back from the back-forward cache, say): the load goes again, and comes in.
    listeners.pageshow!();
    await vi.advanceTimersByTimeAsync(0);
    expect(tries).toBe(2);
    expect(settled).toHaveBeenCalledWith("model");
    expect(started).toBe(1);
    expect(waiting).toHaveBeenCalledWith("next");

    // beforeunload alone, for a page that then stays (a download): held, then loaded once the moment passes.
    tries = 0;
    const later = vi.fn();
    held(() =>
      ++tries === 1 ? new Promise((_, reject) => (cut = reject)) : Promise.resolve("texture"),
    ).then(later, later);
    listeners.beforeunload!();
    expect(going).toHaveBeenCalledTimes(2);
    cut(failed);
    await vi.advanceTimersByTimeAsync(3000);
    expect(later).toHaveBeenCalledWith("texture");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
