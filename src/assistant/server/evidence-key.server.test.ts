// One lookup end to end (Chart's review of #370): the real tool server asks the real query handler under an
// answer's token, and the browser's event gets the evidence the handler kept, by the same key the route uses. Each
// side is tested alone elsewhere; this catches a key that drifts, which would only show as ranges going missing.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { rmSync } from "node:fs";
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return mkdtempSync(tmpdir() + "/orbital-evidence-key-");
});
vi.mock("../../platform/analytics/instance.server", () => ({
  DATA_DIR: directory,
  instanceId: () => "0123abcd-0000-4000-8000-000000000000",
}));
vi.mock("../../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));

import { issueGameQueryToken } from "~/game/query-token.server";
import { saves } from "~/game/session.server";
import { agentEvidence } from "~/query/agent-evidence.server";
import { createQueryHandler } from "~/query/http.server";
import { validateQuery } from "~/query/validate";
import { checkQuery } from "../tools/definitions.ts";
import { callTool } from "../tools/server.ts";
import { toWire, withEvidence } from "./ask.server.ts";
import type { ProviderEvent } from "./provider.server.ts";

let server: Server;
let url = "";
const handle = createQueryHandler({ track: () => {} });
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const response = await handle(
      new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: Buffer.concat(chunks),
      }),
    );
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/query`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(directory, { recursive: true, force: true });
});

describe("a lookup's evidence, end to end (Chart, #370)", () => {
  it("reaches the browser's event by the route's key, and never the model's output", async () => {
    const { token, revoke } = issueGameQueryToken(saves.create().id);
    const env = { ORBITAL_QUERY_TOKEN: token, ORBITAL_QUERY_URL: url };
    // As the route's provider looks it up: the handler's own checked query.
    const evidenceFor = (query: unknown) => agentEvidence(token, validateQuery(checkQuery(query)));
    const query = { measure: "avg_rating", by: ["genre"] };
    for (const [name, input] of [
      ["query_data", query],
      ["show_chart", { query }],
    ] as const) {
      const { content, isError } = await callTool(name, input, env);
      expect(isError, name).not.toBe(true);
      const output = content[0]!.text;
      expect(output, name).not.toMatch(/"se"|"evidence"/);
      const event: ProviderEvent = { type: "tool", name, input, output, isError: false };
      const wire = withEvidence(toWire(event), event, { evidenceFor }) as {
        rows: unknown[];
        evidence?: { unit: string; rows: unknown[] };
      };
      expect(wire.evidence?.unit, name).toBe("ratings");
      expect(wire.evidence?.rows, name).toHaveLength(wire.rows.length);
    }
    revoke();
  });
});
