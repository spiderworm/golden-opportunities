import { describe, expect, it } from "vitest";

import { quarterAt } from "~/simulation/quarters";
import { DECIDE_Q2_COPY, planCopy, ROTATING_LINES, teaserOf, type PlanBrief } from "./q2-copy";

const text = (facts: readonly (string | { strong: string })[]) =>
  facts.map((f) => (typeof f === "string" ? f : f.strong)).join("");
const brief = (over: Partial<PlanBrief> = {}): PlanBrief => ({
  strikes: 0,
  stretch: null,
  formatCost: null,
  authorFare: null,
  lot: false,
  ...over,
});

describe("the plan screen's words, any quarter after Q1 (endless-copy.md section 3)", () => {
  it("are Q2 2194's exactly, from the same rules", () => {
    const q2 = planCopy("2194-Q2");
    expect(q2.heading).toBe(DECIDE_Q2_COPY.heading);
    expect(q2.serial).toBe(DECIDE_Q2_COPY.form.serial);
    expect(q2.playing).toEqual([...DECIDE_Q2_COPY.playing]);
    expect(q2.months).toEqual(["April", "May", "June"]);
    expect(q2.briefing).toBe(DECIDE_Q2_COPY.briefing);
  });

  it("name the quarter, its months and its place in the serial", () => {
    const q3 = planCopy("2194-Q3", brief());
    expect(q3.heading).toBe("PLAN FOR Q3 2194");
    expect(q3.serial).toBe("LKS-2194-Q3-0004");
    expect(planCopy("2195-Q1").serial).toBe("LKS-2195-Q1-0006");
    expect(q3.playing).toEqual(["July...", "August...", "September..."]);
    expect(text(q3.briefing[0]!.facts)).toBe(
      "Q3 2194 runs July 1 to September 30, 2194. Your score is your lowest measure: Profit, Readers served, Happiness or Culture.",
    );
    expect(text(planCopy("2194-Q4").briefing[0]!.facts)).toContain(
      "October 1 to December 31, 2194",
    );
    expect(text(q3.briefing.find((b) => b.boss === "happiness")!.facts)).toBe(
      "The Book of the Month calendar for July, August and September is empty. A pick is 15% off for its whole month.",
    );
    expect(text(q3.briefing.find((b) => b.boss === "profit")!.facts)).toContain(
      "Each goal starts from Q3 2193, adjusted for what the Council expects this quarter, then adds 5%.",
    );
  });

  it("rotate each boss's lines by the quarter's place mod 8, with Mr. Zoolander at most once a brief", () => {
    const q3 = planCopy("2194-Q3", brief());
    expect(q3.briefing.map((b) => b.boss)).toEqual(DECIDE_Q2_COPY.briefing.map((b) => b.boss));
    for (const bubble of q3.briefing) {
      expect(bubble.line).toBe(ROTATING_LINES[bubble.boss][2]);
      expect(bubble.line.startsWith(bubble.teaser)).toBe(true);
      expect(bubble.teaser).toMatch(/[.!?]$/);
    }
    expect(planCopy("2196-Q3", brief()).briefing[0]!.line).toBe(ROTATING_LINES.overall[2]);
    // "MR." doesn't end a teaser.
    expect(teaserOf(ROTATING_LINES.culture[2]!)).toBe("MR. ZOOLANDER HAS READ A BOOK.");
    for (const lines of Object.values(ROTATING_LINES))
      for (const line of lines) expect(teaserOf(line)).not.toMatch(/\bMR\.$/);
    for (let place = 2; place < 18; place++) {
      const zoolanders = planCopy(quarterAt(place), brief()).briefing.filter((b) =>
        b.line.includes("ZOOLANDER"),
      ).length;
      expect(zoolanders).toBeLessThanOrEqual(1);
    }
  });

  it("give the stretched boss Alma's line and its goal, and strike counts to the Administrator", () => {
    const q3 = planCopy(
      "2194-Q3",
      brief({
        strikes: 1,
        stretch: {
          boss: "culture",
          measure: "culture",
          percent: 0.15,
          line: "THE MINISTRY HAS READ A STUDY. IT WAS LONG.",
          recoveryFrom: null,
        },
      }),
    );
    const culture = q3.briefing.find((b) => b.boss === "culture")!;
    expect(culture.line).toBe("THE MINISTRY HAS READ A STUDY. IT WAS LONG.");
    expect(culture.teaser).toBe("THE MINISTRY HAS READ A STUDY.");
    expect(text(culture.facts)).toBe(
      "An author night costs $200: the author's shuttle fare and the room. Its goal for Culture is 15% this quarter, instead of 5%.",
    );
    expect(text(q3.briefing[0]!.facts)).toContain(
      "Strikes counting: 1. Three at once, and the panel removes you.",
    );
    const recovery = planCopy(
      "2194-Q4",
      brief({
        stretch: {
          boss: "happiness",
          measure: "happiness",
          percent: 0.14,
          line: "HAPPINESS FELL 14%. RESTORE IT.",
          recoveryFrom: "2194-Q3",
        },
      }),
    );
    expect(text(recovery.briefing.find((b) => b.boss === "happiness")!.facts)).toContain(
      "Its goal for Happiness is 14% this quarter, to restore its fall in Q3 2194.",
    );
  });

  it("with two strikes counting, stretch no one: every boss rotates", () => {
    const q3 = planCopy("2194-Q3", brief({ strikes: 2 }));
    for (const bubble of q3.briefing) expect(bubble.line).toBe(ROTATING_LINES[bubble.boss][2]);
  });

  it("state format costs and author fares in the facts, and the fare on the author nights move", () => {
    const q3 = planCopy(
      "2194-Q3",
      brief({ formatCost: { format: "Hardcover", percent: 0.67 }, authorFare: 300, lot: true }),
    );
    expect(text(q3.briefing.find((b) => b.boss === "profit")!.facts)).toContain(
      "Hardcover copies cost the store 67% of their list price this quarter; other books, 60%.",
    );
    const lower = planCopy(
      "2194-Q3",
      brief({ formatCost: { format: "trade paperback", percent: 0.65 } }),
    );
    expect(text(lower.briefing.find((b) => b.boss === "profit")!.facts)).toContain(
      "Trade paperback copies cost the store 65%",
    );
    // The data's "Graphic" is a graphic novel in words, as in the event's short title.
    const graphic = planCopy(
      "2194-Q3",
      brief({ formatCost: { format: "Graphic", percent: 0.68 } }),
    );
    expect(text(graphic.briefing.find((b) => b.boss === "profit")!.facts)).toContain(
      "Graphic novel copies cost the store 68%",
    );
    expect(text(q3.briefing.find((b) => b.boss === "culture")!.facts)).toBe(
      "An author night costs $300 this quarter: the author's shuttle fare and the room.",
    );
    expect(text(q3.briefing.find((b) => b.boss === "readers")!.facts)).toContain(
      "An Orbitplace lot is on offer as well.",
    );
    const nights = q3.moves.find((m) => m.id === "events")!;
    expect(nights.figure).toBe("$300 a night");
    expect(nights.line).toMatch(/at \$300 each\.$/);
    expect(planCopy("2194-Q3", brief()).moves.find((m) => m.id === "events")!.figure).toBe(
      "$200 a night",
    );
  });
});
