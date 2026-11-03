// The shop's reports (docs/design/reports.md section 2): one per played quarter, built from what the save already
// holds with the result screen's own pieces. Nothing is stored for them and nothing new is worked out: no queries,
// so a shop report records no discovery evidence. What's sent is what the result screens already send: no seed,
// no model, no sales and no future quarter.
import { getQ2Candidates } from "~/game/game.server";
import { laterContext, laterOffers, LATER_DISCOVERIES } from "~/game/later-discoveries";
import { removalOf, serviceRecord, type ServiceRow } from "~/game/results.server";
import type { QuarterId } from "~/game/quarters";
import type { DiscoveryId, GameSave, PlayedQuarter } from "~/game/types";
import { editionLabel } from "~/decide/q2-copy";
import { MOVES } from "~/decide/copy";
import { earnedDiscoveries, laterDiscoveries } from "~/result/discoveries.server";
import { STRIKE_BELOW } from "~/simulation/strikes";
import type { Grade, MeasureId, MeasureScore } from "~/simulation/types";

export interface ShopReport {
  quarter: QuarterId;
  /** Until the player has opened its card or its full results. */
  new: boolean;
  overall: { score: number; grade: Grade; binding: MeasureId[]; allMet: boolean; strike: boolean };
  /** In report-card order, as the result's card has them. */
  measures: MeasureScore[];
  /** Q1: the moves taken; from Q2, each month's pick (null for none), then the one more move. Empty both: held course. */
  plan: { picks: (string | null)[] | null; moves: string[] };
  /** The service record's event (null in Q1 and Q2, and in a quiet quarter): eventTitle names it. */
  event: ServiceRow["event"];
  /** What the player found that quarter, in the result's words. */
  found: string[];
}

export interface ShopReports {
  /** Newest first. */
  reports: ShopReport[];
  /** Every quarter played, oldest first: the result screen's service record. */
  record: ServiceRow[];
  /** The quarter the panel removed the player in, if it did. */
  removedAt: QuarterId | null;
}

const moveTitle = (id: string) => MOVES.find((m) => m.id === id)?.title ?? id;

/** What the player found in a played quarter, by its found text, as the result screen words it. */
function foundIn(save: GameSave, played: PlayedQuarter): string[] {
  const ids = played.outcome.discoveries;
  const early = ids.filter(
    (d): d is DiscoveryId => !(LATER_DISCOVERIES as readonly string[]).includes(d),
  );
  if (played.period === "2194-Q1" || played.period === "2194-Q2")
    return earnedDiscoveries(early, played.period)
      .filter((d) => d.found)
      .map((d) => d.text);
  const ctx = laterContext(save, played.period);
  const later = ids.filter((d) => (LATER_DISCOVERIES as readonly string[]).includes(d));
  return laterDiscoveries(
    later as Parameters<typeof laterDiscoveries>[0],
    ctx ? laterOffers(ctx) : [],
  )
    .filter((d) => d.found)
    .map((d) => d.text);
}

export function shopReports(save: GameSave): ShopReports {
  const seen = new Set<QuarterId>(save.reportsSeen ?? []);
  const record = serviceRecord(save);
  const needsPicks = save.played.some((q) => "picks" in q.outcome.plan);
  const editions = needsPicks ? new Map(getQ2Candidates().map((c) => [c.isbn, c])) : null;
  const reports = save.played.map((played, i): ShopReport => {
    const card = played.outcome.reportCard.plan;
    const plan = played.outcome.plan;
    const picks =
      "picks" in plan
        ? plan.picks.map((isbn) => {
            const edition = isbn ? editions?.get(isbn) : undefined;
            return edition ? editionLabel(edition) : null;
          })
        : null;
    return {
      quarter: played.period,
      new: !seen.has(played.period),
      overall: {
        score: card.overall.score,
        grade: card.overall.grade,
        binding: [...card.overall.binding],
        allMet: card.overall.allMet,
        strike: card.overall.score < STRIKE_BELOW,
      },
      measures: card.measures,
      plan: { picks, moves: plan.levers.map(moveTitle) },
      event: record[i]?.event ?? null,
      found: foundIn(save, played),
    };
  });
  return { reports: reports.reverse(), record, removedAt: removalOf(save)?.at ?? null };
}
