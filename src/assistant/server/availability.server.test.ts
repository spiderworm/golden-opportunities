import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { assistantAvailability, markOffline, probeAssistant, resetAvailabilityForTests, type Availability } from "./availability.server.ts";

const fake = fileURLToPath(new URL("./fixtures/fake-claude-auth.mjs", import.meta.url));
const probe = (mode: string, timeoutMs?: number) => probeAssistant({ command: fake, env: { PATH: process.env.PATH, FAKE_AUTH: mode }, timeoutMs });

afterEach(resetAvailabilityForTests);

describe("probing Claude Code (M4: a reviewer may not have it)", () => {
  it("is ready when installed and signed in, and keeps nothing else it said (its output has the email)", async () => {
    expect(await probe("in")).toEqual({ state: "ready" });
  });

  it("is offline when it's not installed, not signed in, or not working", async () => {
    expect(await probeAssistant({ command: path.join(path.dirname(fake), "no-such-claude") })).toEqual({ state: "offline", reason: "missing" });
    expect(await probe("out")).toEqual({ state: "offline", reason: "signed_out" });
    expect(await probe("dead")).toEqual({ state: "offline", reason: "broken" });
    expect(await probe("hang", 300)).toEqual({ state: "offline", reason: "broken" });
  });

  it("treats a Claude Code without `auth status` as ready if it runs; a real answer then finds out about sign-in", async () => {
    expect(await probe("old")).toEqual({ state: "ready" });
  });
});

describe("the cached state", () => {
  const counting = (results: Availability[]) => {
    let calls = 0;
    return { probe: async () => results[Math.min(calls++, results.length - 1)], calls: () => calls };
  };
  const env = { PATH: "" };

  it("probes once, and stays ready until an answer shows otherwise", async () => {
    const p = counting([{ state: "ready" }]);
    expect(await assistantAvailability({ env, probe: p.probe, now: 0 })).toEqual({ state: "ready" });
    expect(await assistantAvailability({ env, probe: p.probe, now: 3_600_000 })).toEqual({ state: "ready" });
    expect(p.calls()).toBe(1);
    const events: [string, Record<string, string>][] = [];
    markOffline("signed_out", (e, props) => events.push([e, props]), 10);
    expect(await assistantAvailability({ env, probe: p.probe, now: 20 })).toEqual({ state: "offline", reason: "signed_out" });
    expect(events).toEqual([["assistant_unavailable", { reason: "signed_out", when: "answer" }]]);
  });

  it("checks again a minute after finding it offline, so signing in works without a restart", async () => {
    const p = counting([{ state: "offline", reason: "signed_out" }, { state: "ready" }]);
    const events: string[] = [];
    const track = (_: string, props: Record<string, string>) => events.push(props.reason);
    expect(await assistantAvailability({ env, probe: p.probe, track, now: 0 })).toEqual({ state: "offline", reason: "signed_out" });
    expect(await assistantAvailability({ env, probe: p.probe, track, now: 30_000 })).toEqual({ state: "offline", reason: "signed_out" });
    expect(p.calls()).toBe(1);
    expect(await assistantAvailability({ env, probe: p.probe, track, now: 61_000 })).toEqual({ state: "ready" });
    expect(p.calls()).toBe(2);
    // One content-free event per change, not per check.
    expect(events).toEqual(["signed_out"]);
  });

  it("is always ready under the fake provider, without probing", async () => {
    const p = counting([{ state: "offline", reason: "missing" }]);
    expect(await assistantAvailability({ env: { ORBITAL_ASSISTANT_PROVIDER: "fake" }, probe: p.probe })).toEqual({ state: "ready" });
    expect(p.calls()).toBe(0);
  });
});
