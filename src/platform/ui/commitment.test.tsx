import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";

import { LOADING, LOADING_DELAY_MS, LoadingLine, useCommitment } from "./commitment";

it("says Loading… and nothing more, as a status, placed by the page", () => {
  expect(LOADING).toBe("Loading…");
  expect(renderToString(<LoadingLine className="floor" />)).toBe(
    '<p role="status" class="floor">Loading…</p>',
  );
});

it("shows nothing on the server or before its delay, committed or not", () => {
  expect(LOADING_DELAY_MS).toBe(500);
  // The server draws the first moment: before any delay has passed, so never the loading line.
  function Probe({ committed }: { committed: boolean }) {
    const { loading } = useCommitment(committed);
    return <>{loading ? <LoadingLine /> : "nothing"}</>;
  }
  expect(renderToString(<Probe committed={false} />)).toBe("nothing");
  expect(renderToString(<Probe committed />)).toBe("nothing");
});
