import { afterAll, describe, expect, it, vi } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return mkdtempSync(tmpdir() + "/orbital-alert-");
});
vi.mock("../platform/analytics/instance.server", () => ({ DATA_DIR: directory }));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { markAlertSeen, submitPlan } from "./game.server";
import { saves } from "./session.server";
import { getStationState } from "../shell/station-state";

function request(id: string, method = "POST", origin = "http://localhost") {
  return new Request("http://localhost/alert/seen", {
    method,
    headers: { origin, cookie: "orbital_save=" + id },
  });
}
function status(action: () => unknown, code: number) {
  try {
    action();
    throw new Error("Expected refusal");
  } catch (e) {
    expect(e).toBeInstanceOf(Response);
    expect((e as Response).status).toBe(code);
  }
}
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("the Commerce Office alert", () => {
  it("is unread and pending in a new game, read once seen, and seen only once", () => {
    const save = saves.create();
    const req = request(save.id);
    const queryRevision = saves.read(save.id).queryRevision;
    expect(getStationState(req)).toMatchObject({
      alerts: [{ unread: true }],
      standingOrder: { seen: false, submitted: false },
    });
    markAlertSeen(req);
    // Seeing the memo isn't a data change: a lookup Dewey is running keeps its grant.
    expect(saves.read(save.id).queryRevision).toBe(queryRevision);
    expect(getStationState(req)).toMatchObject({
      alerts: [{ unread: false }],
      standingOrder: { seen: true, submitted: false },
    });
    const revision = saves.read(save.id).revision;
    markAlertSeen(req);
    expect(saves.read(save.id).revision).toBe(revision);
  });

  it("lifts Q1's standing order once its plan is in, and opens Q2's", () => {
    const save = saves.create();
    const req = request(save.id);
    submitPlan(req, { levers: [] });
    expect(getStationState(req).standingOrder).toEqual({
      quarter: "2194-Q2",
      seen: false,
      submitted: false,
    });
  });

  it("takes only same-origin POSTs", () => {
    const save = saves.create();
    status(() => markAlertSeen(request(save.id, "GET")), 405);
    status(() => markAlertSeen(request(save.id, "POST", "http://evil.example")), 403);
    expect(saves.read(save.id).alertsSeen).toBeUndefined();
  });

  it("refuses a save whose seen flag is anything but true", () => {
    const save = saves.create();
    const file = path.join(directory, "saves", save.id + ".json");
    writeFileSync(file, JSON.stringify({ ...saves.read(save.id), alertSeen: false }));
    expect(() => saves.read(save.id)).toThrow();
  });
});
