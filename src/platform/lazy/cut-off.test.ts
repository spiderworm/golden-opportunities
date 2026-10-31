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

    expect(() => cutOff("music popup")(failed)).toThrow(failed);
    expect(track).toHaveBeenCalledWith("lazy_import_failed", { what: "music popup" });

    track.mockClear();
    listeners.beforeunload!();
    expect(cutOff("music settings")(failed)).toBeNull();
    expect(track).not.toHaveBeenCalled();

    listeners.pageshow!();
    expect(() => cutOff("charts")(failed)).toThrow(failed);
    listeners.pagehide!();
    expect(cutOff("charts")(failed)).toBeNull();
    vi.unstubAllGlobals();
  });
});
