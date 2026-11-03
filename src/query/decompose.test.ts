import { describe, expect, it } from "vitest";
import { waterfall, type PeriodRows, type Split } from "./decompose";
import type { QueryResult } from "./types";

/** A period's revenue and units by genre, as the query layer gives them, with Poisson-style standard errors. */
function period(groups: Record<string, [revenue: number, units: number]>): PeriodRows {
  const entries = Object.entries(groups);
  const result = (measure: "revenue" | "units", at: 0 | 1): QueryResult => ({
    columns: [
      { key: "genre", label: "Genre", type: "string", nullable: true },
      { key: measure, label: measure, type: "number", nullable: false },
    ],
    rows: entries.map(([genre, figures]) => ({ genre, [measure]: figures[at] })),
    total: entries.reduce((t, [, figures]) => t + figures[at], 0),
    source: "test",
    evidence: {
      unit: null,
      rows: entries.map(([, figures]) => ({ n: figures[1], se: Math.sqrt(figures[at]) * 3 })),
      total: { n: 0, se: 0 },
    },
  });
  return { revenue: result("revenue", 0), units: result("units", 1) };
}

const sum = (s: Split) => s.price + s.volume + s.mix;
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

/** Goldy's totals, from the rows: volume (U1 − U0)·P̄0, mix U1·(Σ s1·p0 − P̄0), price Σ U1·(p1 − p0). */
function goldy(a: Record<string, [number, number]>, b: Record<string, [number, number]>): Split {
  const U0 = Object.values(a).reduce((t, [, u]) => t + u, 0);
  const U1 = Object.values(b).reduce((t, [, u]) => t + u, 0);
  const R0 = Object.values(a).reduce((t, [r]) => t + r, 0);
  const P0 = R0 / U0;
  let shares = 0;
  let price = 0;
  for (const [g, [r1, u1]] of Object.entries(b)) {
    if (!u1) continue;
    const p1 = r1 / u1;
    const p0 = a[g]?.[1] ? a[g]![0] / a[g]![1] : p1;
    shares += (u1 / U1) * p0;
    price += u1 * (p1 - p0);
  }
  return { volume: (U1 - U0) * P0, mix: U1 * (shares - P0), price };
}

const THEN = {
  Fiction: [3430, 200],
  Mystery: [1500, 150],
  Poetry: [120, 10],
  Travel: [900, 30],
} as Record<string, [number, number]>;
// Fiction up in price and units, Mystery down, Poetry gone, Memoir new, Travel the same.
const NOW = {
  Fiction: [3842, 210],
  Mystery: [1302, 140],
  Memoir: [400, 16],
  Travel: [900, 30],
} as Record<string, [number, number]>;

describe("a waterfall of revenue's change (David, 3 Nov 2026)", () => {
  it("runs from then to now through each group's change, largest first, and sums exactly", () => {
    const w = waterfall("genre", period(THEN), period(NOW));
    expect(w.then).toBe(5950);
    expect(w.now).toBe(6444);
    expect(w.groups.map((g) => [g.key, g.change])).toEqual([
      ["Fiction", 412],
      ["Memoir", 400],
      ["Mystery", -198],
      ["Poetry", -120],
      ["Travel", 0],
    ]);
    expect(w.rest).toBeNull();
    close(
      w.groups.reduce((t, g) => t + g.change, 0),
      w.now - w.then,
    );
  });

  it("puts the groups past the top few in one, which still sums exactly", () => {
    const w = waterfall("genre", period(THEN), period(NOW), { top: 2 });
    expect(w.groups.map((g) => g.key)).toEqual(["Fiction", "Memoir"]);
    expect(w.rest).toMatchObject({ count: 3, then: 2520, now: 2202, change: -318 });
    close(w.groups.reduce((t, g) => t + g.change, 0) + w.rest!.change, w.now - w.then);
  });

  it("flags a group's change within noise from the two figures' spread", () => {
    const w = waterfall("genre", period(THEN), period(NOW));
    const noise = Object.fromEntries(w.groups.map((g) => [g.key, g.noise]));
    // Fiction +412 against 1.96 x 3 x sqrt(3,430 + 3,842) = 501: within noise. Memoir +400 against 1.96 x 60 = 118: clear.
    expect(noise).toMatchObject({ Fiction: true, Memoir: false, Travel: true });
  });

  it("makes no claim about noise when a figure has no spread", () => {
    const now = period(NOW);
    now.revenue.evidence!.rows[0] = { n: 0, se: null };
    expect(waterfall("genre", period(THEN), now).groups[0]!.noise).toBeNull();
  });
});

describe("price, volume and mix", () => {
  it("split each group's change exactly, and sum over the groups to Goldy's totals", () => {
    const w = waterfall("genre", period(THEN), period(NOW), { split: true });
    for (const g of w.groups) close(sum(g.split!), g.change);
    const whole = w.split as Split;
    close(sum(whole), w.now - w.then);
    const want = goldy(THEN, NOW);
    close(whole.volume, want.volume);
    close(whole.mix, want.mix);
    close(whole.price, want.price);
  });

  it("gives a new group and a gone one no price change, only volume and mix", () => {
    const w = waterfall("genre", period(THEN), period(NOW), { split: true });
    const at = (key: string) => w.groups.find((g) => g.key === key)!.split!;
    close(at("Memoir").price, 0);
    close(at("Poetry").price, 0);
    // Memoir: 16 units at the old average price (5,950 / 390) as volume, the rest of its $400 as mix.
    close(at("Memoir").volume, 16 * (5950 / 390));
    close(at("Memoir").mix, 400 - 16 * (5950 / 390));
    close(at("Poetry").volume + at("Poetry").mix, -120);
    // Their lines say so in words, not as a measured zero (Plot, #328).
    const presence = Object.fromEntries(w.groups.map((g) => [g.key, g.presence]));
    expect(presence).toEqual({
      Fiction: undefined,
      Memoir: "new",
      Mystery: undefined,
      Poetry: "gone",
      Travel: undefined,
    });
    // Travel didn't change at all.
    expect(at("Travel")).toEqual({ price: 0, volume: 0, mix: 0 });
  });

  it("sums the rest's splits too", () => {
    const w = waterfall("genre", period(THEN), period(NOW), { split: true, top: 2 });
    close(sum(w.rest!.split!), w.rest!.change);
    close(sum(w.split as Split), w.now - w.then);
  });

  it("has no mix with a single group, and all price when only prices moved", () => {
    const w = waterfall(
      "genre",
      period({ Fiction: [1000, 100] }),
      period({ Fiction: [1200, 100] }),
      {
        split: true,
      },
    );
    expect(w.split).toEqual({ price: 200, volume: 0, mix: 0 });
  });

  it("can't split from nothing sold then, without units, or past a row limit", () => {
    const empty = waterfall("genre", period({}), period(NOW), { split: true });
    expect(empty.split).toEqual({ problem: "nothing_then" });
    expect(empty.then).toBe(0);
    expect(empty.groups).toHaveLength(4);
    const noUnits = { revenue: period(NOW).revenue };
    expect(waterfall("genre", period(THEN), noUnits, { split: true }).split).toEqual({
      problem: "no_units",
    });
    const cut = period(NOW);
    cut.units!.truncated = true;
    expect(waterfall("genre", period(THEN), cut, { split: true }).split).toEqual({
      problem: "truncated",
    });
  });

  it("leaves the split out unless it's asked for", () => {
    const w = waterfall("genre", period(THEN), period(NOW));
    expect(w).not.toHaveProperty("split");
    expect(w.groups[0]).not.toHaveProperty("split");
  });
});
