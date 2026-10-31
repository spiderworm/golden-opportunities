// What the result screen shows for a played quarter (docs/design/q2.md section 7). Server-only:
// the result loader passes this on, and maps the discovery ids to their words.
import { runQuery } from '../query/run-query.server';
import { gradeFor, roundHalfUp } from '../simulation/grading';
import type { Grade, MeasureScore, Outcome } from '../simulation/types';
import { getGameSession } from './session.server';
import { currentQuarter, isFinished } from './progress';
import type { QuarterId } from './quarters';
import type { DiscoveryId, GameSave, Q2GameOutcome } from './types';

export interface HalfYearQuarter { quarter: QuarterId; measures: MeasureScore[]; overall: { score: number; grade: Grade } }
/** Set once both quarters are played. The score is the mean of the two overall scores, rounded half up (q2.md section 7). */
export interface HalfYear { quarters: HalfYearQuarter[]; score: number; grade: Grade }
interface Common {
  /** The quarter's discoveries, as ids: A to C for Q1. Map them to their words with earnedDiscoveries. */
  discoveries: DiscoveryId[];
  /** Revenue in the same quarter of 2193. */
  sameQuarterLastYear: number;
  /** Revenue in the quarter before: Q4 2193 for Q1, the player's Q1 2194 for Q2. */
  previousQuarter: number;
  /** The quarter before, by month, for the chart's faint reference line. */
  reference: { month: string; revenue: number }[];
  /** The quarter to play next ("Continue to Q2" links to "/"), or null. */
  next: QuarterId | null;
  canPlayAgain: boolean;
  halfYear: HalfYear | null;
}
export type ResultData = Common & ({ quarter: '2194-Q1'; outcome: Outcome } | { quarter: '2194-Q2'; outcome: Q2GameOutcome });

const PREVIOUS: Record<QuarterId, string> = { '2194-Q1': '2193-Q4', '2194-Q2': '2194-Q1' };

export function halfYearOf(save: GameSave): HalfYear | null {
  if (!isFinished(save)) return null;
  const quarters = save.played.map(({ period, outcome }) => ({ quarter: period, measures: outcome.reportCard.plan.measures,
    overall: { score: outcome.reportCard.plan.overall.score, grade: outcome.reportCard.plan.overall.grade } }));
  const score = roundHalfUp(quarters.reduce((sum, q) => sum + q.overall.score, 0) / quarters.length);
  return { quarters, score, grade: gradeFor(score) };
}

/** The latest played quarter's result, or the given one's; null when that quarter isn't played (the loader redirects to /decide). */
export function getResultData(request: Request, period?: QuarterId): ResultData | null {
  const { save, queryView } = getGameSession(request);
  const played = period ? save.played.find(q => q.period === period) : save.played.at(-1);
  if (!played) return null;
  const revenue = (quarter: string) => runQuery({ measure: 'revenue', by: [], filter: { quarter: [quarter] } }, queryView).rows[0]?.revenue ?? 0;
  const previous = PREVIOUS[played.period];
  const reference = runQuery({ measure: 'revenue', by: ['month'], filter: { quarter: [previous] } }, queryView).rows
    .map(r => ({ month: r.month ?? '', revenue: r.revenue ?? 0 }));
  const common: Common = {
    discoveries: [...played.outcome.discoveries],
    sameQuarterLastYear: revenue(played.period.replace('2194', '2193')),
    previousQuarter: revenue(previous),
    reference,
    next: currentQuarter(save),
    canPlayAgain: isFinished(save),
    halfYear: halfYearOf(save),
  };
  return played.period === '2194-Q1' ? { ...common, quarter: played.period, outcome: played.outcome } : { ...common, quarter: played.period, outcome: played.outcome };
}
