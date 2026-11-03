import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";

import {
  commitment,
  LOADING,
  LOADING_DELAY_MS,
  LoadingLine,
  showsLoading,
  useCommitment,
  type Commitment,
} from "./commitment";

it("says Loading… and nothing more: seen from the server's page (after a CSS delay), read out once loading", () => {
  expect(LOADING).toBe("Loading\u2026");
  const quiet = renderToString(<LoadingLine loading={false} className="floor" />);
  // Seen: in the page from the start, its 500 ms kept by CSS from first paint; hidden from screen readers.
  expect(quiet).toMatch(
    /^<p role="status" class="floor"><span aria-hidden="true" class="[^"]+">Loading…<\/span>/,
  );
  // Read out: the live region's own text, empty until the page knows it's loading.
  expect(quiet).toMatch(/<span class="[^"]+"><\/span><\/p>$/);
  expect(renderToString(<LoadingLine loading className="floor" />)).toMatch(
    /<span class="[^"]+">Loading…<\/span><\/p>$/,
  );
});

it("shows the line only once late and not committed, and never again once committed", () => {
  const start: Commitment = { late: false, committed: false };
  expect(showsLoading(start)).toBe(false);
  const late = commitment(start, "late");
  expect(showsLoading(late)).toBe(true);
  // Committed after the delay: the line goes, and stays gone.
  const done = commitment(late, "committed");
  expect(showsLoading(done)).toBe(false);
  expect(commitment(done, "late")).toBe(done);
  // Committed before the delay: the delay passing later doesn't bring it.
  const quick = commitment(start, "committed");
  expect(showsLoading(commitment(quick, "late"))).toBe(false);
});

it("reads out nothing from the server, before any delay, committed or not", () => {
  expect(LOADING_DELAY_MS).toBe(500);
  function Probe({ committed }: { committed: boolean }) {
    const { loading } = useCommitment(committed);
    return <LoadingLine loading={loading} />;
  }
  for (const committed of [false, true])
    expect(renderToString(<Probe committed={committed} />)).toMatch(
      /<span class="[^"]+"><\/span><\/p>$/,
    );
});
