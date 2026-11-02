import { describe, expect, it } from "vitest";
import type { AlmaRecord } from "~/alma/record";
import type { GameSave } from "~/game/types";
import { quarterAt, type QuarterId } from "~/game/quarters";
import { laterMemo, shortTitle } from "./later-memo.server";

const played = (scores: number[]) => scores.map((score, i) => ({
  period: quarterAt(i),
  outcome: { reportCard: { plan: { overall: { score, grade: score < 60 ? "F" : score < 70 ? "D" : "C-", binding: ["profit"] } } } },
}));
const save = (scores: number[]) => ({ played: played(scores) }) as unknown as GameSave;
const record = (quarter: QuarterId, over: Partial<AlmaRecord> = {}): AlmaRecord => ({
  quarter, source: "alma", type: "genre_surge", params: { genre: "Mystery", month: 2, percent: 20 }, stretch: { measure: "culture", percent: 15 },
  story: "A book club on the hydroponics deck has started on detective stories.", reason: "THE COUNCIL HAS READ A STUDY ABOUT FOOT TRAFFIC.",
  bossLine: "THE COMMERCE OFFICE HAS NOTED THE BOOK CLUB. DO NOT WASTE IT.", promptVersion: 1, attempts: 1, ...over,
}) as AlmaRecord;
const lines = (memo: ReturnType<typeof laterMemo>) => memo.transmission.memo.map((l) => (l as string[])[0]);

describe("the memo from Q3 on (endless.md section 3, endless-copy.md section 2)", () => {
  it("reads in Plot's order: score, Alma's flavor and the fact, the stretch, the calendar; Alma's boss line", () => {
    const memo = laterMemo(save([75, 72]), "2194-Q3", record("2194-Q3"));
    expect(lines(memo)).toEqual([
      "Q2 2194 overall score: 72 (C−). Lowest measure: Profit.",
      "A book club on the hydroponics deck has started on detective stories. The Council expects mystery orders to rise 20% in August.",
      'The Ministry of Culture has raised its goal for Culture by 15% this quarter, instead of the usual 5%. Its reason: "THE COUNCIL HAS READ A STUDY ABOUT FOOT TRAFFIC."',
      "The Book of the Month calendar for July, August and September is empty. Submit your picks and a plan when you are ready.",
    ]);
    expect(memo.transmission.line).toBe("THE COMMERCE OFFICE HAS NOTED THE BOOK CLUB. DO NOT WASTE IT.");
    expect(memo.transmission.memoHeader[2]).toBe("July 1, 2194");
    expect(memo.bell).toEqual({ title: "Q3 2194: Mystery orders rising in August", detail: "Read the memo, then submit your picks and a plan for Q3 2194." });
    expect(memo.strip.short).toEqual(["Standing order: plan due for Q3 2194."]);
  });

  it("names a first strike, and the Administrator speaks instead of Alma", () => {
    const memo = laterMemo(save([75, 66]), "2194-Q3", record("2194-Q3"));
    expect(lines(memo)[1]).toBe("That was a strike: your overall score was under 70. A strike counts for four quarters. Three counting at once, and the panel will remove you.");
    expect(memo.transmission.line).toBe("OVERALL SCORE: 66. THAT IS A STRIKE. THE PANEL ALLOWS TWO. THE PANEL HAS ALREADY BOOKED THE ROOM.");
  });

  it("names a second strike counting, when the older expires, and holds every goal at 5%", () => {
    const memo = laterMemo(save([66, 80, 64]), "2194-Q4", record("2194-Q4", { stretch: null, reason: undefined }));
    // Q1's strike counts in Q1 to Q4: it expires after Q4 2194.
    expect(lines(memo)[1]).toBe("That was your second strike in four quarters. One more while both count, and the panel will remove you. The older one expires after Q4 2194.");
    expect(lines(memo)).toContain("With two strikes counting, the bosses have held every goal at the usual 5% this quarter.");
    expect(memo.transmission.line).toBe("OVERALL SCORE: 64. THAT IS TWO STRIKES. ONE MORE, AND THE PANEL CONVENES. THE ROOM IS STILL BOOKED.");
    expect(memo.strip.short).toEqual(["Standing order: one more strike ends your tenure. Plan due for Q4 2194."]);
  });

  it("says when a strike has expired, with the count after it, and the Administrator says so too", () => {
    // Q1's strike counted in Q1 to Q4, so by the memo for Q1 2195 it has expired.
    const memo = laterMemo(save([66, 80, 75, 90]), "2195-Q1", record("2195-Q1"));
    expect(lines(memo)[1]).toBe("Your strike from Q1 2194 has expired. Strikes counting: 0.");
    expect(memo.transmission.line).toBe("A STRIKE HAS EXPIRED. WE HAVE UPDATED THE SPREADSHEET. THE SPREADSHEET IS RELIEVED.");
    expect(memo.transmission.memoHeader[2]).toBe("January 1, 2195");
  });

  it("shows a new strike and an expiry together, the new strike first, and its line wins", () => {
    const memo = laterMemo(save([66, 80, 75, 60]), "2195-Q1", record("2195-Q1"));
    expect(lines(memo).slice(1, 3)).toEqual([
      "That was a strike: your overall score was under 70. A strike counts for four quarters. Three counting at once, and the panel will remove you.",
      "Your strike from Q1 2194 has expired. Strikes counting: 1.",
    ]);
    expect(memo.transmission.line).toMatch(/^OVERALL SCORE: 60\. THAT IS A STRIKE\./);
  });

  it("titles every event for the bell and the record (endless-copy.md section 1)", () => {
    const t = (type: string, params: AlmaRecord["params"]) => shortTitle({ quarter: "2194-Q4", type, params });
    expect(t("genre_slump", { genre: "Romance", month: 2, percent: 15 })).toBe("Romance orders falling in November");
    expect(t("genre_surge", { genre: "SciFi/Fantasy", month: 2, percent: 15 })).toBe("Science fiction and fantasy orders rising in November");
    expect(t("quiet_days", { weekday: "Tuesday", percent: 15 })).toBe("Quiet Tuesdays");
    expect(t("author_fares", { cost: 350 })).toBe("Author nights at $350");
    expect(t("format_costs", { format: "Mass market paperback", percent: 66 })).toBe("Mass market paperback costs at 66%");
    expect(t("quiet_quarter", {})).toBe("A quiet quarter");
  });
});
