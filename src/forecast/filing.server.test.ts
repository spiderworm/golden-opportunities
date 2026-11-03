// A forecast filed through Decide's action, into the save it plays (src/forecast/forecast.ts).
import { afterAll, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return mkdtempSync(tmpdir() + "/orbital-forecast-");
});
vi.mock("../platform/analytics/instance.server", () => ({
  DATA_DIR: directory,
  instanceId: () => "0123abcd-0000-4000-8000-000000000000",
}));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { saves } from "../game/session.server";
import { createSaveStore } from "../game/store.server";
import { trackServer } from "../platform/analytics/analytics.server";
import { action as decideAction } from "../decide/route";
import type { Route as DecideRoute } from "../decide/+types/route";

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const file = (id: string, body: string) =>
  decideAction({
    request: new Request("http://localhost/decide", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        cookie: "orbital_save=" + id,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    }),
  } as DecideRoute.ActionArgs);

describe("a forecast filed with the plan", () => {
  it("is written with the quarter it plays, and recorded without its figures or note", async () => {
    const save = saves.create();
    vi.mocked(trackServer).mockClear();
    expect(
      await file(
        save.id,
        "levers=events&forecastRevenue=140%2C000%2C130000%2C150000&forecastUnits=9000%2C8000%2C10000&forecastNote=A+hunch.",
      ),
    ).toMatchObject({ data: { ok: false, problem: "forecast" } });
    // The comma in "140,000" splits the field into four parts: refused, and nothing is played.
    expect(saves.read(save.id).played).toHaveLength(0);

    expect(
      await file(
        save.id,
        "levers=events&forecastRevenue=140000%2C130000%2C150000&forecastUnits=%2C%2C&forecastNote=A+hunch.",
      ),
    ).toEqual({ ok: true });
    const after = saves.read(save.id);
    expect(after.played.map((q) => q.period)).toEqual(["2194-Q1"]);
    expect(after.forecasts).toEqual([
      {
        quarter: "2194-Q1",
        revenue: { point: 140000, low: 130000, high: 150000 },
        note: "A hunch.",
      },
    ]);
    const made = vi.mocked(trackServer).mock.calls.filter(([name]) => name === "forecast_made");
    expect(made).toEqual([
      ["forecast_made", { quarter: "2194-Q1", measures: "revenue", hadNote: true }],
    ]);
    expect(JSON.stringify(vi.mocked(trackServer).mock.calls)).not.toMatch(/hunch|140000/);
    // It survives a reopened store: validate() takes it.
    expect(createSaveStore(path.join(directory, "saves")).read(save.id).forecasts).toHaveLength(1);
  });

  it("is refused by its field, filing nothing, and a plan without one files none", async () => {
    const save = saves.create();
    const refused = await file(save.id, "levers=&forecastUnits=9000%2C9500%2C10000");
    expect(refused).toMatchObject({
      init: { status: 400 },
      data: {
        ok: false,
        problem: "forecast",
        forecastProblem: { field: "units", reason: "low_above_point" },
      },
    });
    expect(saves.read(save.id).played).toHaveLength(0);
    vi.mocked(trackServer).mockClear();
    expect(await file(save.id, "levers=")).toEqual({ ok: true });
    expect(saves.read(save.id).forecasts).toBeUndefined();
    expect(vi.mocked(trackServer).mock.calls.some(([name]) => name === "forecast_made")).toBe(
      false,
    );
  });

  it("goes to the quarter played, a later quarter's as Q1's", async () => {
    const save = saves.create();
    await file(save.id, "levers=");
    expect(
      await file(save.id, "picks=%2C%2C&levers=&quarter=2194-Q2&forecastUnits=1%2C0%2C2"),
    ).toEqual({ ok: true });
    expect(saves.read(save.id).forecasts).toEqual([
      { quarter: "2194-Q2", units: { point: 1, low: 0, high: 2 } },
    ]);
  });

  it("can't be written into a save by hand for a quarter not played", () => {
    const save = saves.create();
    expect(() =>
      saves.update(save.id, save.revision, (s) => {
        s.forecasts = [{ quarter: "2194-Q1", units: { point: 1, low: 0, high: 2 } }];
      }),
    ).toThrow();
  });
});
