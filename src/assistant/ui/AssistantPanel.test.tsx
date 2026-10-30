import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { expect, it } from "vitest";
import { AssistantPanel } from "./AssistantPanel";

it("renders an empty panel on the server, without touching storage, and offers no reset until there's a conversation", () => {
  const storage = new Proxy({} as Storage, {
    get() {
      throw new Error("storage read during server rendering");
    },
  });
  const Stub = createRoutesStub([{ path: "/", Component: () => <AssistantPanel storage={storage} track={() => {}} /> }]);
  const html = renderToString(<Stub initialEntries={["/"]} />);
  expect(html).toMatch(/Ask about your sales/);
  expect(html).not.toMatch(/New conversation/);
});
