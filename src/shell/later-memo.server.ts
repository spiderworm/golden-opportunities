// The Commerce Office's memo for each quarter from Q3 2194 on (endless.md section 3; endless-copy.md sections 1
// and 2). The server builds it, so Alma's flavor sits only beside the server's own fact and stretch sentences,
// and the strike lines follow the one removal rule (src/simulation/strikes.ts). The shell shows it as it shows
// Q1's and Q2's.
import type { AlmaRecord } from "~/alma/record";
import { factSentence, MEASURE_NAMES, stretchSentence } from "~/alma/sentences";
import { MONTHS } from "~/alma/names";
import type { GameSave } from "~/game/types";
import { quarterAt, quarterIndex, quarterMonths, type QuarterId } from "~/game/quarters";
import { BOSSES } from "~/platform/bosses/bosses";
import { STRIKE_BELOW, strikes } from "~/simulation/strikes";
import { bellItem, eventTitle } from "~/game/event-title";
import { ALERT_COPY, type AlertCopy } from "./alert-copy";

/** "2194-Q3" as "Q3 2194". */
const name = (quarter: string) => `${quarter.slice(5)} ${quarter.slice(0, 4)}`;
/** "July, August and September". */
const monthList = (quarter: QuarterId) => {
  const months = quarterMonths(quarter).map((m) => MONTHS[Number(m.slice(5)) - 1]!);
  return `${months.slice(0, -1).join(", ")} and ${months.at(-1)}`;
};
/** "Profit", "Profit and Culture": in report-card order, as the engine lists them. */
const measureList = (ids: readonly (keyof typeof MEASURE_NAMES)[]) => {
  const list = ids.map((id) => MEASURE_NAMES[id]);
  return list.length < 2 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
};

/** An event's short title (endless-copy.md section 1): the shared one in src/game/event-title.ts. */
export const shortTitle = (record: Pick<AlmaRecord, "quarter" | "type" | "params">) => eventTitle(record.quarter, record);

/** The Administrator's strike lines (endless.md section 7), in place of Alma's boss line. */
const STRIKE_LINES = {
  first: (score: number) => `OVERALL SCORE: ${score}. THAT IS A STRIKE. THE PANEL ALLOWS TWO. THE PANEL HAS ALREADY BOOKED THE ROOM.`,
  second: (score: number) => `OVERALL SCORE: ${score}. THAT IS TWO STRIKES. ONE MORE, AND THE PANEL CONVENES. THE ROOM IS STILL BOOKED.`,
  expired: "A STRIKE HAS EXPIRED. WE HAVE UPDATED THE SPREADSHEET. THE SPREADSHEET IS RELIEVED.",
};

/**
 * The memo for the quarter being planned, after `save.played`: its record is Alma's for that quarter. The lines
 * go in Plot's order: the score, this quarter's strike, any expired strike, Alma's flavor and the fact, the
 * stretch, the calendar.
 */
export function laterMemo(save: GameSave, quarter: QuarterId, record: AlmaRecord): AlertCopy {
  const scores = save.played.map((q) => q.outcome.reportCard.plan.overall.score);
  const last = save.played.at(-1)!;
  const card = last.outcome.reportCard.plan.overall;
  const counting = strikes(scores, "next");
  const struck = card.score < STRIKE_BELOW;
  // A strike counts in its own quarter and the three after, so the one from four quarters back has just expired.
  const lapsed = save.played.length >= 4 && scores.at(-4)! < STRIKE_BELOW ? save.played.at(-4)!.period : null;
  const memo: string[] = [
    `${name(last.period)} overall score: ${card.score} (${card.grade.replace("-", "−")}). ${card.score >= 100 ? "Every measure met its goal." : `Lowest measure: ${measureList(card.binding)}.`}`,
  ];
  if (struck && counting === 1) memo.push("That was a strike: your overall score was under 70. A strike counts for four quarters. Three counting at once, and the panel will remove you.");
  if (struck && counting >= 2) {
    // The older strike counting: the first of the last three played under 70, before this one.
    const older = save.played.slice(-3, -1).find((q) => q.outcome.reportCard.plan.overall.score < STRIKE_BELOW)!;
    const expires = name(quarterAt(quarterIndex(older.period) + 3));
    memo.push(`That was your second strike in four quarters. One more while both count, and the panel will remove you. The older one expires after ${expires}.`);
  }
  if (lapsed) memo.push(`Your strike from ${name(lapsed)} has expired. Strikes counting: ${counting}.`);
  memo.push(`${record.story} ${factSentence(record)}`);
  const boss = record.stretch ? BOSSES[record.stretch.measure].name.replace(/^The /, "") : "";
  memo.push(stretchSentence(record, boss));
  memo.push(`The Book of the Month calendar for ${monthList(quarter)} is empty. Submit your picks and a plan when you are ready.`);

  // A new strike takes precedence over an expiry, and either over Alma's line (endless-copy.md section 2).
  const line = struck ? (counting >= 2 ? STRIKE_LINES.second(card.score) : STRIKE_LINES.first(card.score)) : lapsed ? STRIKE_LINES.expired : record.bossLine;
  const [year, month] = quarterMonths(quarter)[0]!.split("-");
  const two = counting >= 2;
  return {
    id: `${quarter}-memo`,
    transmission: {
      ...ALERT_COPY.transmission,
      line,
      memoHeader: ["LARKSPUR STATION / COMMERCE OFFICE", "Quarterly review: Orbital Books, Ring C, Berth 14", `${MONTHS[Number(month) - 1]} 1, ${year}`],
      memo: memo.map((text) => [text]),
    },
    strip: {
      ...ALERT_COPY.strip,
      long: [two
        ? `Standing order from the Commerce Office: one more strike ends your tenure. Submit a plan for ${name(quarter)}.`
        : `Standing order from the Commerce Office: submit your picks and a plan for ${name(quarter)}.`],
      short: [two ? `Standing order: one more strike ends your tenure. Plan due for ${name(quarter)}.` : `Standing order: plan due for ${name(quarter)}.`],
    },
    bell: (({ title, detail }) => ({ title, detail }))(bellItem(quarter, record)),
  };
}
