// A played quarter's forecast against what happened, and the running calibration, from a real save.
import { afterAll, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return mkdtempSync(tmpdir() + "/orbital-scoring-");
});
vi.mock("../platform/analytics/instance.server", () => ({
  DATA_DIR: directory,
  instanceId: () => "0123abcd-0000-4000-8000-000000000000",
}));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { getOutcome, getPlan } from "../game/game.server";
import { saves } from "../game/session.server";
import { trackServer } from "../platform/analytics/analytics.server";
import { action as decideAction } from "../decide/route";
import type { Route as DecideRoute } from "../decide/+types/route";
import { calibration, forecastResult } from "./forecast.server";

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const request = (id: string, body?: string) =>
  new Request("http://localhost/decide", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      cookie: "orbital_save=" + id,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
const file = (id: string, body: string) =>
  decideAction({ request: request(id, body) } as DecideRoute.ActionArgs);

describe("a forecast scored against its quarter", () => {
  it("compares with the quarter's own result, records hit or miss, and builds the calibration", async () => {
    const save = saves.create();
    expect(calibration(request(save.id))).toMatchObject({ forecast: 0, played: 0 });

    vi.mocked(trackServer).mockClear();
    // Q1: a revenue range wide enough to hold anything, units one that can't.
    expect(
      await file(
        save.id,
        "levers=events&forecastRevenue=150000%2C0%2C10000000&forecastUnits=1%2C0%2C1&forecastNote=Wide.",
      ),
    ).toEqual({ ok: true });
    const outcome = getOutcome(request(save.id))!;
    const q1 = forecastResult(request(save.id), "2194-Q1")!;
    expect(q1.note).toBe("Wide.");
    expect(q1.revenue!.actual).toBeCloseTo(outcome.totals.plan.revenue, 6);
    expect(q1.revenue).toMatchObject({ where: "inside" });
    expect(q1.revenue!.error).toBeCloseTo(150000 - outcome.totals.plan.revenue, 6);
    expect(q1.units).toMatchObject({ actual: outcome.totals.plan.units, where: "above" });
    expect(q1.units!.errorPct).toBeCloseTo(
      (1 - outcome.totals.plan.units) / outcome.totals.plan.units,
      12,
    );
    const scored = vi.mocked(trackServer).mock.calls.filter(([n]) => n === "forecast_scored");
    expect(scored).toEqual([
      ["forecast_scored", { quarter: "2194-Q1", revenue: "hit", units: "miss" }],
    ]);
    expect(JSON.stringify(vi.mocked(trackServer).mock.calls)).not.toMatch(/Wide|150000/);

    // Q2 played without one: counted as played, not forecast, and not scored.
    vi.mocked(trackServer).mockClear();
    expect(await file(save.id, "picks=%2C%2C&levers=&quarter=2194-Q2")).toEqual({ ok: true });
    expect(getPlan(request(save.id), "2194-Q2")).not.toBeNull();
    expect(forecastResult(request(save.id), "2194-Q2")).toBeNull();
    expect(vi.mocked(trackServer).mock.calls.some(([n]) => n === "forecast_scored")).toBe(false);

    const c = calibration(request(save.id));
    expect(c).toMatchObject({ forecast: 1, played: 2 });
    expect(c.revenue).toMatchObject({ n: 1, hits: 1, hitRate: 1, judged: false });
    expect(c.units).toMatchObject({ n: 1, hits: 0, hitRate: 0, judged: false });
    expect(c.history).toEqual([{ quarter: "2194-Q1", revenue: q1.revenue, units: q1.units }]);
  });

  it("is null for a quarter with no forecast or not played", () => {
    const save = saves.create();
    expect(forecastResult(request(save.id), "2194-Q1")).toBeNull();
    expect(forecastResult(request(save.id), "2194-Q3")).toBeNull();
  });
});
