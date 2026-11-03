import { expect, it } from "vitest";
import { fetchStatus } from "./status.ts";

const respond = (body: unknown) => (async () => Response.json(body)) as unknown as typeof fetch;

it("reads the offline state the panel shows before the player types", async () => {
  const offline = {
    available: false,
    reason: "missing",
    message:
      "Dewey's terminal is offline on this machine: it needs Claude Code installed and signed in.",
    hint: "To set it up, see docs/dewey-setup.md, then restart the game.",
  };
  expect(await fetchStatus(respond(offline))).toEqual(offline);
  expect(await fetchStatus(respond({ available: true }))).toEqual({ available: true });
});

it("doesn't block the player when the status can't be read", async () => {
  expect(await fetchStatus(respond({ available: false }))).toEqual({ available: true });
  expect(
    await fetchStatus((async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch),
  ).toEqual({ available: true });
  expect(
    await fetchStatus((async () => new Response("<html>")) as unknown as typeof fetch),
  ).toEqual({ available: true });
});

it("reads the game's current quarter for the timeline, only when it's one", async () => {
  expect(await fetchStatus(respond({ available: true, quarter: "2194-Q2" }))).toEqual({
    available: true,
    quarter: "2194-Q2",
  });
  expect(await fetchStatus(respond({ available: true, quarter: "soon" }))).toEqual({
    available: true,
  });
});
