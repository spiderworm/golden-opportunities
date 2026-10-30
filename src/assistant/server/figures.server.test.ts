import { describe, expect, it } from "vitest";
import { figuresIn, numbersIn, scrubber, unbackedFigures } from "./figures.server.ts";

describe("figures in a reply", () => {
  it("reads written figures, with the precision they're written to", () => {
    expect(figuresIn("Revenue was $161,524.69 in 2193-Q4, 15% off, about 95,000 and 3rd.").map((f) => [f.value, f.tolerance, f.percent])).toEqual([
      [161524.69, 0.005, false],
      [2193, 0.5, false],
      [15, 0.5, true],
      [95000, 500, false],
    ]);
  });

  it("collects every number a tool returned, in values and inside strings", () => {
    expect(numbersIn({ rows: [{ quarter: "2193-Q4", revenue: 161524.69 }], source: "Sales, 2193" })).toEqual([1, 2193, 161524.69, 2193]);
  });

  it("passes rounded tool figures and small counts, and catches the rest", () => {
    const known = numbersIn({ rows: [{ orders_per_day: 195.15 }, { orders_per_day: 78.4615 }, { avg_discount: 0.15 }], total: 161524.69 });
    expect(unbackedFigures("About 195.2, then 78.46, 78.5 and 78; 15% average discount; $161,525; two lookups, 3 rows.", known)).toEqual([]);
    expect(unbackedFigures("A drop of 15 percent.", known)).toEqual([]);
    expect(unbackedFigures("A drop of about 59.8%, so 116.69 fewer.", known).map((f) => f.text)).toEqual(["59.8%", "116.69"]);
    expect(unbackedFigures("Gross profit was about $63,843.", known).map((f) => f.text)).toEqual(["63,843"]);
  });
});

it("the scrubber hides a secret split across chunks, and holds back only a possible start of it", () => {
  const s = scrubber("abc123def456");
  expect(s.push("code abc1")).toBe("code ");
  expect(s.push("23def456 and ab")).toBe("[hidden] and ");
  expect(s.push("x")).toBe("abx");
  expect(s.push(" end a")).toBe(" end ");
  expect(s.flush()).toBe("a");
});
