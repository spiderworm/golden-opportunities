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

it("says Loading… and nothing more, in a status that's there before its words are", () => {
  expect(LOADING).toBe("Loading…");
  expect(renderToString(<LoadingLine loading={false} className="floor" />)).toBe(
    '<p role="status" class="floor"></p>',
  );
  expect(renderToString(<LoadingLine loading className="floor" />)).toBe(
    '<p role="status" class="floor">Loading…</p>',
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

it("shows nothing on the server, before any delay, committed or not", () => {
  expect(LOADING_DELAY_MS).toBe(500);
  function Probe({ committed }: { committed: boolean }) {
    const { loading } = useCommitment(committed);
    return <LoadingLine loading={loading} />;
  }
  expect(renderToString(<Probe committed={false} />)).toBe('<p role="status"></p>');
  expect(renderToString(<Probe committed />)).toBe('<p role="status"></p>');
});
