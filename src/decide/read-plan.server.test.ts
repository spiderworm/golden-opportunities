import { describe, expect, it } from "vitest";
import {
  ForecastRefused,
  MAX_PLAN_BODY,
  PlanRefused,
  readAnyPlan,
  readPlan,
  readQ2Plan,
} from "./read-plan.server";

const URL_ = "http://localhost:5173/decide";

function post(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(URL_, {
    method: "POST",
    body,
    headers: {
      origin: "http://localhost:5173",
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
  });
}

async function status(
  request: Request,
  deadlineMs?: number,
  read: typeof readPlan | typeof readQ2Plan = readPlan,
) {
  try {
    await read(request, deadlineMs);
    return 200;
  } catch (error) {
    return (error as PlanRefused).status;
  }
}

describe("readPlan", () => {
  it("reads up to two moves, in any order, and none as holding course", async () => {
    expect(await readPlan(post("levers=events%2Crepick"))).toEqual({
      levers: ["repick", "events"],
    });
    expect(await readPlan(post("levers=sale"))).toEqual({ levers: ["sale"] });
    expect(await readPlan(post("levers="))).toEqual({ levers: [] });
  });

  // Audit's case: a 1 MB form with an unused field was accepted and committed.
  it("refuses an oversized body, whatever it declares", async () => {
    expect(await status(post(`levers=sale&unused=${"x".repeat(1_000_000)}`))).toBe(413);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`levers=sale&pad=${"x".repeat(MAX_PLAN_BODY)}`));
        c.close();
      },
    });
    expect(
      await status(
        new Request(URL_, {
          method: "POST",
          body: stream,
          duplex: "half",
          headers: {
            origin: "http://localhost:5173",
            "content-type": "application/x-www-form-urlencoded",
          },
        } as RequestInit),
      ),
    ).toBe(413);
  });

  it("refuses unknown or repeated fields, unknown or repeated moves, and a third move", async () => {
    expect(await status(post("levers=sale&unused=1"))).toBe(400);
    expect(await status(post("levers=sale&levers=repick"))).toBe(400);
    expect(await status(post("option=A"))).toBe(400);
    expect(await status(post("levers=bribe"))).toBe(400);
    expect(await status(post("levers=sale%2Csale"))).toBe(400);
    expect(await status(post("levers=repick%2Cevents%2Csale"))).toBe(400);
    expect(await status(post("levers=%2C"))).toBe(400);
    expect(await status(post(""))).toBe(400);
  });

  it("refuses other sites and other content types", async () => {
    expect(await status(post("levers=sale", { origin: "https://elsewhere.example" }))).toBe(403);
    expect(await status(post("levers=sale", { "sec-fetch-site": "cross-site" }))).toBe(403);
    expect(await status(post('{"levers":["sale"]}', { "content-type": "application/json" }))).toBe(
      415,
    );
  });

  it("gives up on a body that never finishes", async () => {
    const stalled = new ReadableStream({ start() {} });
    const request = new Request(URL_, {
      method: "POST",
      body: stalled,
      duplex: "half",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/x-www-form-urlencoded",
      },
    } as RequestInit);
    expect(await status(request, 50)).toBe(408);
  });
});

describe("readQ2Plan", () => {
  const A = "989-28-79-70597-8";
  const B = "989-28-654-6930-3";
  const q2 = (body: string, quarter = "2194-Q2") =>
    status(post(`${body}&quarter=${quarter}`), undefined, readQ2Plan);

  it("reads three months, each an ISBN or no pick, and up to one more move", async () => {
    expect(await readQ2Plan(post(`picks=${A}%2C%2C${B}&levers=events&quarter=2194-Q2`))).toEqual({
      quarter: "2194-Q2",
      plan: { picks: [A, null, B], levers: ["events"] },
    });
    expect(await readQ2Plan(post(`quarter=2195-Q1&levers=sale&picks=${A}%2C${B}%2C`))).toEqual({
      quarter: "2195-Q1",
      plan: { picks: [A, B, null], levers: ["sale"] },
    });
    // Holding course: no picks and no other move.
    expect(await readQ2Plan(post("picks=%2C%2C&levers=&quarter=2194-Q2"))).toEqual({
      quarter: "2194-Q2",
      plan: { picks: [null, null, null], levers: [] },
    });
  });

  it("fits three ISBNs and a move well inside the cap", () => {
    expect(
      new URLSearchParams({ picks: [A, A, A].join(","), levers: "events" }).toString().length,
    ).toBeLessThan(MAX_PLAN_BODY / 4);
  });

  it("refuses the wrong number of months, one ISBN twice, two moves, Q1's moves, and other fields", async () => {
    expect(await q2(`picks=${A}%2C${B}&levers=`)).toBe(400);
    expect(await q2(`picks=${A}%2C${B}%2C%2C&levers=`)).toBe(400);
    expect(await q2(`picks=${A}%2C${A}%2C&levers=`)).toBe(400);
    expect(await q2("picks=%2C%2C&levers=events%2Csale")).toBe(400);
    expect(await q2("picks=%2C%2C&levers=repick")).toBe(400);
    expect(await q2("picks=%2C%2C&levers=&extra=1")).toBe(400);
    expect(await q2("picks=%2C%2C&picks=%2C%2C&levers=")).toBe(400);
    expect(await q2("levers=")).toBe(400);
    expect(await q2(`picks=${"9".repeat(40)}%2C%2C&levers=`)).toBe(400);
  });

  it("needs the quarter the form was written for: one after Q1, well formed, sent once", async () => {
    expect(await status(post("picks=%2C%2C&levers="), undefined, readQ2Plan)).toBe(400);
    expect(await q2("picks=%2C%2C&levers=", "2194-Q1")).toBe(400);
    expect(await q2("picks=%2C%2C&levers=", "2193-Q4")).toBe(400);
    expect(await q2("picks=%2C%2C&levers=", "Q3")).toBe(400);
    expect(await q2("picks=%2C%2C&levers=&quarter=2194-Q3", "2194-Q3")).toBe(400);
  });

  it("keeps the door's checks: other sites, and an oversized body", async () => {
    expect(
      await status(
        post("picks=%2C%2C&levers=&quarter=2194-Q2", { origin: "https://elsewhere.example" }),
        undefined,
        readQ2Plan,
      ),
    ).toBe(403);
    expect(await q2(`picks=%2C%2C&levers=&pad=${"x".repeat(MAX_PLAN_BODY)}`)).toBe(413);
  });
});

