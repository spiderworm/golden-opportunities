import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { expect, it } from "vitest";
import type { LookupPin } from "../tools/definitions";
import { AssistantPanel, LookupView } from "./AssistantPanel";

it("renders an empty panel on the server, without touching storage, and offers no reset until there's a conversation", () => {
  const storage = new Proxy({} as Storage, {
    get() {
      throw new Error("storage read during server rendering");
    },
  });
  const Stub = createRoutesStub([{ path: "/", Component: () => <AssistantPanel storage={storage} track={() => {}} /> }]);
  const html = renderToString(<Stub initialEntries={["/"]} />);
  expect(html).toMatch(/Ask me about your sales/);
  expect(html).not.toMatch(/New conversation/);
});

it("offers Pin on every lookup it can pin, only where the page takes pins, and says when it's already pinned", () => {
  type Lookup = Parameters<typeof LookupView>[0]["lookup"];
  const table: LookupPin = { title: "Revenue by quarter", kind: "table", query: { measure: "revenue", by: ["quarter"] } };
  const data: Lookup = { type: "data", columns: [{ key: "revenue", label: "Revenue", type: "number", nullable: false }], rows: [{ revenue: 1 }], total: 1, source: "S" };
  const comparison: LookupPin = { title: "Revenue compared across quarter", kind: "comparison", comparison: { measure: "revenue", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: [] } };
  const compared: Lookup = { type: "comparison", columns: [], rows: [], total: { from: 1, to: 2, change: 1, percent_change: 100, direction: "rose" }, labels: { from: null, to: null }, source: "S", pin: comparison };
  const pinning = { onPin: () => true };
  expect(renderToString(<LookupView lookup={{ ...data, pin: table }} pinning={pinning} />)).toMatch(/aria-label="Pin Revenue by quarter"[^>]*>Pin</);
  expect(renderToString(<LookupView lookup={compared} pinning={pinning} />)).toMatch(/aria-label="Pin Revenue compared across quarter"/);
  expect(renderToString(<LookupView lookup={{ ...data, pin: table }} pinning={{ ...pinning, isPinned: () => true }} />)).toMatch(/disabled=""[^>]*aria-label="Pinned: Revenue by quarter"[^>]*>Pinned</);
  // No pin from the server (its input didn't check), or nowhere to put one: no button.
  expect(renderToString(<LookupView lookup={data} pinning={pinning} />)).not.toMatch(/<button/);
  expect(renderToString(<LookupView lookup={{ ...data, pin: table }} />)).not.toMatch(/<button/);
});
