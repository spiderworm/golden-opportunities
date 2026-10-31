import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import tables from "~/bookshop/data.json";
import { joinBookshop } from "~/bookshop/joins";
import type { BookshopTables } from "~/bookshop/types";
import { baseline, eventWeeks, historyOf, monthsOf, OBSERVED_EXTRAS, quarterDays, replayedDay, run, streamName, unpromoted, type QuarterNumber } from "./model";
import { simulateQuarter } from "./simulate";
import type { Plan } from "./types";

const data = joinBookshop(tables as BookshopTables);
const QUARTERS: QuarterNumber[] = [1, 2, 3, 4];
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const NONE = { picks: [null, null, null], sale: null, events: false };

describe("any quarter", () => {
  it("keeps M1's Q1 output exactly", { timeout: 30_000 }, () => {
    // A fingerprint of every plan on three seeds, taken before the model took a quarter.
    const hash = createHash("sha256");
    const plans = [[], ["repick"], ["events"], ["sale"], ["repick", "events"], ["repick", "sale"], ["events", "sale"]];
    for (const levers of plans) for (const seed of [1, 2, 3]) hash.update(JSON.stringify(simulateQuarter({ levers } as Plan, seed, data)));
    expect(hash.digest("hex")).toBe("dcd2472a1ff7489780ec91710b6879c926db0db3f89b9da3c880dd10519b5a33");
  });

  it("names each quarter's months and days", () => {
    expect(QUARTERS.map(monthsOf)).toEqual([["01", "02", "03"], ["04", "05", "06"], ["07", "08", "09"], ["10", "11", "12"]]);
    expect(QUARTERS.map((q) => quarterDays(2194, q).length)).toEqual([90, 91, 92, 92]);
    expect(quarterDays(2194, 2)[0]).toBe("2194-04-01");
    expect(quarterDays(2194, 4).at(-1)).toBe("2194-12-31");
  });

  it("replays the same weekday in the same month in every quarter", () => {
    for (const q of QUARTERS)
      for (const day of quarterDays(2194, q)) {
        expect(weekday(replayedDay(day))).toBe(weekday(day));
        expect(replayedDay(day).slice(4, 7)).toBe(day.slice(4, 7));
      }
  });

  it("keeps Q1's stream names and gives later quarters their own", () => {
    expect(streamName(1, "noise")).toBe("noise");
    expect(streamName(2, "noise")).toBe("q2:noise");
  });

  it("takes each quarter's 2193 sales and Books of the Month", () => {
    const histories = QUARTERS.map((q) => historyOf(data, q));
    expect(histories.reduce((t, h) => t + h.lastYear.length, 0)).toBe(data.saleLines.filter((l) => l.date.startsWith("2193-")).length);
    for (const h of histories) expect(h.lastYear.every((l) => h.months.includes(l.date.slice(5, 7)))).toBe(true);
    const q2 = histories[1];
    expect(q2.months.map(q2.observedPick).map((isbn) => q2.template(isbn).title)).toEqual([
      "9803 North Millworks Road",
      "Nothing But Capers",
      "A Horrible Human with the Habits of a Monster",
    ]);
  });

  it("removes Q2 2193's Books of the Month: the extra copies go, the rest return to full price", () => {
    const history = historyOf(data, 2);
    const orders = unpromoted(history, 1);
    for (const month of history.months) {
      const isbn = history.observedPick(month);
      const before = history.lastYear.filter((l) => l.isbn === isbn && l.date.slice(5, 7) === month);
      const after = orders.filter((o) => o.day.slice(5, 7) === month).flatMap((o) => o.items).filter((i) => i.isbn === isbn);
      expect(after.length).toBe(before.length - OBSERVED_EXTRAS[Number(month) - 1]);
      expect(after.some((i) => i.discount === 0.15)).toBe(false);
    }
  });

  it("replays Q2 2194 from Q2 2193, within the noise", () => {
    const history = historyOf(data, 2);
    const base = baseline(history, 1);
    expect(base.every((o) => o.day >= "2194-04-01" && o.day <= "2194-06-30")).toBe(true);
    const source = unpromoted(history, 1).length;
    expect(base.length).toBeGreaterThan(source * 0.96);
    expect(base.length).toBeLessThan(source * 1.04);
    expect(base).not.toEqual(baseline(history, 2));
  });

  it("holds Q2's author nights on Tuesday to Thursday, one week each", () => {
    const weeks = eventWeeks(2);
    expect(weeks).toHaveLength(13);
    for (const week of weeks) for (const day of week) expect([2, 3, 4]).toContain(weekday(day));
    const history = historyOf(data, 2);
    const nights = run(history, baseline(history, 1), 1, { ...NONE, events: true }).nights;
    expect(nights).toHaveLength(12);
    expect(nights.every((n) => n.day >= "2194-04-01" && n.day <= "2194-06-30")).toBe(true);
  });

  it("leaves a month with no Book of the Month alone", () => {
    const history = historyOf(data, 2);
    const base = baseline(history, 1);
    const r = run(history, base, 1, NONE);
    expect(r.picks).toEqual([null, null, null]);
    expect(r.orders).toEqual(base);
  });
});