describe("readAnyPlan's count of reports read (reports.md section 5)", () => {
  it("takes an optional count beside either form's fields, and none as zero", async () => {
    expect(await readAnyPlan(post("levers=sale&reportsRead=2"))).toEqual({
      form: "moves",
      plan: { levers: ["sale"] },
      reportsRead: 2,
      forecast: null,
    });
    expect(await readAnyPlan(post("levers="))).toMatchObject({ reportsRead: 0 });
    expect(
      await readAnyPlan(post("picks=%2C%2C&levers=&quarter=2194-Q2&reportsRead=1")),
    ).toMatchObject({ form: "picks", quarter: "2194-Q2", reportsRead: 1 });
  });

  it("reads a count that isn't one as none, never refusing the plan, and still refuses any other extra field", async () => {
    for (const body of [
      "levers=&reportsRead=-1",
      "levers=&reportsRead=lots",
      "levers=&reportsRead=1000",
    ])
      expect(await readAnyPlan(post(body))).toMatchObject({ plan: { levers: [] }, reportsRead: 0 });
    await expect(readAnyPlan(post("levers=&reportsRead=1&extra=1"))).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("readAnyPlan's forecast (src/forecast)", () => {
  const forecast = new URLSearchParams({
    forecastRevenue: "140000,130000,150000",
    forecastUnits: ",,",
    forecastNote: "x".repeat(500),
  }).toString();

  it("takes the optional fields beside either form's, for the quarter the form names", async () => {
    expect(await readAnyPlan(post(`levers=sale&${forecast}`))).toMatchObject({
      plan: { levers: ["sale"] },
      forecast: {
        quarter: "2194-Q1",
        revenue: { point: 140000, low: 130000, high: 150000 },
        note: "x".repeat(500),
      },
    });
    const later = await readAnyPlan(post(`picks=%2C%2C&levers=&quarter=2194-Q3&${forecast}`));
    expect(later).toMatchObject({ form: "picks", quarter: "2194-Q3" });
    expect(later.forecast?.quarter).toBe("2194-Q3");
    expect(later.forecast).not.toHaveProperty("units");
  });

  it("is none when the fields are empty or absent", async () => {
    expect(await readAnyPlan(post("levers="))).toMatchObject({ forecast: null });
    expect(
      await readAnyPlan(post("levers=&forecastRevenue=%2C%2C&forecastUnits=%2C%2C&forecastNote=")),
    ).toMatchObject({ forecast: null });
  });

  it("refuses the plan for a wrong one, naming the field and why", async () => {
    const problem = async (body: string) => {
      try {
        await readAnyPlan(post(body));
        return "read";
      } catch (error) {
        return error instanceof ForecastRefused ? error.problem : (error as PlanRefused).status;
      }
    };
    expect(await problem("levers=&forecastRevenue=160000%2C130000%2C150000")).toEqual({
      field: "revenue",
      reason: "point_above_high",
    });
    expect(await problem("levers=&forecastUnits=9000%2C%2C")).toEqual({
      field: "units",
      reason: "partial",
    });
    expect(
      await problem(`levers=&forecastUnits=1%2C1%2C1&forecastNote=${"x".repeat(501)}`),
    ).toEqual({ field: "note", reason: "too_long" });
    // Sent twice is a malformed form, not the player's to fix.
    expect(await problem("levers=&forecastUnits=1%2C1%2C1&forecastUnits=2%2C2%2C2")).toBe(400);
  });

  it("fits the largest forecast inside the cap", async () => {
    const largest = new URLSearchParams({
      picks: ["9780000000000", "9780000000001", "9780000000002"].join(","),
      levers: "events",
      quarter: "2194-Q3",
      reportsRead: "999",
      forecastRevenue: "9999999.99,9999999.99,9999999.99",
      forecastUnits: "999999,999999,999999",
      // Four UTF-8 bytes each, twelve once percent-encoded: the most a 500-character note can take.
      forecastNote: "\u{1F4DA}".repeat(500),
    }).toString();
    expect(largest.length).toBeLessThan(MAX_PLAN_BODY);
  });
});
