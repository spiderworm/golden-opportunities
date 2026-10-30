import { beforeEach, describe, expect, it, vi } from "vitest";

const game = vi.hoisted(() => ({ getPlan: vi.fn(), submitPlan: vi.fn() }));
vi.mock("~/game/game.server", () => game);
vi.mock("~/platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));

import { action } from "./route";
import type { Route } from "./+types/route";

const post = (body = "levers=repick%2Cevents") =>
  new Request("http://localhost/decide", {
    method: "POST",
    body,
    headers: { origin: "http://localhost", "content-type": "application/x-www-form-urlencoded" },
  });

/** The action's answer: its data and status, whether returned plainly or with data(). */
async function act(request: Request) {
  const result = (await action({ request } as Route.ActionArgs)) as unknown as { data?: unknown; init?: ResponseInit | null };
  return "data" in result && result.init !== undefined ? { data: result.data, status: result.init?.status ?? 200 } : { data: result, status: 200 };
}

describe("the Decide action", () => {
  beforeEach(() => {
    game.getPlan.mockReset().mockReturnValue(null);
    game.submitPlan.mockReset().mockReturnValue({ outcomeId: "x" });
  });

  it("submits the plan", async () => {
    expect(await act(post())).toEqual({ data: { ok: true }, status: 200 });
    expect(game.submitPlan).toHaveBeenCalledWith(expect.any(Request), { levers: ["repick", "events"] });
  });

  it("sends a second plan to the results", async () => {
    game.getPlan.mockReturnValue({ levers: [] });
    expect(await act(post())).toEqual({ data: { ok: false, played: true }, status: 409 });
    expect(game.submitPlan).not.toHaveBeenCalled();
  });

  // Chart's note on #55: the game refuses with a Response, which mustn't reach the error page.
  it("answers the game's refusals instead of throwing them", async () => {
    // Lost the race: another tab's plan went in first.
    game.submitPlan.mockImplementation(() => {
      game.getPlan.mockReturnValue({ levers: ["sale"] });
      throw new Response("This quarter has already been played.", { status: 409 });
    });
    expect(await act(post())).toEqual({ data: { ok: false, played: true }, status: 409 });
    game.getPlan.mockReturnValue(null);
    game.submitPlan.mockImplementation(() => {
      throw new Response("Save storage is full. Try again later.", { status: 503 });
    });
    expect(await act(post())).toEqual({ data: { ok: false, played: false }, status: 503 });
    game.getPlan.mockImplementation(() => {
      throw new Response("Start a game.", { status: 401 });
    });
    expect(await act(post())).toEqual({ data: { ok: false, played: false }, status: 401 });
  });

  // Frank's probe on #60: 409 also means a busy or stale save, with no plan in.
  it("doesn't call a busy save played", async () => {
    game.submitPlan.mockImplementation(() => {
      throw new Response("Game state changed. Reload and try again.", { status: 409 });
    });
    expect(await act(post())).toEqual({ data: { ok: false, played: false }, status: 409 });
    game.getPlan.mockImplementation(() => {
      throw new Response("Game state changed. Reload and try again.", { status: 409 });
    });
    expect(await act(post())).toEqual({ data: { ok: false, played: false }, status: 409 });
  });

  it("still throws what isn't a refusal", async () => {
    game.submitPlan.mockImplementation(() => {
      throw new Error("bug");
    });
    await expect(act(post())).rejects.toThrow("bug");
  });
});
