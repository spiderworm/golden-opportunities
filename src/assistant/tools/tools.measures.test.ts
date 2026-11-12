// Several measures in one lookup (David, 12 Nov 2026): the tools take `also`, the tool server gives the model a
// column, a total and evidence per measure, and the figures gate renders them by measure.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chartTitle,
  checkChart,
  checkComparison,
  checkQuery,
  checkShownChart,
  describeData,
  lookupPin,
  ToolInputError,
  TOOLS,
} from "./definitions.ts";
import { callTool, resetRefsForTests } from "./server.ts";
import { measureCount, toWire, withEvidence } from "../server/ask.server.ts";
import type { ProviderEvent } from "../server/provider.server.ts";
import { Refs, renderSentence, WITHHELD } from "../server/figures.server.ts";

describe("checking a query of several measures", () => {
  it("keeps `also` as given, after the first measure", () => {
    expect(checkQuery({ measure: "revenue", also: ["units"], by: ["quarter"] })).toEqual({
      measure: "revenue",
      also: ["units"],
      by: ["quarter"],
    });
    expect(checkQuery({ measure: "revenue", by: [] })).toEqual({ measure: "revenue", by: [] });
  });

  it("takes one to three more measures, known, reviewed, distinct and not the first", () => {
    for (const also of [
      [],
      ["revenue"],
      ["units", "units"],
      ["profit"],
      ["ratings"],
      "units",
      ["units", "orders", "avg_discount", "avg_order_value"],
    ])
      expect(() => checkQuery({ measure: "revenue", also, by: [] }), JSON.stringify(also)).toThrow(
        ToolInputError,
      );
  });

  it("groups and filters only by a dimension every measure supports", () => {
    // Checkouts have months; average rating doesn't.
    expect(() => checkQuery({ measure: "avg_rating", also: ["checkouts"], by: ["month"] })).toThrow(
      /avg_rating and checkouts can't be grouped by month/,
    );
    expect(() =>
      checkQuery({
        measure: "checkouts",
        also: ["avg_rating"],
        by: [],
        filter: { month: ["2193-04"] },
      }),
    ).toThrow(/can't be filtered by month/);
    expect(checkQuery({ measure: "avg_rating", also: ["checkouts"], by: ["genre"] }).by).toEqual([
      "genre",
    ]);
  });

  it("sorts by any requested measure, and no other", () => {
    expect(
      checkQuery({
        measure: "revenue",
        also: ["units"],
        by: ["genre"],
        sort: { column: "units", direction: "desc" },
      }).sort,
    ).toEqual({ column: "units", direction: "desc" });
    expect(() =>
      checkQuery({
        measure: "revenue",
        by: ["genre"],
        sort: { column: "units", direction: "desc" },
      }),
    ).toThrow(ToolInputError);
  });

  it("leaves a mix of sales and book measures to the terminal, which refuses it with a message to pass on", () => {
    expect(checkQuery({ measure: "revenue", also: ["avg_rating"], by: [] }).also).toEqual([
      "avg_rating",
    ]);
  });

  it("titles charts and pins from every measure, and pins the query whole", () => {
    expect(chartTitle({ measure: "revenue", also: ["units"], by: ["quarter"] })).toBe(
      "Revenue and units by quarter",
    );
    expect(chartTitle({ measure: "revenue", also: ["units", "orders"], by: [] })).toBe(
      "Revenue, units and orders",
    );
    expect(
      checkShownChart({ query: { measure: "revenue", also: ["units"], by: ["quarter"] } }),
    ).toEqual({
      title: "Revenue and units by quarter",
      kind: "line",
      query: { measure: "revenue", also: ["units"], by: ["quarter"] },
    });
    expect(checkChart({ query: { measure: "revenue", also: ["units"], by: ["genre"] } })).toEqual({
      title: "Revenue and units by genre",
      kind: "bar",
      query: { measure: "revenue", also: ["units"], by: ["genre"] },
    });
    expect(lookupPin("query_data", { measure: "revenue", also: ["units"], by: ["genre"] })).toEqual(
      {
        title: "Revenue and units by genre",
        kind: "table",
        query: { measure: "revenue", also: ["units"], by: ["genre"] },
      },
    );
  });

  it("keeps compare_data to one measure", () => {
    expect(() =>
      checkComparison({
        measure: "revenue",
        also: ["units"],
        across: "quarter",
        from: "2193-Q3",
        to: "2193-Q4",
      }),
    ).toThrow(ToolInputError);
    const compare = TOOLS.find((t) => t.name === "compare_data")!;
    expect(Object.keys(compare.inputSchema.properties)).not.toContain("also");
  });

  it("offers `also` on query_data, show_chart and pin_chart, and says which measures can share a query", () => {
    const schema = (name: string) => {
      const tool = TOOLS.find((t) => t.name === name)!.inputSchema.properties as Record<
        string,
        { properties?: object }
      >;
      return name === "query_data" ? tool : tool.query!.properties!;
    };
    for (const name of ["query_data", "show_chart", "pin_chart"])
      expect(Object.keys(schema(name)), name).toContain("also");
    const rule = describeData().rules.find((r) => r.startsWith("Ask for up to 4 measures"));
    expect(rule).toContain(
      "sales measures (revenue, units, orders, avg_discount, avg_order_value, orders_per_day) together",
    );
    expect(rule).toContain("book measures (avg_rating, checkouts) together");
    expect(rule).toContain("Ask only for the measures the player asked for");
  });

  it("counts a lookup's measures for analytics, never naming them", () => {
    expect(measureCount("query_data", { measure: "revenue", also: ["units"], by: [] })).toBe(2);
    expect(measureCount("show_chart", { query: { measure: "revenue", by: [] } })).toBe(1);
    expect(
      measureCount("pin_chart", { query: { measure: "units", also: ["a", "b", "c", "d"] } }),
    ).toBe(4);
    expect(measureCount("describe_data", {})).toBe(0);
  });
});

describe("calling tools for several measures", () => {
  let server: Server;
  let env: NodeJS.ProcessEnv;
  const seen: unknown[] = [];
  const body = (req: IncomingMessage) =>
    new Promise<string>((r) => {
      let s = "";
      req.on("data", (c) => (s += c)).on("end", () => r(s));
    });
  const evidence = (unit: string, ns: number[], total: number) => ({
    unit,
    rows: ns.map((n) => ({ n, se: 0.5 })),
    total: { n: total, se: 0.2 },
  });
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const query = JSON.parse(await body(req));
      seen.push(query);
      res.setHeader("content-type", "application/json");
      if (query.also?.includes("avg_rating")) {
        res.statusCode = 400;
        return res.end(
          JSON.stringify({
            error: {
              code: "INCOMPATIBLE_MEASURES",
              message:
                "revenue and avg_rating can't share a query: revenue comes from sales, and avg_rating from book records (ratings and checkouts). Query them separately.",
            },
          }),
        );
      }
      if (query.also?.includes("checkouts") && query.measure === "units")
        // A result missing a measure's total.
        return res.end(
          JSON.stringify({
            columns: [],
            rows: [],
            total: 1,
            source: "Sales",
            measures: { units: { total: 1 } },
          }),
        );
      // Sim's shape (#415): total and evidence the first measure's, `measures` keyed by every one.
      res.end(
        JSON.stringify({
          columns: [
            { key: "quarter", label: "Quarter", type: "string", nullable: false },
            { key: "revenue", label: "Revenue", type: "number", nullable: true },
            { key: "units", label: "Units", type: "number", nullable: true },
            {
              key: "avg_order_value",
              label: "Average order value",
              type: "number",
              nullable: true,
            },
          ],
          rows: [
            { quarter: "2193-Q1", revenue: 100, units: 10, avg_order_value: 25 },
            { quarter: "2193-Q2", revenue: 300, units: 20, avg_order_value: 30 },
          ],
          total: 400,
          source: "Sales, 2193-Q1 to Q2",
          evidence: evidence("sale lines", [4, 8], 12),
          measures: {
            revenue: { total: 400, evidence: evidence("sale lines", [4, 8], 12) },
            units: { total: 30, evidence: evidence("sale lines", [4, 8], 12) },
            avg_order_value: { total: 28.57, evidence: evidence("orders", [4, 10], 14) },
          },
        }),
      );
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    env = {
      ORBITAL_QUERY_TOKEN: "tok",
      ORBITAL_QUERY_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/query`,
    };
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const query = { measure: "revenue", also: ["units", "avg_order_value"], by: ["quarter"] };

  it("sends `also`, and gives the model a column per measure, totals by measure and each average's own n", async () => {
    resetRefsForTests();
    const result = await callTool("query_data", query, env);
    expect(seen.at(-1)).toEqual(query);
    const out = JSON.parse(result.content[0].text);
    expect(out).toEqual({
      ref: "a",
      columns: expect.any(Array),
      rows: [
        {
          ref: "a1",
          quarter: "2193-Q1",
          revenue: 100,
          units: 10,
          avg_order_value: 25,
          avg_order_value_n: 4,
        },
        {
          ref: "a2",
          quarter: "2193-Q2",
          revenue: 300,
          units: 20,
          avg_order_value: 30,
          avg_order_value_n: 10,
        },
      ],
      totals: { revenue: 400, units: 30, avg_order_value: 28.57 },
      evidence_units: { avg_order_value: "orders" },
      avg_order_value_n: 14,
      source: "Sales, 2193-Q1 to Q2",
      complete: true,
    });
    // No bare total or n: nothing the model could read as one measure's when it's another's.
    expect(out).not.toHaveProperty("total");
    expect(out).not.toHaveProperty("n");
    expect(JSON.stringify(out)).not.toContain('"se"');
  });

  it("is rendered by the figures gate by measure, as the model cites it", async () => {
    resetRefsForTests();
    const out = JSON.parse((await callTool("query_data", query, env)).content[0].text);
    const refs = new Refs();
    refs.addTool("query_data", query, out);
    const say = (s: string) => renderSentence(s, refs)?.text ?? WITHHELD;
    expect(
      say(
        "In {{a2.quarter}}, revenue was {{a2.revenue}} and units {{a2.units}}, of {{a.revenue}} and {{a.units}}.",
      ),
    ).toBe("In 2193-Q2, revenue was $300.00 and units 20, of $400.00 and 30.");
    expect(
      say(
        "{{a2.quarter}}'s average order value was {{a2.avg_order_value}}, based on {{a2.avg_order_value.n}}.",
      ),
    ).toBe("2193-Q2's average order value was $30.00, based on 10 orders.");
    expect(say("It was {{a2}}.")).toBe(WITHHELD);
  });

  it("draws and pins several measures as query_data runs them", async () => {
    resetRefsForTests();
    const shown = JSON.parse((await callTool("show_chart", { query }, env)).content[0].text);
    expect(shown.totals).toEqual({ revenue: 400, units: 30, avg_order_value: 28.57 });
    const pinned = JSON.parse((await callTool("pin_chart", { query }, env)).content[0].text);
    expect(pinned).toMatchObject({
      pinned: true,
      chart: { title: "Revenue, units and average order value by quarter", query },
    });
  });

  it("passes the terminal's refusal of a mix on, so the model runs two lookups", async () => {
    const result = await callTool(
      "query_data",
      { measure: "revenue", also: ["avg_rating"], by: ["genre"] },
      env,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^INCOMPATIBLE_MEASURES: .*Query them separately\.$/);
  });

  it("fails a result missing a measure's total, rather than give the model a gap", async () => {
    const result = await callTool(
      "query_data",
      { measure: "units", also: ["checkouts"], by: [] },
      env,
    );
    expect(result).toEqual({
      content: [{ type: "text", text: "The data terminal is unavailable right now." }],
      isError: true,
    });
  });
});

describe("a lookup of several measures, as the panel gets it", () => {
  const input = { measure: "revenue", also: ["avg_order_value"], by: ["quarter"] };
  const output = {
    ref: "a",
    columns: [],
    rows: [
      { ref: "a1", quarter: "2193-Q1", revenue: 100, avg_order_value: 25, avg_order_value_n: 4 },
    ],
    totals: { revenue: 100, avg_order_value: 25 },
    evidence_units: { avg_order_value: "orders" },
    source: "Sales",
    complete: true,
  };
  const event = {
    type: "tool",
    name: "query_data",
    input,
    output: JSON.stringify(output),
  } as ProviderEvent;

  it("has the first measure's total, as a lookup of one does, and each measure's under `measures`", () => {
    expect(toWire(event)).toMatchObject({
      type: "data",
      total: 100,
      measures: { revenue: { total: 100 }, avg_order_value: { total: 25 } },
    });
  });

  it("gets each measure's raw evidence from the answer's store, only where it checks out", () => {
    const good = { unit: "orders", rows: [{ n: 4, se: 1 }], total: { n: 4, se: 1 } };
    const wire = withEvidence(toWire(event), event, {
      evidenceFor: () => null,
      measureEvidenceFor: () => ({
        revenue: { total: 100, evidence: { ...good, rows: [] } },
        avg_order_value: { total: 25, evidence: good },
      }),
    } as never);
    expect(wire).toMatchObject({
      measures: { revenue: { total: 100 }, avg_order_value: { total: 25, evidence: good } },
    });
    expect((wire as { measures: { revenue: object } }).measures.revenue).not.toHaveProperty(
      "evidence",
    );
  });
});
