import { describe, expect, it } from "vitest";
import { waterfall, type PeriodRows } from "~/query/decompose";
import type { QueryResult } from "~/query/types";
import {
  axisCaption,
  axisFoot,
  barLines,
  droveLabels,
  splitLine,
  waterfallBars,
  waterfallBoxes,
  waterfallRows,
} from "./waterfall-chart";

function period(groups: Record<string, [revenue: number, units: number]>): PeriodRows {
  const entries = Object.entries(groups);
  const result = (measure: "revenue" | "units", at: 0 | 1): QueryResult => ({
    columns: [
      { key: "genre", label: "Genre", type: "string", nullable: true },
      { key: measure, label: measure, type: "number", nullable: false },
    ],
    rows: entries.map(([genre, f]) => ({ genre, [measure]: f[at] })),
    total: entries.reduce((t, [, f]) => t + f[at], 0),
    source: "test",
    evidence: {
      unit: null,
      rows: entries.map(([, f]) => ({ n: f[1], se: Math.sqrt(f[at]) })),
      total: { n: 0, se: 0 },
    },
  });
  return { revenue: result("revenue", 0), units: result("units", 1) };
}
const THEN = period({ Fiction: [34300, 2000], Mystery: [20000, 1500], Poetry: [500, 40] });
const NOW = period({ Fiction: [38420, 2100], Mystery: [19000, 1400], Memoir: [400, 16] });
const labels = droveLabels("2193-Q4", "2194-Q1");

describe("the waterfall's bars (Plot's copy, #328)", () => {
  const w = waterfall("genre", THEN, NOW, { split: true });
  const bars = waterfallBars(w, labels);

  it("runs from then's total through each change to now's", () => {
    expect(bars.map((b) => b.label)).toEqual([
      "Q4 2193",
      "Fiction",
      "Mystery",
      "Poetry",
      "Memoir",
      "Q1 2194",
    ]);
    // Each change floats from where the last ended, and the last ends at now's total.
    bars.slice(1, -1).forEach((b, i) => expect(b.from).toBe(bars[i]!.to));
    expect(bars.at(-2)!.to).toBeCloseTo(w.now, 9);
  });

  it("words a bar as Plot wrote it", () => {
    expect(barLines(bars[1]!, "genre", labels)).toEqual([
      "Fiction",
      "Change: +$4,120 (+12.0%)",
      "From $34,300 in Q4 2193 to $38,420 in Q1 2194",
      expect.stringMatching(/^Price [+-]\$[\d,]+ · Volume [+-]\$[\d,]+ · Mix [+-]\$[\d,]+$/),
    ]);
    expect(barLines(bars[0]!, "genre", labels)).toEqual(["Q4 2193: $54,800"]);
    expect(barLines(bars[4]!, "genre", labels).slice(1, 2)).toEqual(["Change: +$400 (New)"]);
    expect(barLines(bars[3]!, "genre", labels)[1]).toBe("Change: -$500 (-100.0%)");
  });

  it("says a new or gone group's split in words, never as a price of $0", () => {
    const vm = { price: 0, volume: 240, mix: 160 };
    expect(splitLine(vm, "new", labels)).toBe(
      "New in Q1 2194, so no price change: Volume +$240 · Mix +$160",
    );
    expect(splitLine({ price: 0, volume: -240, mix: -160 }, "gone", labels)).toBe(
      "Not sold in Q1 2194, so no price change: Volume -$240 · Mix -$160",
    );
    expect(barLines(bars[4]!, "genre", labels).at(-1)).toMatch(/^New in Q1 2194, so no price/);
  });

  it("names the rest's count, and flags a change within noise", () => {
    const top = waterfallBars(waterfall("genre", THEN, NOW, { top: 1 }), labels);
    const rest = top.at(-2)!;
    expect(rest.label).toBe("Everything else");
    expect(barLines(rest, "genre", labels)[1]).toBe("3 more genres, together");
    // +$30 against 1.96 x sqrt(1,000 + 1,030) = 88: within noise.
    const quiet = waterfallBars(
      waterfall("genre", period({ Fiction: [1000, 50] }), period({ Fiction: [1030, 51] })),
      labels,
    );
    expect(barLines(quiet[1]!, "genre", labels)[1]).toBe("Change: +$30 (+3.0%) · within noise");
  });

  it("draws a change in one box, or with the split, as price, volume and mix in turn", () => {
    const foot = axisFoot(bars);
    expect(foot).toBeLessThan(Math.min(w.then, w.now));
    const plain = waterfallBoxes(bars, foot, false);
    expect(plain).toHaveLength(bars.length);
    const parts = waterfallBoxes(bars, foot, true).filter((b) => b.bar === 1);
    // The split's boxes cover the bar's change exactly, end to end.
    const span = parts.reduce((t, p) => t + (p.high - p.low), 0);
    const signed = w.groups[0]!.split!;
    expect(span).toBeCloseTo(
      Math.abs(signed.price) + Math.abs(signed.volume) + Math.abs(signed.mix),
      9,
    );
  });

  it("gives the table each group, the rest and the total, with the split's parts", () => {
    const rows = waterfallRows(w, labels, true);
    expect(rows.map((r) => r.name)).toEqual(["Fiction", "Mystery", "Poetry", "Memoir", "Total"]);
    expect(rows[0]).toMatchObject({ then: "$34,300", now: "$38,420", change: "+$4,120" });
    expect(rows.at(-1)!.parts).toHaveLength(3);
    expect(waterfallRows(w, labels, false)[0]).not.toHaveProperty("parts");
    // Memoir is new: its price is None, never a measured $0 (Plot, #328).
    expect(rows[3]!.parts![0]).toBe("None");
  });

  it("starts the value axis on a round number below every change", () => {
    const foot = axisFoot(bars);
    // The changes span some $5,000 here, so it's a round thousand.
    expect(foot % 1000).toBe(0);
    // And it says so, in the axis's own format (Plot, #335); nothing when it starts at zero.
    expect(axisCaption(80000)).toBe("The axis starts at $80K, not at zero, so small changes show.");
    expect(axisCaption(0)).toBeNull();
    expect(foot).toBeLessThan(Math.min(...bars.map((b) => Math.min(b.from || Infinity, b.to))));
  });
});
