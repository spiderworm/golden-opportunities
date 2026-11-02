import { isRouteErrorResponse } from "react-router";

import { ResetGame } from "~/settings/ResetGame";

// What a player sees when their save no longer replays (Plot, #198; endless.md section 9: refused loudly,
// never silently rescored). The shell's error boundary shows it inside the shell, so the navigation stays.

export const REPLAY_MISMATCH_COPY = {
  heading: "Your save can't be replayed",
  body: (quarter: string) =>
    `The game has changed since you played ${quarter}, so replaying your quarters no longer gives the sales you were scored on. Rather than score you on different sales, the game stops here.`,
  start: "Start over",
} as const;

/** "2194-Q1" as "Q1 2194". */
const quarterName = (quarter: string) => {
  const [year, q] = quarter.split("-");
  return `${q} ${year}`;
};

/** The quarter a route error says no longer replays (session.server.ts's 409), or null for any other error. */
export function replayMismatchOf(error: unknown): string | null {
  if (!isRouteErrorResponse(error) || error.status !== 409) return null;
  const quarter = (error.data as { replayMismatch?: unknown } | null)?.replayMismatch;
  return typeof quarter === "string" && /^\d{4}-Q[1-4]$/.test(quarter) ? quarter : null;
}

/** The screen: Settings' Reset game panel, with its in-page confirm, in this copy's words. */
export function ReplayMismatch({ quarter, instance }: { quarter: string; instance: string | undefined }) {
  return (
    <ResetGame
      instance={instance}
      copy={{ heading: REPLAY_MISMATCH_COPY.heading, text: REPLAY_MISMATCH_COPY.body(quarterName(quarter)), open: REPLAY_MISMATCH_COPY.start }}
    />
  );
}
