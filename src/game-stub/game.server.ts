// TEMPORARY stand-in for Frank's src/game/game.server.ts, with the signatures he
// agreed: submitPlan, getPlan and getOutcome, all synchronous. The outcome is
// Sim's real engine; only the storage is a stand-in (one plan in memory, until
// the server restarts, instead of the player's save). When Frank's lands, point
// the imports at ~/game/game.server and delete this folder.
import { loadBookshop } from "~/bookshop/loader.server";
import { simulateQuarter } from "~/simulation/simulate";
import type { Outcome, Plan } from "~/simulation/types";

/** Frank's game picks the seed per save; the stub plays one fixed quarter. */
const SEED = 1;

let submitted: Outcome | null = null;

export function submitPlan(_request: Request, plan: Plan): { outcomeId: string } {
  const { outcome } = simulateQuarter(plan, SEED, loadBookshop());
  // The game records discoveries as the player investigates; the stub has none.
  submitted = { ...outcome, discoveries: [] };
  return { outcomeId: `stub-${plan.levers.join("+") || "hold"}` };
}

export function getPlan(_request: Request): Plan | null {
  return submitted?.plan ?? null;
}

export function getOutcome(_request: Request): Outcome | null {
  return submitted;
}

/** For tests. */
export function resetStub(): void {
  submitted = null;
}
