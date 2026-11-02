import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AssistantUnavailable } from "~/assistant/server/provider.server";
import { almaModel, chooseEvent, type AlmaModel } from "./director.server";
import { EVENT_TYPES, FORMATS, GENRES, MEASURE_IDS, WEEKDAYS, type MeasureId } from "./events";
import { almaInput, ALMA_RULES, type QuarterSummary } from "./prompt";
import { isAlmaLog, isAlmaRecord, type AlmaChoice, type AlmaRecord } from "./record";
import { scriptedChoice } from "./scripted";
import { textProblem } from "./text";
import { checkAnswer, choiceProblem, parseChoice, renderRecord, type ChoiceContext } from "./validate";

const good: AlmaChoice = {
  type: "genre_surge",
  params: { genre: "Mystery", month: 2, percent: 20 },
  stretch: { measure: "culture", percent: 15, reason: "THE COUNCIL HAS READ A STUDY ABOUT FOOT TRAFFIC." },
  story: "A book club on the hydroponics deck has started on {{genre}}. Expect a surge of {{percent}} in {{month}}.",
  bossLine: "WE ARE REALLY, REALLY, RIDICULOUSLY INTERESTED IN BOOKS. ZOOLANDER WOULD AGREE.",
};
const context: ChoiceContext = { quarter: "2194-Q3", previous: [], onStrike: false };
const with_ = (over: Partial<AlmaChoice>): AlmaChoice => ({ ...structuredClone(good), ...over });
const recordOf = (choice: AlmaChoice, quarter = "2194-Q3"): AlmaRecord => ({ quarter, source: "alma", ...structuredClone(choice), promptVersion: 1, attempts: 1, model: "sonnet" });

describe("the event types", () => {
  it("name the data's own genres and formats", () => {
    const data = JSON.parse(readFileSync(new URL("../bookshop/data.json", import.meta.url), "utf8"));
    const genres = new Set<string>(), formats = new Set<string>();
    for (const list of Object.values(data)) if (Array.isArray(list)) for (const r of list) {
      if (r?.genre) genres.add(r.genre);
      if (r?.format) formats.add(r.format);
    }
    expect([...GENRES].sort()).toEqual([...genres].sort());
    expect([...FORMATS].sort()).toEqual([...formats].sort());
    expect(WEEKDAYS).toHaveLength(7);
  });

  it("are all in the rules Alma is given, with their limits", () => {
    for (const t of EVENT_TYPES) expect(ALMA_RULES).toContain(`- ${t.id}`);
    expect(ALMA_RULES).toContain("from 10 to 30 (percent)");
    expect(ALMA_RULES).toContain("from 100 to 400 (dollars)");
  });
});

describe("the text checks", () => {
  const slots = new Set(["percent", "genre"]);
  it("let a story say surge and slump: Alma's event is the story's truth", () => {
    expect(textProblem("story", "Mysteries will surge, then slump, by {{percent}}.", slots)).toBeNull();
  });
  it("keep every number in a slot", () => {
    expect(textProblem("story", "Orders rise 20%.", slots)).toBe("a number outside a slot");
    expect(textProblem("story", "Orders rise by twenty.", slots)).toBe("a number outside a slot");
    expect(textProblem("story", "Orders rise by half.", slots)).toBe("a number outside a slot");
    expect(textProblem("story", "Orders rise by ２０.", slots)).toBe("a number outside a slot");
    expect(textProblem("story", "Orders rise by {{cost}}.", slots)).toBe("an unknown slot");
    expect(textProblem("story", "Orders rise by {percent}.", slots)).toBe("a number outside a slot");
  });
  it("refuse emoji, addresses and control characters, and cap the length", () => {
    expect(textProblem("story", "A club has formed 📚.", slots)).toBe("emoji");
    expect(textProblem("story", "Write to someone@example.com.", slots)).toBe("an email address");
    expect(textProblem("story", "Write to someone at @club.", slots)).toBe("an email address");
    expect(textProblem("story", "A club‮ has formed.", slots)).toBe("control characters");
    expect(textProblem("story", "a".repeat(281), slots)).toBe("too long");
  });
  it("keep the voices apart: plain story, capital reason and boss line, Zoolander only in the boss line", () => {
    expect(textProblem("story", "A CLUB HAS FORMED.", slots)).toBe("not plain prose");
    expect(textProblem("reason", "The council wants it.", slots)).toBe("not in capitals");
    expect(textProblem("bossLine", "WE HAVE SPOKEN.", slots)).toBeNull();
    expect(textProblem("story", "Zoolander would approve of the club.", slots)).toBe("Zoolander outside the boss line");
    expect(textProblem("reason", "ZOOLANDER SAYS SO.", slots)).toBe("Zoolander outside the boss line");
    expect(textProblem("bossLine", "ZOOLANDER SAYS SO.", slots)).toBeNull();
  });
});

