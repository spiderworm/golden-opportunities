import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Segment } from "./segments";

// One save's segments, in memory: writeSegments hands the change the save, as the store does, and keeps what it
// returns. What matters here is what /api/segments answers and records, not the store (segments.server.test.ts).
const state = vi.hoisted(() => ({ segments: [] as Segment[] | undefined, busy: false }));
const game = vi.hoisted(() => ({
  writeSegments: vi.fn(
    (_request: Request, change: (save: { segments?: Segment[] }) => Segment[] | null) => {
      if (state.busy) throw new Response("Game state changed.", { status: 409 });
      const next = change({ segments: state.segments });
      if (next) state.segments = next.length ? next : undefined;
      return next;
    },
  ),
}));
const session = vi.hoisted(() => ({
  getGameSession: vi.fn(() => ({ save: { segments: state.segments } })),
}));
const analytics = vi.hoisted(() => ({ trackServer: vi.fn() }));
vi.mock("~/game/game.server", () => game);
vi.mock("~/game/session.server", () => session);
vi.mock("~/platform/analytics/analytics.server", () => analytics);

import { action, loader } from "./api";
import type { Route } from "./+types/api";

const post = (body: unknown) =>
  action({
    request: new Request("http://localhost/api/segments", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  } as Route.ActionArgs);
const awarded = { awarded: ["yes"], format: ["Trade paperback"] };

beforeEach(() => {
  state.segments = undefined;
  state.busy = false;
  analytics.trackServer.mockClear();
});

describe("/api/segments", () => {
  it("saves one and answers the new list, counting it without its name", async () => {
    const response = await post({ intent: "create", name: "Awarded paperbacks", filters: awarded });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      segments: [{ name: "Awarded paperbacks", filters: awarded }],
    });
    expect(body.id).toBe(body.segments[0].id);
    expect(analytics.trackServer).toHaveBeenCalledWith("segment_saved", {
      intent: "create",
      segments: 1,
      filters: 2,
    });
    expect(JSON.stringify(analytics.trackServer.mock.calls)).not.toContain("Awarded");
    // And the list reads back.
    const read = loader({
      request: new Request("http://localhost/api/segments"),
    } as Route.LoaderArgs);
    expect((await read.json()).segments).toHaveLength(1);
  });

  it("refuses a clash with the clashing name, and the list as it is, counted by reason", async () => {
    await post({ intent: "create", name: "Awarded paperbacks", filters: awarded });
    const response = await post({
      intent: "create",
      name: "AWARDED paperbacks",
      filters: { genre: ["Fiction"] },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      reason: "taken",
      name: "Awarded paperbacks",
      segments: [{ name: "Awarded paperbacks" }],
    });
    expect(analytics.trackServer).toHaveBeenLastCalledWith("segment_refused", {
      intent: "create",
      reason: "taken",
    });
  });

  it("answers a change to one deleted elsewhere with the list without it, so the menu drops it (Plot, section 8)", async () => {
    const made = await (
      await post({ intent: "create", name: "Fiction", filters: { genre: ["Fiction"] } })
    ).json();
    await post({ intent: "delete", id: made.id });
    expect(analytics.trackServer).toHaveBeenLastCalledWith("segment_deleted", { segments: 0 });
    const response = await post({ intent: "rename", id: made.id, name: "Novels" });
    expect(await response.json()).toEqual({ ok: false, reason: "missing", segments: [] });
  });

  it("refuses what isn't a change, and answers a busy save as busy", async () => {
    expect(await (await post("not json")).json()).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      await (await post({ intent: "create", id: "mine", name: "A", filters: awarded })).json(),
    ).toMatchObject({
      reason: "invalid",
    });
    expect(analytics.trackServer).toHaveBeenLastCalledWith("segment_refused", {
      intent: "other",
      reason: "invalid",
    });
    state.busy = true;
    const busy = await post({ intent: "create", name: "A", filters: awarded });
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ ok: false, reason: "busy" });
  });

  it("answers a request with no save as 401, as /api/reports does", async () => {
    const { SaveError } = await import("~/game/store.server");
    session.getGameSession.mockImplementationOnce(() => {
      throw new SaveError("MISSING_SAVE");
    });
    const response = loader({
      request: new Request("http://localhost/api/segments"),
    } as Route.LoaderArgs);
    expect(response.status).toBe(401);
  });
});
