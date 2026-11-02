import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import tables from "~/bookshop/data.json";
import { joinBookshop } from "~/bookshop/joins";
import type { BookshopTables } from "~/bookshop/types";
import { baseline, eventWeeks, historyOf, JOIN_MIN_COPIES, monthsOf, OBSERVED_EXTRAS, quarterDays, replayedDay, run, streamName, unpromoted, withRelease, type QuarterNumber } from "./model";
import { RELEASE } from "./release";
import { simulateQuarter } from "./simulate";
import type { Plan } from "./types";

const data = joinBookshop(tables as BookshopTables);
const QUARTERS: QuarterNumber[] = [1, 2, 3, 4];
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const NONE = { picks: [null, null, null], sale: null, events: false };

describe("any quarter", () => {
  it("keeps M1's Q1 output exactly", { timeout: 30_000 }, () => {
    // A fingerprint of every plan on three seeds. It was dcd2472a… before the new volume
    // (m1-new-volume.md), and the volume was that change's only one: without its orders, anchor,
    // fact and copy, the model gave dcd2472a… again. It was cf924259… until generated copies
    // joined existing orders.
    const hash = createHash("sha256");
    const plans = [[], ["repick"], ["events"], ["sale"], ["repick", "events"], ["repick", "sale"], ["events", "sale"]];
    for (const levers of plans) for (const seed of [1, 2, 3]) hash.update(JSON.stringify(simulateQuarter({ levers } as Plan, seed, data)));
    expect(hash.digest("hex")).toBe("d980df65fe0b055e42d7c1863c078e7fcfa60530aaed513719b579b48b76ee7e");
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

describe("generated copies and the orders they join", () => {
  const sizes = (isbn: string) => {
    const orders = new Map<string, number>();
    for (const l of data.saleLines) orders.set(l.orderId, (orders.get(l.orderId) ?? 0) + 1);
    const copies = data.saleLines.filter((l) => l.isbn === isbn || l.book.id === isbn);
    return copies.filter((l) => orders.get(l.orderId)! > 1).length / copies.length;
  };

  it("joins with the edition's own 2193 share, volume 2's for the new volume, and 2193's for a rare edition", () => {
    const history = historyOf(data, 2);
    const copies = new Map<string, number>();
    for (const l of data.saleLines) copies.set(l.isbn, (copies.get(l.isbn) ?? 0) + 1);
    const common = [...copies].find(([, n]) => n >= JOIN_MIN_COPIES)![0];
    const rare = [...copies].find(([, n]) => n < JOIN_MIN_COPIES)![0];
    expect(history.joinShare(common)).toBeCloseTo(sizes(common), 12);
    expect(history.joinShare(RELEASE.edition.isbn)).toBeCloseTo(sizes(RELEASE.ratedLike), 12);
    expect(history.joinShare(rare)).toBeCloseTo(0.21, 2);
    expect(history.joinShare(RELEASE.edition.isbn)).toBeCloseTo(0.21, 1);
  });

  it("puts a Book of the Month's extras into baseline orders about as often, the same for every plan", () => {
    const history = historyOf(data, 2);
    const isbn = data.saleLines.find((l) => l.title === "Land Water Sky Space" && l.format === "Hardcover")!.isbn;
    let joined = 0;
    let extras = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const base = baseline(history, seed);
      const levers = { ...NONE, picks: [isbn, null, null] };
      const r = run(history, base, seed, levers);
      for (const o of r.orders)
        for (const i of o.items)
          if (i.extra) {
            extras += 1;
            if (o.items.length > 1) joined += 1;
          }
      // Author nights add orders, but not hosts: the extras land in the same orders.
      const withNights = run(history, base, seed, { ...levers, events: true });
      const hosts = (orders: typeof r.orders) => orders.slice(0, base.length).map((o) => o.items.filter((i) => i.extra).length);
      expect(hosts(withNights.orders)).toEqual(hosts(r.orders));
    }
    expect(joined / extras).toBeGreaterThan(history.joinShare(isbn) - 0.1);
    expect(joined / extras).toBeLessThan(history.joinShare(isbn) + 0.1);
  });

  it("never changes the baseline it joins", () => {
    const history = historyOf(data, 1);
    const base = baseline(history, 7);
    const before = JSON.stringify(base);
    const orders = withRelease(history, base, 7);
    expect(JSON.stringify(base)).toBe(before);
    expect(orders.slice(0, base.length).some((o, i) => o !== base[i])).toBe(true);
  });
});