describe("Alma's answer", () => {
  it("is exactly one JSON object of the fixed shape", () => {
    expect(parseChoice(JSON.stringify(good))).toEqual({ ok: true, choice: good });
    expect(parseChoice("```json\n" + JSON.stringify(good) + "\n```").ok).toBe(true);
    expect(parseChoice("Here you go: " + JSON.stringify(good))).toEqual({ ok: false, failure: "not_json" });
    expect(parseChoice(JSON.stringify({ ...good, note: "x" }))).toEqual({ ok: false, failure: "shape" });
    expect(parseChoice(JSON.stringify({ ...good, stretch: { measure: "culture", percent: 15 } }))).toEqual({ ok: false, failure: "shape" });
    expect(parseChoice("[]")).toEqual({ ok: false, failure: "shape" });
  });

  it("keeps every param within its type's limits, without clamping", () => {
    expect(choiceProblem(good, context)).toBeNull();
    expect(choiceProblem(with_({ params: { genre: "Mystery", month: 2, percent: 31 } }), context)).toBe("params");
    expect(choiceProblem(with_({ params: { genre: "Mystery", month: 2, percent: 20.5 } }), context)).toBe("params");
    expect(choiceProblem(with_({ params: { genre: "Westerns", month: 2, percent: 20 } }), context)).toBe("params");
    expect(choiceProblem(with_({ params: { genre: "Mystery", month: 4, percent: 20 } }), context)).toBe("params");
    expect(choiceProblem(with_({ params: { genre: "Mystery", month: 2, percent: 20, extra: 1 } }), context)).toBe("params");
    expect(choiceProblem(with_({ type: "space_geese" }), context)).toBe("type");
    expect(choiceProblem(with_({ stretch: { ...good.stretch, percent: 25 } }), context)).toBe("stretch_percent");
    expect(choiceProblem(with_({ stretch: { ...good.stretch, measure: "joy" as MeasureId } }), context)).toBe("stretch_measure");
  });

  it("keeps the choosing rules (section 2)", () => {
    const last = recordOf(good, "2194-Q2");
    expect(choiceProblem(good, { ...context, previous: [last] })).toBe("rule:repeat_type");
    const fares = with_({ type: "author_fares", params: { cost: 300 }, story: "An author night now costs {{cost}}." });
    expect(choiceProblem(fares, { ...context, previous: [last] })).toBe("rule:repeat_stretch");
    expect(choiceProblem({ ...fares, stretch: { ...fares.stretch, measure: "profit" } }, context)).toBe("rule:against_stretch");
    const slump = with_({ type: "genre_slump", params: { genre: "Romance", month: 1, percent: 10 }, story: "The archive lends {{genre}} free." });
    expect(choiceProblem(slump, context)).toBeNull();
    expect(choiceProblem(slump, { ...context, onStrike: true })).toBe("rule:piling_on");
    expect(choiceProblem(good, { ...context, recovery: { measure: "happiness", drop: 14 } })).toBe("rule:recovery");
    const quiet = with_({ type: "quiet_quarter", params: {}, story: "Nothing much is expected this quarter." });
    const faresForReaders = recordOf({ ...fares, stretch: { ...fares.stretch, measure: "readers" } }, "2194-Q2");
    expect(choiceProblem(quiet, { ...context, previous: [recordOf(quiet, "2194-Q1"), faresForReaders] })).toBe("rule:too_often");
    // Three quarters on, a quiet quarter is allowed again.
    expect(choiceProblem(quiet, { ...context, previous: [recordOf(quiet, "2193-Q4"), recordOf(slump, "2194-Q1"), faresForReaders] })).toBeNull();
  });

  it("renders its slots from the params, in their units, in the quarter's months", () => {
    const checked = checkAnswer(JSON.stringify(good), context);
    expect(checked.ok).toBe(true);
    expect(renderRecord(recordOf(good)).story).toBe("A book club on the hydroponics deck has started on Mystery. Expect a surge of 20% in August.");
    const recovery = { ...recordOf({ ...good, stretch: { measure: "happiness", percent: 12, reason: "HAPPINESS FELL {{drop}}. RESTORE IT." } }), drop: 14 };
    expect(renderRecord(recovery).reason).toBe("HAPPINESS FELL 14%. RESTORE IT.");
  });
});

