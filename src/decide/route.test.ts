import { beforeEach, describe, expect, it, vi } from "vitest";

const game = vi.hoisted(() => ({
  getPlan: vi.fn(),
  submitPlan: vi.fn(),
  currentQuarter: vi.fn(),
  submitQuarterPlan: vi.fn(),
  getQuarterBrief: vi.fn(),
}));
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
  const result = (await action({ request } as Route.ActionArgs)) as unknown as {
    data?: unknown;
    init?: ResponseInit | null;
  };
  return "data" in result && result.init !== undefined
    ? { data: result.data, status: result.init?.status ?? 200 }
    : { data: result, status: 200 };
}

describe("the Decide action", () => {
  beforeEach(() => {
    game.getPlan.mockReset().mockReturnValue(null);
    game.submitPlan.mockReset().mockReturnValue({ outcomeId: "x" });
    game.currentQuarter.mockReset().mockReturnValue("2194-Q1");
  });

  it("submits the plan", async () => {
    expect(await act(post())).toEqual({ data: { ok: true }, status: 200 });
    expect(game.submitPlan).toHaveBeenCalledWith(expect.any(Request), {
      levers: ["repick", "events"],
    });
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

describe("the Decide action in Q2", () => {
  const A = "989-28-79-70597-8";
  const B = "989-28-654-6930-3";
  const q2 = (body = `picks=${A}%2C%2C${B}&levers=events`, quarter = "2194-Q2") =>
    post(body.includes("picks=") ? `${body}&quarter=${quarter}` : body);

  beforeEach(() => {
    game.currentQuarter.mockReset().mockReturnValue("2194-Q2");
    // As the game's submitQuarterPlan: a form for a quarter other than the open one is refused as played (#213).
    game.submitQuarterPlan
      .mockReset()
      .mockImplementation((_request: Request, _plan: unknown, expected: string) => {
        if (expected !== game.currentQuarter())
          throw new Response("This quarter has already been played.", { status: 409 });
        return Promise.resolve({ outcomeId: "y" });
      });
    game.submitPlan.mockReset();
  });

  it("submits the picks and the move", async () => {
    expect(await act(q2())).toEqual({ data: { ok: true }, status: 200 });
    expect(game.submitQuarterPlan).toHaveBeenCalledWith(
      expect.any(Request),
      { picks: [A, null, B], levers: ["events"] },
      "2194-Q2",
    );
    expect(game.submitPlan).not.toHaveBeenCalled();
  });

  it("holds course with no picks and no move", async () => {
    expect(await act(q2("picks=%2C%2C&levers="))).toEqual({ data: { ok: true }, status: 200 });
    expect(game.submitQuarterPlan).toHaveBeenCalledWith(
      expect.any(Request),
      { picks: [null, null, null], levers: [] },
      "2194-Q2",
    );
  });

  it("says why the engine refused a plan, and refuses a malformed one at the door", async () => {
    game.submitQuarterPlan.mockImplementation(() => {
      throw Response.json({ problem: "same-title" }, { status: 400 });
    });
    expect(await act(q2())).toEqual({
      data: { ok: false, played: false, problem: "same-title" },
      status: 400,
    });
    expect(await act(q2(`picks=${A}%2C${B}&levers=`))).toEqual({
      data: { ok: false, played: false, problem: "shape" },
      status: 400,
    });
  });

  it("sends a Q1 plan from a tab left open in Q1 to the results: that quarter is played", async () => {
    expect(await act(q2("levers=events"))).toEqual({
      data: { ok: false, played: true },
      status: 409,
    });
    expect(game.submitPlan).not.toHaveBeenCalled();
    expect(game.submitQuarterPlan).not.toHaveBeenCalled();
  });

  it("sends a plan that lost the race to the results, and not a busy save", async () => {
    game.submitQuarterPlan.mockImplementation(() => {
      game.currentQuarter.mockReturnValue(null);
      throw new Response("This quarter has already been played.", { status: 409 });
    });
    expect(await act(q2())).toEqual({ data: { ok: false, played: true }, status: 409 });
    game.currentQuarter.mockReturnValue("2194-Q2");
    game.submitQuarterPlan.mockImplementation(() => {
      throw new Response("Game state changed. Reload and try again.", { status: 409 });
    });
    expect(await act(q2())).toEqual({ data: { ok: false, played: false }, status: 409 });
  });

  it("doesn't send a Q2 plan refused during Q1 to the results", async () => {
    game.currentQuarter.mockReturnValue("2194-Q1");
    game.submitQuarterPlan.mockImplementation(() => {
      throw new Response("Play the first quarter first.", { status: 409 });
    });
    expect(await act(q2())).toEqual({ data: { ok: false, played: false }, status: 409 });
  });

  it("files a plan only for the quarter its form was written for (Frank and Audit, #212)", async () => {
    // A Q2 form left open in another tab, sent once Q3 is open: Q2 was played, so to the results, and nothing is filed.
    game.currentQuarter.mockReturnValue("2194-Q3");
    expect(await act(q2())).toEqual({ data: { ok: false, played: true }, status: 409 });
    // A form for a quarter not yet open isn't played: back to choosing.
    game.currentQuarter.mockReturnValue("2194-Q2");
    expect(await act(q2(undefined, "2194-Q3"))).toEqual({
      data: { ok: false, played: false },
      status: 409,
    });
    // No quarter, or Q1's, is a malformed form.
    expect(await act(post(`picks=${A}%2C%2C${B}&levers=events`))).toEqual({
      data: { ok: false, played: false, problem: "shape" },
      status: 400,
    });
    expect(await act(q2(undefined, "2194-Q1"))).toEqual({
      data: { ok: false, played: false, problem: "shape" },
      status: 400,
    });
  });

  it("answers a save it can't read", async () => {
    const unreadable = () => {
      throw new Response("Start a game.", { status: 401 });
    };
    game.submitQuarterPlan.mockImplementation(unreadable);
    game.currentQuarter.mockImplementation(unreadable);
    expect(await act(q2())).toEqual({ data: { ok: false, played: false }, status: 401 });
  });
});
