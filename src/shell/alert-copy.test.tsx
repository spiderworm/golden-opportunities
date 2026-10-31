import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { ALERT_COPY, q2AlertCopy } from "./alert-copy";
import { StandingOrder } from "./StandingOrder";
import { Transmission } from "./Transmission";

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

describe("the Q2 memo (q2.md, section 2)", () => {
  it("quotes Q1's report card: score, grade with a true minus, and every binding measure", () => {
    const line = (binding: Parameters<typeof q2AlertCopy>[0]["binding"]) => q2AlertCopy({ score: 72, grade: "C-", binding }).transmission.memo[0];
    expect(line(["culture"])).toEqual(["First-quarter overall score: 72 (C−). Lowest measure: Culture."]);
    expect(line(["profit", "happiness"])).toEqual(["First-quarter overall score: 72 (C−). Lowest measure: Profit and Happiness."]);
    expect(line(["profit", "readers", "culture"])).toEqual(["First-quarter overall score: 72 (C−). Lowest measure: Profit, Readers served and Culture."]);
  });

  it("has q2.md's words in the transmission, the strip and the bell, and keeps M1's buttons", () => {
    const q2 = q2AlertCopy({ score: 87, grade: "B+", binding: ["happiness"] });
    expect(q2.id).toBe("q2-calendar-empty");
    expect(q2.transmission.line).toBe("THE FIRST QUARTER HAS BEEN FILED. IT CANNOT BE UNFILED. WE TRIED. THE CALENDAR IS NOW EMPTY. MR. ZOOLANDER WOULD FILL IT WITH SOMETHING REALLY, REALLY GOOD-LOOKING. PLEASE FILL IT.");
    expect(q2.transmission.memoHeader).toEqual(["LARKSPUR STATION / COMMERCE OFFICE", "Quarterly review: Orbital Books, Ring C, Berth 14", "April 1, 2194"]);
    expect(q2.transmission.memo.slice(1)).toEqual([
      ["The Book of the Month calendar for the second quarter is empty. The previous manager's schedule ended in March. The Commerce Office expects the picks, and a plan, before the shuttle season begins."],
      ["Your ledgers now include Q1 2194, and Dewey can help you read them there."],
      ["Submit your plan when you are ready."],
    ]);
    expect([q2.transmission.open, q2.transmission.later, q2.transmission.label]).toEqual([ALERT_COPY.transmission.open, ALERT_COPY.transmission.later, ALERT_COPY.transmission.label]);
    expect(q2.strip.long).toEqual(["Standing order from the Commerce Office: the Book of the Month calendar for Q2 is empty. Submit your picks and a plan for Q2 2194."]);
    expect(q2.strip.short).toEqual(["Standing order: Q2 picks needed. Plan due for Q2 2194."]);
    expect(q2.bell).toEqual({ title: "The Q2 Book of the Month calendar is empty", detail: "Choose the picks, then submit a plan for Q2 2194." });
  });

  it("shows whichever memo it's given, Q1's by default", () => {
    const q2 = q2AlertCopy({ score: 66, grade: "D", binding: ["culture"] });
    const render = (el: React.ReactNode) => {
      const Stub = createRoutesStub([{ path: "/", Component: () => el }]);
      return text(renderToString(<Stub initialEntries={["/"]} />));
    };
    const noop = () => {};
    expect(render(<Transmission open={false} onOpenLedgers={noop} onLater={noop} />)).toContain("Down 41%.");
    const memo = render(<Transmission open={false} copy={q2.transmission} onOpenLedgers={noop} onLater={noop} />);
    expect(memo).toContain("First-quarter overall score: 66 (D). Lowest measure: Culture.");
    expect(memo).toContain("April 1, 2194");
    expect(memo).not.toContain("41%");
    expect(render(<StandingOrder copy={q2.strip} onLedgers={false} onReadMemo={noop} onOpenLedgers={noop} />)).toContain("Standing order: Q2 picks needed. Plan due for Q2 2194.");
  });
});