describe("the save's checks (Frank's validate())", () => {
  it("accept a record, and refuse an unbounded or malformed one", () => {
    expect(isAlmaRecord(recordOf(good))).toBe(true);
    expect(isAlmaRecord({ ...recordOf(good), story: "a".repeat(281) })).toBe(false);
    expect(isAlmaRecord({ ...recordOf(good), extra: 1 })).toBe(false);
    expect(isAlmaRecord({ ...recordOf(good), quarter: "Q3" })).toBe(false);
    expect(isAlmaRecord({ ...recordOf(good), params: { genre: { nested: true } } })).toBe(false);
    expect(isAlmaRecord({ ...recordOf(good), params: { percent: Infinity } })).toBe(false);
    expect(isAlmaRecord({ ...recordOf(good), attempts: 99 })).toBe(false);
  });
  it("accept a log in quarter order, one per quarter, none past the quarter being prepared", () => {
    const q3 = recordOf(good, "2194-Q3"), q4 = recordOf(good, "2194-Q4");
    expect(isAlmaLog([q3, q4], "2194-Q4")).toBe(true);
    expect(isAlmaLog([q4, q3], "2194-Q4")).toBe(false);
    expect(isAlmaLog([q3, q3], "2194-Q4")).toBe(false);
    expect(isAlmaLog([q3, q4], "2194-Q3")).toBe(false);
  });
});

describe("the scripted fallback", () => {
  it("is the same for the same seed and quarter, and differs across them", () => {
    expect(scriptedChoice(7, context)).toEqual(scriptedChoice(7, context));
    const picks = new Set(Array.from({ length: 12 }, (_, seed) => JSON.stringify(scriptedChoice(seed, context))));
    expect(picks.size).toBeGreaterThan(3);
  });

  it("always gives a choice that passes the checks, whatever came before (every case)", () => {
    const stub = (type: string, measure: MeasureId, quarter: string): AlmaRecord => ({ ...recordOf(good, quarter), type, stretch: { ...good.stretch, measure } });
    let cases = 0;
    for (const lastType of EVENT_TYPES) for (const lastMeasure of MEASURE_IDS) for (const quietBefore of [false, true]) for (const onStrike of [false, true]) for (const recovery of [undefined, ...MEASURE_IDS]) {
      const previous = [...(quietBefore ? [stub("quiet_quarter", "culture", "2194-Q1")] : []), stub(lastType.id, lastMeasure, "2194-Q2")];
      const ctx: ChoiceContext = { quarter: "2194-Q3", previous, onStrike, ...(recovery ? { recovery: { measure: recovery, drop: 12 } } : {}) };
      const choice = scriptedChoice(cases, ctx);
      // The limits, the piling-on rule and the recovery stretch always hold; only the repeat rules may give way.
      expect(choiceProblem(choice, { ...ctx, previous: [] }), JSON.stringify(ctx)).toBeNull();
      expect(isAlmaRecord({ ...recordOf(choice), source: "scripted" })).toBe(true);
      cases++;
    }
    expect(cases).toBe(EVENT_TYPES.length * 4 * 2 * 2 * 5);
  });
});

