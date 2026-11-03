import { describe, expect, it } from "vitest";

import type { GameSave } from "~/game/types";
import {
  checkReport,
  editCounts,
  REPORT_LIMITS,
  reportCounts,
  validReports,
  type PlayerReport,
} from "./player";
import { applyReportChange, changeFrom } from "./player.server";

const spec = (title = "Revenue by quarter") => ({
  title,
  kind: "bar" as const,
  query: { measure: "revenue" as const, by: ["quarter" as const] },
});
const input = (extra: Record<string, unknown> = {}) => ({
  title: "The quiet picks",
  items: [{ spec: spec(), note: "Hardcovers sold\nmore in March." }],
  ...extra,
});
const save = (extra: Partial<GameSave> = {}) => ({ played: [], ...extra }) as unknown as GameSave;
let n = 0;
const id = () => `id-${++n}`;

describe("a player's report", () => {
  it("takes a title, up to six charts with notes, and a summary, all plain text", () => {
    expect(checkReport(input({ summary: "Why I think so." }))).toMatchObject({ ok: true });
    // Trimmed, and empty notes and summaries left out.
    expect(checkReport(input({ title: "  Weekdays  ", summary: "" }))).toEqual({
      ok: true,
      report: { title: "Weekdays", items: input().items },
    });
  });

  it("says why it refuses, as report_refused names it", () => {
    expect(checkReport(input({ title: "  " }))).toEqual({ ok: false, reason: "no_title" });
    expect(checkReport(input({ items: [] }))).toEqual({ ok: false, reason: "no_charts" });
    const seven = Array.from({ length: 7 }, (_, i) => ({ spec: spec(`Chart ${i}`) }));
    expect(checkReport(input({ items: seven }))).toEqual({ ok: false, reason: "full" });
    for (const bad of [
      input({ title: "x".repeat(REPORT_LIMITS.title + 1) }),
      input({ title: "Two\nlines" }),
      input({ title: "Hidden \u202e mark" }),
      input({ summary: "Isolated \u2067 text" }),
      input({ items: [{ spec: spec(), note: "Arabic mark \u061c" }] }),
      input({ title: "Zero\u200bwidth" }),
      input({ summary: "Word\u2060joiner" }),
      input({ items: [{ spec: spec(), note: "\ufeffByte order mark" }] }),
      input({ summary: "x".repeat(REPORT_LIMITS.summary + 1) }),
      input({ summary: "Bell \u0007" }),
      input({ items: [{ spec: spec(), note: "x".repeat(REPORT_LIMITS.note + 1) }] }),
      input({ items: [{ spec: { ...spec(), kind: "pie" } }] }),
      input({ items: [{ spec: spec(), extra: 1 }] }),
      input({ id: "mine" }),
      "not a report",
    ])
      expect(checkReport(bad)).toEqual({ ok: false, reason: "invalid" });
  });

  it("is made with the server's id, stamped with the quarter being played", () => {
    const made = applyReportChange(save(), { intent: "create", report: input() }, () => "abc");
    expect(made).toEqual({
      ok: true,
      id: "abc",
      reports: [{ id: "abc", ...input(), created: "2194-Q1", edited: "2194-Q1" }],
    });
  });

  it("keeps when it was made and stamps when it was edited; deletes; refuses what isn't there", () => {
    const old: PlayerReport = {
      id: "r1",
      ...input(),
      created: "2194-Q1",
      edited: "2194-Q1",
    };
    const played = [
      { period: "2194-Q1", outcome: { reportCard: { plan: { overall: { score: 80 } } } } },
    ];
    const later = save({ reports: [old], played } as unknown as Partial<GameSave>);
    const edited = applyReportChange(
      later,
      { intent: "update", id: "r1", report: input({ title: "Renamed" }) },
      id,
    );
    expect(edited.ok && edited.reports[0]).toMatchObject({
      id: "r1",
      title: "Renamed",
      created: "2194-Q1",
      edited: "2194-Q2",
    });
    expect(applyReportChange(later, { intent: "delete", id: "r1" }, id)).toEqual({
      ok: true,
      id: "r1",
      reports: [],
    });
    expect(applyReportChange(later, { intent: "delete", id: "nope" }, id)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("stops at twelve reports", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      ...input(),
      created: "2194-Q1" as const,
      edited: "2194-Q1" as const,
    }));
    expect(validReports(twelve)).toBe(true);
    expect(
      applyReportChange(save({ reports: twelve }), { intent: "create", report: input() }, id),
    ).toEqual({ ok: false, reason: "limit" });
    expect(validReports([...twelve, { ...twelve[0]!, id: "r12" }])).toBe(false);
  });

  it("can't be made or edited once the panel has removed the player", () => {
    const strike = { outcome: { reportCard: { plan: { overall: { score: 50 } } } } };
    const removed = save({
      played: [strike, strike, strike].map((q, i) => ({ ...q, period: `2194-Q${i + 1}` })),
    } as unknown as Partial<GameSave>);
    expect(applyReportChange(removed, { intent: "create", report: input() }, id)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("is checked whole in the save: ids distinct and server-shaped, quarters real", () => {
    const one = { id: "r1", ...input(), created: "2194-Q1", edited: "2194-Q1" };
    expect(validReports([one])).toBe(true);
    expect(validReports([one, one])).toBe(false);
    expect(validReports([{ ...one, id: "<script>" }])).toBe(false);
    expect(validReports([{ ...one, edited: "2194-Q9" }])).toBe(false);
    expect(validReports([{ ...one, title: "" }])).toBe(false);
    expect(validReports("nope")).toBe(false);
  });

  it("reads a change from the form, refusing a malformed one", () => {
    const form = (fields: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(fields)) f.set(k, v);
      return f;
    };
    expect(changeFrom(form({ intent: "create", report: JSON.stringify(input()) }))).toEqual({
      intent: "create",
      report: input(),
    });
    expect(changeFrom(form({ intent: "delete", id: "r1" }))).toEqual({
      intent: "delete",
      id: "r1",
    });
    expect(changeFrom(form({ intent: "update", report: "{}" }))).toBeNull();
    expect(changeFrom(form({ intent: "create", report: "{" }))).toBeNull();
  });

  it("counts what an edit did, and a report's shape, without a word of it", () => {
    // Charts are told apart by their query (pinKey), not their title or view.
    const by = (d: "genre" | "format" | "publisher" | "month") => ({
      ...spec(d),
      query: { measure: "revenue" as const, by: [d] },
    });
    const a = { spec: by("genre") };
    const b = { spec: by("format"), note: "why" };
    const c = { spec: by("publisher") };
    const before = { title: "Old", items: [a, b, c] };
    expect(editCounts(before, { title: "New", items: [c, a, { spec: by("month") }] })).toEqual({
      renamed: true,
      added: 1,
      removed: 1,
      moved: 2,
    });
    // A view toggled, or a chart renamed, is neither added nor removed.
    expect(
      editCounts(before, {
        title: "Old",
        items: [{ spec: { ...a.spec, title: "Renamed", table: true } }, b, c],
      }),
    ).toEqual({ renamed: false, added: 0, removed: 0, moved: 0 });
    expect(editCounts(before, before)).toEqual({ renamed: false, added: 0, removed: 0, moved: 0 });
    expect(reportCounts({ title: "T", summary: "S", items: [a, b] })).toEqual({
      charts: 2,
      notes: 1,
      summary: true,
    });
  });
});

describe("report items' keys (Audit, #314)", () => {
  it("stay unique when an old report holds a chart and its table, and follow each chart when it moves", async () => {
    const { itemKeys } = await import("./PlayerReports");
    const bar = {
      spec: {
        title: "A",
        kind: "bar" as const,
        query: { measure: "revenue" as const, by: ["genre" as const] },
      },
    };
    const table = { spec: { ...bar.spec, title: "B", kind: "table" as const } };
    const other = { spec: { ...bar.spec, query: { ...bar.spec.query, by: ["format" as const] } } };
    const keys = itemKeys([bar, table, other]);
    expect(new Set(keys).size).toBe(3);
    expect(itemKeys([other, bar, table])).toEqual([keys[2], keys[0], keys[1]]);
  });
});
