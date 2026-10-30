import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createInterface } from "node:readline";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DIMENSIONS, MEASURES } from "../../query/types.ts";
import { checkChart, checkQuery, describeData, ToolInputError, TOOLS } from "./definitions.ts";
import { callTool, handle, queryEndpoint } from "./server.ts";
import { orbitalToolServer } from "./toolServer.server.ts";

describe("the tool list", () => {
  it("is exactly: describe, query, pin; every input schema is closed", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["describe_data", "query_data", "pin_chart"]);
    for (const t of TOOLS) expect(t.inputSchema.additionalProperties, t.name).toBe(false);
  });

  it("names the contract's measures and dimensions, so new ones carry through", () => {
    const d = describeData();
    expect(d.measures.map((m) => m.name)).toEqual([...MEASURES]);
    expect(d.dimensions).toEqual(DIMENSIONS);
  });
});

describe("checking a query from the model", () => {
  it("rebuilds a good query from known parts", () => {
    expect(checkQuery({ measure: "revenue", by: ["quarter"], filter: { genre: ["Mystery"] }, sort: { column: "revenue", direction: "desc" }, limit: 5 })).toEqual({
      measure: "revenue",
      by: ["quarter"],
      filter: { genre: ["Mystery"] },
      sort: { column: "revenue", direction: "desc" },
      limit: 5,
    });
    expect(checkQuery({ measure: "units" })).toEqual({ measure: "units", by: [] });
  });

  it.each([
    ["an unknown field (no view, SQL or code)", { measure: "revenue", by: [], view: { periods: ["2194-Q1"] } }, /unknown fields: view/],
    ["SQL", { measure: "revenue", by: [], sql: "select *" }, /unknown fields: sql/],
    ["an unknown measure", { measure: "profit", by: [] }, /Unknown measure/],
    ["three dimensions", { measure: "revenue", by: ["quarter", "genre", "format"] }, /up to 2/],
    ["a repeated dimension", { measure: "revenue", by: ["genre", "genre"] }, /different/],
    ["a dimension the measure lacks", { measure: "avg_rating", by: ["quarter"] }, /can't be grouped by quarter/],
    ["a filter the measure lacks", { measure: "checkouts", by: [], filter: { format: ["Hardcover"] } }, /can't be filtered/],
    ["an unknown filter", { measure: "revenue", by: [], filter: { __proto__x: ["a"] } }, /Unknown filter/],
    ["an empty filter", { measure: "revenue", by: [], filter: { genre: [] } }, /1 to 50/],
    ["a non-string filter", { measure: "revenue", by: [], filter: { genre: [{ $ne: 1 }] } }, /1 to 50/],
    ["a huge filter value", { measure: "revenue", by: [], filter: { genre: ["x".repeat(201)] } }, /1 to 50/],
    ["a sort on another column", { measure: "revenue", by: ["genre"], sort: { column: "units", direction: "asc" } }, /"sort" must name/],
    ["a limit over 200", { measure: "revenue", by: [], limit: 201 }, /limit/],
    ["a string", "revenue", /must be an object/],
  ])("refuses %s", (_, input, message) => {
    expect(() => checkQuery(input)).toThrow(ToolInputError);
    expect(() => checkQuery(input)).toThrow(message);
  });

  it("checks charts to pin, and strips control characters from titles", () => {
    expect(checkChart({ title: "Sales\nby quarter", kind: "bar", query: { measure: "revenue", by: ["quarter"] } })).toEqual({ title: "Sales by quarter", kind: "bar", query: { measure: "revenue", by: ["quarter"] } });
    expect(() => checkChart({ title: "x", kind: "pie", query: { measure: "revenue", by: [] } })).toThrow(/kind/);
    expect(() => checkChart({ title: "x".repeat(81), kind: "bar", query: { measure: "revenue", by: [] } })).toThrow(/title/);
    expect(() => checkChart({ title: "x", kind: "bar", query: { measure: "revenue", by: [] }, html: "<script>" })).toThrow(/unknown fields/);
  });
});

describe("the query endpoint", () => {
  it("must be on this machine, so the token can't be sent away", () => {
    expect(queryEndpoint({ ORBITAL_QUERY_TOKEN: "t", ORBITAL_QUERY_URL: "http://127.0.0.1:5173/api/query" }).url.port).toBe("5173");
    expect(() => queryEndpoint({ ORBITAL_QUERY_TOKEN: "t", ORBITAL_QUERY_URL: "http://evil.example/api/query" })).toThrow(/this machine/);
    expect(() => queryEndpoint({ ORBITAL_QUERY_TOKEN: "t", ORBITAL_QUERY_URL: "http://127.0.0.1.evil.example/" })).toThrow(/this machine/);
    expect(() => queryEndpoint({ ORBITAL_QUERY_URL: "http://127.0.0.1/" })).toThrow(/TOKEN/);
  });
});

describe("calling tools against the app", () => {
  let server: Server;
  let env: NodeJS.ProcessEnv;
  const seen: { auth?: string; body: unknown }[] = [];
  const body = (req: IncomingMessage) => new Promise<string>((r) => {
    let s = "";
    req.on("data", (c) => (s += c)).on("end", () => r(s));
  });
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const query = JSON.parse(await body(req));
      seen.push({ auth: req.headers.authorization, body: query });
      res.setHeader("content-type", "application/json");
      if (query.measure === "orders") {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: { code: "INVALID_QUERY", message: "bad orders" } }));
      }
      if (query.measure === "units") {
        res.statusCode = 500;
        return res.end("Internal error at /Users/david/secret with token abc");
      }
      res.end(JSON.stringify({ columns: [{ key: "quarter", label: "Quarter", type: "string", nullable: false }], rows: [{ quarter: "2193-Q1", revenue: 10 }], total: 10, source: "Sales, 2193-Q1 to Q4", extra: "dropped" }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    env = { ORBITAL_QUERY_TOKEN: "tok", ORBITAL_QUERY_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/query` };
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("sends only the checked query, with the token, and returns the result with its source", async () => {
    const result = await callTool("query_data", { measure: "revenue", by: ["quarter"] }, env);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ columns: [{ key: "quarter", label: "Quarter", type: "string", nullable: false }], rows: [{ quarter: "2193-Q1", revenue: 10 }], total: 10, source: "Sales, 2193-Q1 to Q4" });
    expect(seen.at(-1)).toEqual({ auth: "Bearer tok", body: { measure: "revenue", by: ["quarter"] } });
  });

  it("never reaches the app with a bad query", async () => {
    const before = seen.length;
    const result = await callTool("query_data", { measure: "revenue", by: [], view: { periods: ["2194-Q1"] } }, env);
    expect(result.isError).toBe(true);
    expect(seen.length).toBe(before);
  });

  it("passes the app's own error back, but hides anything unexpected", async () => {
    expect((await callTool("query_data", { measure: "orders", by: [] }, env)).content[0].text).toBe("INVALID_QUERY: bad orders");
    const hidden = await callTool("query_data", { measure: "units", by: [] }, env);
    expect(hidden).toEqual({ content: [{ type: "text", text: "The data terminal is unavailable right now." }], isError: true });
  });

  it("pins a chart after checking its query runs", async () => {
    const result = JSON.parse((await callTool("pin_chart", { title: "Revenue", kind: "line", query: { measure: "revenue", by: ["quarter"] } }, env)).content[0].text);
    expect(result).toEqual({ pinned: true, chart: { title: "Revenue", kind: "line", query: { measure: "revenue", by: ["quarter"] } }, rows: 1, source: "Sales, 2193-Q1 to Q4" });
  });

  it("leaves out pin_chart for pages with nowhere to pin", async () => {
    const noPins = { ...env, ORBITAL_PINS: "0" };
    const list = (await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, noPins)) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(["describe_data", "query_data"]);
    expect((await callTool("pin_chart", { title: "R", kind: "bar", query: { measure: "revenue", by: [] } }, noPins)).isError).toBe(true);
    expect(orbitalToolServer("t", { pins: false }).env?.ORBITAL_PINS).toBe("0");
  });

  it("refuses unknown tools", async () => {
    expect((await callTool("read_file", { path: "/etc/passwd" }, env)).isError).toBe(true);
    expect(await handle({ jsonrpc: "2.0", id: 1, method: "resources/list" }, env)).toMatchObject({ error: { code: -32601 } });
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, env)).toBeNull();
  });

  it("speaks MCP over stdio as a process", async () => {
    const launch = orbitalToolServer("tok", { queryUrl: env.ORBITAL_QUERY_URL });
    const child = spawn(launch.command, launch.args, { env: { PATH: process.env.PATH, ...launch.env }, stdio: ["pipe", "pipe", "inherit"] });
    const replies = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    const ask = async (m: object) => {
      child.stdin.write(`${JSON.stringify(m)}\n`);
      return JSON.parse((await replies.next()).value);
    };
    try {
      expect((await ask({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).result.serverInfo.name).toBe("orbital");
      expect((await ask({ jsonrpc: "2.0", id: 2, method: "tools/list" })).result.tools).toHaveLength(3);
      const call = await ask({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "query_data", arguments: { measure: "revenue", by: ["quarter"] } } });
      expect(JSON.parse(call.result.content[0].text).source).toBe("Sales, 2193-Q1 to Q4");
      expect((await ask({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "x", arguments: {} }, junk: "x".repeat(70_000) })).error.message).toBe("Request too large");
    } finally {
      child.kill();
    }
  });
});
