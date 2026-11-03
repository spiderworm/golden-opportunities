import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { capsFor, spend } from "./usage.server.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function fileIn() {
  const dir = mkdtempSync(path.join(tmpdir(), "usage-"));
  dirs.push(dir);
  return path.join(dir, "data", "usage.json");
}
const DAY = new Date("2026-11-03T10:00:00Z");

describe("the daily caps on Dewey and Alma (David, 3 Nov 2026)", () => {
  it("counts each use, and refuses past the visitor's cap, then past the instance's", () => {
    const file = fileIn();
    const env = { ORBITAL_DEWEY_DAILY_CAP: "3", ORBITAL_DEWEY_VISITOR_DAILY_CAP: "2" };
    const use = (visitor: string | null) => spend("dewey", visitor, { now: DAY, env, file });
    expect([use("save-a"), use("save-a"), use("save-a")]).toEqual([null, null, "visitor"]);
    // Another visitor still has a share, until the copy's own cap.
    expect([use("save-b"), use("save-b")]).toEqual([null, "instance"]);
    // Without a game, only the instance cap applies.
    expect(use(null)).toBe("instance");
  });

  it("keeps Dewey's and Alma's counts apart", () => {
    const file = fileIn();
    const env = { ORBITAL_DEWEY_DAILY_CAP: "1", ORBITAL_ALMA_DAILY_CAP: "1" };
    expect(spend("dewey", "s", { now: DAY, env, file })).toBeNull();
    expect(spend("alma", "s", { now: DAY, env, file })).toBeNull();
    expect(spend("dewey", "s", { now: DAY, env, file })).toBe("instance");
  });

  it("survives a restart, and starts again on a new UTC day", () => {
    const file = fileIn();
    const env = { ORBITAL_DEWEY_DAILY_CAP: "1" };
    expect(spend("dewey", "s", { now: DAY, env, file })).toBeNull();
    // Read again from the file, as after a restart.
    expect(spend("dewey", "s", { now: DAY, env, file })).toBe("instance");
    expect(spend("dewey", "s", { now: new Date("2026-11-04T00:00:01Z"), env, file })).toBeNull();
  });

  it("keeps only counts: a visitor is a hash of their save's id, and the file is the server's alone", () => {
    const file = fileIn();
    spend("dewey", "save-1234567890", { now: DAY, env: {}, file });
    const text = readFileSync(file, "utf8");
    expect(text).not.toContain("save-1234567890");
    expect(JSON.parse(text)).toMatchObject({
      version: 1,
      day: "2026-11-03",
      counts: { dewey: { total: 1 } },
    });
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("starts from nothing when the file is missing or broken", () => {
    const file = fileIn();
    spend("alma", null, { now: DAY, env: {}, file });
    writeFileSync(file, "{not json");
    expect(
      spend("alma", null, { now: DAY, env: { ORBITAL_ALMA_DAILY_CAP: "1" }, file }),
    ).toBeNull();
    writeFileSync(
      file,
      JSON.stringify({ version: 1, day: "2026-11-03", counts: { dewey: { total: "x" } } }),
    );
    expect(
      spend("alma", null, { now: DAY, env: { ORBITAL_ALMA_DAILY_CAP: "1" }, file }),
    ).toBeNull();
  });

  it("reads each cap from its variable, a whole number, with a default otherwise; 0 allows none", () => {
    expect(capsFor("dewey", {})).toEqual({ instance: 300, visitor: 40 });
    expect(capsFor("alma", {})).toEqual({ instance: 200, visitor: 20 });
    expect(
      capsFor("dewey", { ORBITAL_DEWEY_DAILY_CAP: "50", ORBITAL_DEWEY_VISITOR_DAILY_CAP: "x" }),
    ).toEqual({
      instance: 50,
      visitor: 40,
    });
    expect(
      capsFor("alma", { ORBITAL_ALMA_DAILY_CAP: "-1", ORBITAL_ALMA_VISITOR_DAILY_CAP: "1.5" }),
    ).toEqual({
      instance: 200,
      visitor: 20,
    });
    expect(
      spend("dewey", "s", { now: DAY, env: { ORBITAL_DEWEY_DAILY_CAP: "0" }, file: fileIn() }),
    ).toBe("instance");
  });
});
