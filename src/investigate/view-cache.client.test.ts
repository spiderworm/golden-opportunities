import { describe, expect, it, vi } from "vitest";

import { createQueryCache } from "~/platform/query-cache.client";
import { cachedView, viewKey, type ServerView } from "./view-cache.client";

/** The server's loader as the cache sees it: it records every view it shows, under the version it shows it in. */
function server() {
  const observed: { key: string; version: string }[] = [];
  let version = "q1";
  let busy = false;
  return {
    observed,
    commit(next: string) {
      version = next;
    },
    setBusy(value: boolean) {
      busy = value;
    },
    loaderFor(url: string) {
      return vi.fn(async (): Promise<ServerView & { url: string }> => {
        // A busy save defers the recording; the view is still shown.
        if (!busy) observed.push({ key: viewKey(url), version });
        return { url, dataVersion: version, evidence: busy ? "deferred" : "recorded" };
      });
    },
  };
}
const url = (search: string) => `http://localhost/investigate${search}`;

describe("Investigate's views in the browser", () => {
  it("shows a view again without asking, however its URL is written", async () => {
    const cache = createQueryCache();
    cache.setVersion("q1");
    const s = server();
    await cachedView(cache, url("?measure=units&genre=Fiction"), s.loaderFor(url("")));
    const again = s.loaderFor(url(""));
    await cachedView(cache, url("?genre=Fiction&measure=units&analytics-test=1"), again);
    expect(again).not.toHaveBeenCalled();
    expect(cache.takeStats()).toMatchObject({ hits: 1, misses: 1 });
  });

  it("never keeps a view whose evidence the server deferred, so showing it again asks (and records) again", async () => {
    const cache = createQueryCache();
    cache.setVersion("q1");
    const s = server();
    s.setBusy(true);
    await cachedView(cache, url("?by=genre"), s.loaderFor(url("?by=genre")));
    s.setBusy(false);
    const retry = s.loaderFor(url("?by=genre"));
    await cachedView(cache, url("?by=genre"), retry);
    expect(retry).toHaveBeenCalledOnce();
    expect(s.observed).toEqual([{ key: viewKey(url("?by=genre")), version: "q1" }]);
  });

  it("doesn't keep a view the server computed under a version the page hasn't reached", async () => {
    const cache = createQueryCache();
    cache.setVersion("q1");
    const s = server();
    s.commit("q2"); // a plan committed in another tab
    await cachedView(cache, url("?by=genre"), s.loaderFor(url("?by=genre")));
    expect(cache.size.entries).toBe(0);
  });

  it("serves only views the server has already shown, and recorded, under the page's data version", async () => {
    // A player's afternoon: views, repeats, a busy save, a plan commit, more views. Every view the cache serves
    // must be one the server observed under the version the page is on, so no discovery is ever skipped.
    const cache = createQueryCache();
    const s = server();
    cache.setVersion("q1");
    const served: { key: string; version: string }[] = [];
    const show = async (search: string) => {
      const loader = s.loaderFor(url(search));
      await cachedView(cache, url(search), loader);
      if (!loader.mock.calls.length) served.push({ key: viewKey(url(search)), version: cache.version! });
    };
    await show("?by=genre");
    await show("?by=genre&compare=quarter");
    await show("?by=genre");
    s.setBusy(true);
    await show("?by=weekday");
    s.setBusy(false);
    await show("?by=weekday");
    await show("?by=weekday");
    // The plan is committed: the shell's loader brings the new version, and the server's discoveries move on.
    s.commit("q2");
    cache.setVersion("q2");
    await show("?by=genre");
    await show("?by=genre");
    await show("?title=Hashtag+QuokkaSelfie");
    await show("?title=Hashtag+QuokkaSelfie");

    expect(served.length).toBe(4);
    for (const view of served) expect(s.observed).toContainEqual(view);
    // After the commit, the first view of each question went to the server again.
    expect(s.observed.filter((o) => o.version === "q2").map((o) => o.key)).toEqual([viewKey(url("?by=genre")), viewKey(url("?title=Hashtag+QuokkaSelfie"))]);
  });
});
