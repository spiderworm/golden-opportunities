// A refused "seen" never takes the page down (David, 3 Nov 2026: "Later" replaced the station with "Something went
// wrong"). The action answers with its status, and the memo's post catches any failure, React Router's own included.
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const directory = mkdtempSync(path.join(os.tmpdir(), "orbital-alert-seen-"));
vi.mock("../platform/analytics/instance.server", () => ({
  DATA_DIR: directory,
  instanceId: () => "0123abcd-0000-4000-8000-000000000000",
}));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
const track = vi.hoisted(() => vi.fn());
vi.mock("~/platform/analytics/analytics.client", () => ({ track }));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const { action } = await import("./alert-seen");
const { markSeen } = await import("./layout");

const post = (headers: Record<string, string>) =>
  new Request("http://127.0.0.1:5173/alert/seen", { method: "POST", headers });

describe("the transmission marked seen, best effort", () => {
  it("answers a refused write with its status instead of throwing to the error screen", async () => {
    // From another site: the game's gate refuses it.
    const foreign = action({ request: post({ origin: "https://evil.example" }) } as never);
    expect(foreign).toBeInstanceOf(Response);
    expect((foreign as Response).status).toBe(403);
    // No game at all.
    const none = action({ request: post({ origin: "http://127.0.0.1:5173" }) } as never);
    expect((none as Response).status).toBe(401);
  });

  it("closes quietly on any failure, records it, and lets the shell look again", async () => {
    const revalidate = vi.fn(async () => {});
    for (const answer of [
      () => Promise.resolve(new Response("Bad Request", { status: 400 })),
      () => Promise.reject(new TypeError("Load failed")),
    ]) {
      track.mockClear();
      revalidate.mockClear();
      vi.stubGlobal("fetch", vi.fn(answer));
      await expect(markSeen(revalidate)).resolves.toBeUndefined();
      expect(track).toHaveBeenCalledWith(
        "alert_seen_failed",
        expect.objectContaining({ status: expect.any(Number) }),
      );
      expect(revalidate).toHaveBeenCalledTimes(1);
    }
    // Saved: nothing to record.
    track.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    );
    await markSeen(revalidate);
    expect(track).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
