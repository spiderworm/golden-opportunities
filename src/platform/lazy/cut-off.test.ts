// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());
vi.mock("~/platform/analytics/analytics.client", () => ({ track }));

describe("cutOff", () => {
  it("records and rethrows a failed lazy import while the page stays, and lets one go once it's leaving", async () => {
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal("window", {});
    vi.stubGlobal("addEventListener", (type: string, f: () => void) => (listeners[type] = f));
    const { cutOff } = await import("./cut-off");
    const failed = new TypeError("Importing a module script failed.");

    expect(() => cutOff("music dock")(failed)).toThrow(failed);
    expect(track).toHaveBeenCalledWith("lazy_import_failed", { what: "music dock" });

    track.mockClear();
    vi.useFakeTimers();
    listeners.beforeunload!();
    expect(cutOff("music settings")(failed)).toBeNull();
    expect(track).not.toHaveBeenCalled();
    // a page that stayed after all (a download link) reports failures again
    vi.advanceTimersByTime(3000);
    expect(() => cutOff("music settings")(failed)).toThrow(failed);
    vi.useRealTimers();

    listeners.pageshow!();
    expect(() => cutOff("charts")(failed)).toThrow(failed);
    listeners.pagehide!();
    expect(cutOff("charts")(failed)).toBeNull();
    vi.unstubAllGlobals();
  });
});