describe("what Alma sees", () => {
  it("is only past plans, scores, strikes and its own past choices, never their text", () => {
    const history: QuarterSummary[] = [{ quarter: "2194-Q2", plan: ["pick:123"], scores: { profit: 80, readers: 70, happiness: 75, culture: 90 }, overall: 70, grade: "C-", strike: false }];
    const input = JSON.parse(almaInput({ ...context, previous: [recordOf(good, "2194-Q2")], recovery: { measure: "profit", drop: 12 } }, history));
    expect(Object.keys(input)).toEqual(["quarter", "onStrike", "recovery", "history", "lastEvents"]);
    expect(Object.keys(input.history[0])).toEqual(["quarter", "plan", "scores", "overall", "grade", "strike"]);
    expect(input.lastEvents[0]).toEqual({ quarter: "2194-Q2", type: "genre_surge", params: good.params, stretch: { measure: "culture", percent: 15 } });
    expect(JSON.stringify(input)).not.toContain("book club");
  });
});

describe("Alma's turn", () => {
  const model = (...answers: (string | Error | "hang")[]): AlmaModel & { calls: number } => {
    const m = {
      name: "sonnet",
      calls: 0,
      async ask(_system: string, _input: string, signal: AbortSignal) {
        const answer = answers[m.calls++];
        if (answer === "hang") return new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(new AssistantUnavailable("stopped", "timeout"))));
        if (answer instanceof Error) throw answer;
        return answer;
      },
    };
    return m;
  };

  it("keeps a valid answer as Alma's", async () => {
    const record = await chooseEvent(context, [], { seed: 1, model: model(JSON.stringify(good)) });
    expect(record).toMatchObject({ source: "alma", attempts: 1, model: "sonnet", type: "genre_surge", quarter: "2194-Q3" });
    expect(isAlmaRecord(record)).toBe(true);
  });

  it("asks once more after an invalid answer, then scripts", async () => {
    const twice = model("not json", JSON.stringify(good));
    expect(await chooseEvent(context, [], { seed: 1, model: twice })).toMatchObject({ source: "alma", attempts: 2 });
    const never = model(JSON.stringify(with_({ params: { genre: "Mystery", month: 2, percent: 99 } })), "not json");
    const record = await chooseEvent(context, [], { seed: 1, model: never });
    expect(record).toMatchObject({ source: "scripted", attempts: 2, failure: "not_json" });
    expect(never.calls).toBe(2);
  });

  it("scripts at once, with no retry, when the model fails or runs out of time", async () => {
    const failing = model(new AssistantUnavailable("signed out", "signed_out"), JSON.stringify(good));
    expect(await chooseEvent(context, [], { seed: 1, model: failing })).toMatchObject({ source: "scripted", attempts: 1, failure: "unavailable:signed_out" });
    expect(failing.calls).toBe(1);
    const slow = model("hang", JSON.stringify(good));
    expect(await chooseEvent(context, [], { seed: 1, model: slow, timeoutMs: 20 })).toMatchObject({ source: "scripted", attempts: 1, failure: "timeout" });
    expect(slow.calls).toBe(1);
  });

  it("scripts without asking when there's no model, as in every test run", async () => {
    expect(almaModel()).toBeNull();
    expect(almaModel({ ORBITAL_ALMA_PROVIDER: "scripted" })).toBeNull();
    const record = await chooseEvent(context, [], { seed: 3, model: null });
    expect(record).toMatchObject({ source: "scripted", attempts: 0 });
    expect(record).not.toHaveProperty("failure");
    expect(record).toEqual(await chooseEvent(context, [], { seed: 3, model: null }));
  });

  it("keeps a recovery's drop on the record, for its slot", async () => {
    const record = await chooseEvent({ ...context, recovery: { measure: "happiness", drop: 14 } }, [], { seed: 2, model: null });
    expect(record.stretch.measure).toBe("happiness");
    expect(renderRecord(record).reason).toBe("HAPPINESS FELL 14%. RESTORE IT.");
  });
});
