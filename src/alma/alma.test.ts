import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AssistantUnavailable } from "~/assistant/server/provider.server";
import { candidateProblem, drawCandidates, type Candidate, type QuarterContext } from "./candidates";
import { almaModel, chooseEvent, type AlmaModel } from "./director.server";
import { EVENT_TYPES, FORMATS, GENRES, MEASURE_IDS, WEEKDAYS, type MeasureId } from "./events";
import { almaInput, ALMA_RULES, type QuarterSummary } from "./prompt";
import { FAILURES, isAlmaLog, isAlmaRecord, type AlmaRecord } from "./record";
import { scriptedFlavor } from "./scripted";
import { factSentence, stretchSentence } from "./sentences";
import { textProblem, type TextRules } from "./text";
import { checkAnswer, parseAnswer, wantsReason } from "./validate";

const data = JSON.parse(readFileSync(new URL("../bookshop/data.json", import.meta.url), "utf8"));
const TITLES: string[] = [...new Set<string>(data.books.map((b: { title: string }) => b.title))];
const ACCOUNT = ["jordan", "avery"];

const surge: Candidate = { type: "genre_surge", params: { genre: "Mystery", month: 2, percent: 20 }, stretch: { measure: "culture", percent: 15 } };
const context: QuarterContext = { quarter: "2194-Q3", previous: [], strikes: 0 };
const rules = (candidate = surge): TextRules => ({ candidate, quarter: "2194-Q3", titles: TITLES, account: ACCOUNT });
const record = (over: Partial<AlmaRecord> = {}): AlmaRecord => ({
  quarter: "2194-Q3",
  source: "alma",
  type: "genre_surge",
  params: { genre: "Mystery", month: 2, percent: 20 },
  stretch: { measure: "culture", percent: 15 },
  story: "A book club on the hydroponics deck has started on detective stories.",
  reason: "THE ARTS PANEL IS PREPARING ITS ANNUAL REVIEW.",
  bossLine: "WE ARE REALLY, REALLY, RIDICULOUSLY INTERESTED IN BOOKS. ZOOLANDER WOULD AGREE.",
  model: "sonnet",
  promptVersion: 2,
  attempts: 1,
  ...over,
});
const answer = (over: object = {}) => JSON.stringify({ candidate: 0, story: "A book club on the hydroponics deck has started on detective stories.", reason: "THE ARTS PANEL IS PREPARING ITS ANNUAL REVIEW.", bossLine: "THE COMMERCE OFFICE HAS NOTED IT.", ...over });
const checks = { titles: TITLES, account: ACCOUNT };

describe("the event types", () => {
  it("name the data's own genres and formats", () => {
    const genres = new Set<string>(), formats = new Set<string>();
    for (const list of Object.values(data)) if (Array.isArray(list)) for (const r of list) {
      if (r?.genre) genres.add(r.genre);
      if (r?.format) formats.add(r.format);
    }
    expect([...GENRES].sort()).toEqual([...genres].sort());
    expect([...FORMATS].sort()).toEqual([...formats].sort());
    expect(WEEKDAYS).toHaveLength(7);
  });

  it("work against section 2's measures (Sim's bounds)", () => {
    const against = Object.fromEntries(EVENT_TYPES.map((t) => [t.id, [...t.against]]));
    expect(against).toEqual({ genre_surge: [], genre_slump: ["profit", "readers", "culture"], quiet_days: ["profit", "readers", "culture"], author_fares: ["profit"], format_costs: ["profit"], quiet_quarter: [] });
  });
});

describe("the server's candidates", () => {
  const stub = (type: string, measure: MeasureId, quarter: string): AlmaRecord => record({ quarter, type, stretch: { measure, percent: 15 } });

  it("are the same for the same seed and quarter, and vary across them", () => {
    expect(drawCandidates(7, context)).toEqual(drawCandidates(7, context));
    const types = new Set(Array.from({ length: 40 }, (_, seed) => drawCandidates(seed, context).map((c) => c.type)).flat());
    expect(types.size).toBe(EVENT_TYPES.length);
  });

  it("keep every limit and rule, in every case (section 2)", () => {
    let cases = 0;
    for (const lastType of EVENT_TYPES) for (const lastMeasure of MEASURE_IDS) for (const quietBefore of [false, true]) for (const strikes of [0, 1, 2]) for (const recovery of [undefined, ...MEASURE_IDS]) {
      const previous = [...(quietBefore ? [stub("quiet_quarter", "culture", "2194-Q1")] : []), stub(lastType.id, lastMeasure, "2194-Q2")];
      const ctx: QuarterContext = { quarter: "2194-Q3", previous, strikes, ...(recovery ? { recovery: { measure: recovery, drop: 12 } } : {}) };
      const three = drawCandidates(cases, ctx);
      expect(new Set(three.map((c) => JSON.stringify(c))).size).toBe(3);
      for (const c of three) {
        // The limits, "no piling on" and the recovery goal always hold; only the repeat rules may give way.
        expect(candidateProblem(c, ctx, { repeats: false }), JSON.stringify({ ctx, c })).toBeNull();
        if (strikes >= 2) {
          expect(c.stretch).toBeNull();
          expect(["genre_surge", "author_fares", "quiet_quarter"]).toContain(c.type);
          if (c.type === "author_fares") expect(c.params.cost).toBeLessThanOrEqual(200);
        } else if (recovery) {
          expect(c.stretch).toEqual({ measure: recovery, percent: 20 });
        }
      }
      cases++;
    }
    expect(cases).toBe(EVENT_TYPES.length * 4 * 2 * 3 * 5);
  });

  it("keep the repeat rules whenever the others leave room", () => {
    for (let seed = 0; seed < 50; seed++) {
      const ctx: QuarterContext = { quarter: "2194-Q3", previous: [stub("author_fares", "readers", "2194-Q2")], strikes: 0 };
      for (const c of drawCandidates(seed, ctx)) expect(candidateProblem(c, ctx)).toBeNull();
    }
  });

  it("are weighted away from the last four quarters' types", () => {
    const recent = ["genre_surge", "genre_slump", "genre_surge", "quiet_days"].map((t, i) => stub(t, "happiness", `2194-Q${i + 1}`));
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 300; seed++) for (const c of drawCandidates(seed, { quarter: "2195-Q1", previous: recent, strikes: 0 })) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
    expect(counts.get("quiet_days")).toBeUndefined(); // last quarter's type
    expect(counts.get("genre_surge")!).toBeLessThan(counts.get("author_fares")!);
  });
});

describe("the text checks", () => {
  it("refuse figures and directions: the fact sentence carries them", () => {
    for (const bad of ["Mystery orders will surge.", "Sales rise sharply.", "Twenty readers came.", "Orders quadrupled.", "A score of readers came.", "Orders fell."]) expect(textProblem("story", bad, rules()), bad).toBe("number_or_direction");
    expect(textProblem("bossLine", "XX REASONS TO SELL.", rules())).toBe("number_or_direction");
    expect(textProblem("bossLine", "DID I SAY MILD? MIX IT, CIVIL AND VIVID.", rules())).toBeNull();
    expect(textProblem("story", "A club meets at {{month}}.", rules())).toBe("slot");
  });

  it("name nothing but the chosen candidate's genre, weekday, format or month, and no title (Probe's finding 1)", () => {
    expect(textProblem("story", "Detective stories and mysteries are the talk of the deck in August.", rules())).toBeNull();
    expect(textProblem("story", "Romance readers have found a new club.", rules())).toBe("name");
    expect(textProblem("story", "The club meets on Tuesdays.", rules())).toBe("name");
    expect(textProblem("story", "The club meets in July.", rules())).toBe("name");
    expect(textProblem("story", "Hardcover copies are scarce.", rules())).toBe("name");
    expect(textProblem("story", `Everyone is reading ${TITLES[0]}.`, rules())).toBe("name");
    const scifi = { ...surge, params: { genre: "SciFi/Fantasy", month: 1, percent: 12 } };
    expect(textProblem("story", "Science fiction fans have opened a club.", rules(scifi))).toBeNull();
    expect(textProblem("story", "Fiction fans have opened a club.", rules(scifi))).toBe("name");
    // Months count in capitals too, except the two that are words.
    expect(textProblem("bossLine", "WE MAY ALLOW IT. MARCH ON.", rules())).toBeNull();
    expect(textProblem("bossLine", "SEE YOU IN JULY.", rules())).toBe("name");
  });

  it("never let the account holder's name through (Probe's review)", () => {
    expect(textProblem("story", "Jordan has opened a club on the deck.", rules())).toBe("account");
    expect(textProblem("bossLine", "AVERY KNOWS.", rules())).toBe("account");
    expect(textProblem("story", "The jordanian club meets on the deck.", rules())).toBeNull();
  });

  it("refuse addresses, emoji, control characters, the wrong voice, misplaced Zoolander and Alma, and overlong text", () => {
    expect(textProblem("story", "Write to someone at the club@deck.", rules())).toBe("address");
    expect(textProblem("story", "Write to [address removed] today.", rules())).toBe("address");
    expect(textProblem("story", "A club has formed 📚.", rules())).toBe("emoji");
    expect(textProblem("story", "A club‮ has formed.", rules())).toBe("control");
    expect(textProblem("story", "A CLUB HAS FORMED.", rules())).toBe("voice");
    expect(textProblem("reason", "The arts panel wants it.", rules())).toBe("voice");
    expect(textProblem("story", "Zoolander would approve of the club.", rules())).toBe("zoolander");
    expect(textProblem("bossLine", "ZOOLANDER WOULD APPROVE.", rules())).toBeNull();
    expect(textProblem("bossLine", "WELL DONE, ALMA.", rules())).toBe("alma");
    expect(textProblem("story", "a".repeat(241), rules())).toBe("too_long");
  });
});

describe("Alma's answer", () => {
  const three = drawCandidates(5, context);
  const fit = (i: number) => answer({ candidate: i, story: "Something is stirring on the docks.", bossLine: "WE HAVE NOTED IT.", reason: wantsReason(three[i] ?? three[0], context) ? "THE COUNCIL HAS READ A STUDY ABOUT FOOT TRAFFIC." : undefined });

  it("is exactly one JSON object of the fixed shape", () => {
    expect(parseAnswer(answer()).ok).toBe(true);
    expect(parseAnswer("```json\n" + answer() + "\n```").ok).toBe(true);
    expect(parseAnswer("Here: " + answer())).toEqual({ ok: false, failure: "not_json" });
    expect(parseAnswer(answer({ type: "genre_slump" }))).toEqual({ ok: false, failure: "shape" });
    expect(parseAnswer(JSON.stringify({ candidate: 0, story: "x" }))).toEqual({ ok: false, failure: "shape" });
  });

  it("picks one of the three, and has no way to set a param or a stretch (Probe's finding 2)", () => {
    expect(checkAnswer(fit(1), three, context, checks)).toMatchObject({ ok: true, index: 1 });
    expect(checkAnswer(fit(3), three, context, checks)).toEqual({ ok: false, failure: "candidate" });
    expect(checkAnswer(answer({ candidate: "0" }), three, context, checks)).toEqual({ ok: false, failure: "candidate" });
  });

  it("has a reason exactly when the quarter has an extra stretch", () => {
    const one = [surge, surge, surge];
    expect(checkAnswer(answer({ reason: undefined }), one, context, checks)).toEqual({ ok: false, failure: "reason" });
    const recovering: QuarterContext = { ...context, recovery: { measure: "culture", drop: 12 } };
    const recover = { ...surge, stretch: { measure: "culture" as const, percent: 20 } };
    expect(checkAnswer(answer(), [recover, recover, recover], recovering, checks)).toEqual({ ok: false, failure: "reason" });
    expect(checkAnswer(answer({ reason: undefined }), [recover, recover, recover], recovering, checks).ok).toBe(true);
  });

  it("can fail only with codes in FAILURES (Frank's review)", async () => {
    const { TEXT_PROBLEMS } = await import("./text");
    const parseFailures = ["not_json", "shape", "candidate", "reason"];
    const textFailures = (["story", "reason", "bossLine"] as const).flatMap((f) => TEXT_PROBLEMS.map((p) => `text:${f}:${p}`));
    for (const code of [...parseFailures, ...textFailures, "timeout"]) expect(FAILURES).toContain(code);
    // A kind the provider doesn't list yet still makes a valid record.
    const odd = { name: "x", ask: async () => { throw new AssistantUnavailable("new", "brand_new" as never); } };
    const r = await chooseEvent(context, [], { seed: 1, model: odd, ...checks });
    expect(r.failure).toBe("unavailable:other");
    expect(isAlmaRecord(r)).toBe(true);
    for (const kind of ["timeout", "missing", "signed_out", "broken", "other"]) expect(FAILURES).toContain(`unavailable:${kind}`);
  });

  it("names a field and a problem from the fixed list when it fails", () => {
    const failed = checkAnswer(answer({ story: "Mystery orders will surge." }), [surge, surge, surge], context, checks);
    expect(failed).toEqual({ ok: false, failure: "text:story:number_or_direction" });
    expect(FAILURES).toContain((failed as { failure: string }).failure);
  });
});

describe("the server's sentences (section 3)", () => {
  it("write every figure from the record", () => {
    expect(factSentence(record())).toBe("The Council expects mystery orders to rise 20% in August.");
    expect(factSentence(record({ type: "quiet_days", params: { weekday: "Tuesday", percent: 15 } }))).toBe("The Council expects Tuesday orders to fall 15% this quarter.");
    expect(factSentence(record({ type: "format_costs", params: { format: "Mass market paperback", percent: 68 } }))).toBe("Mass market paperback copies cost the shop 68% of their list price this quarter, instead of 60%.");
    expect(factSentence(record({ type: "author_fares", params: { cost: 250 } }))).toBe("An author night costs $250 this quarter, instead of $200.");
    expect(factSentence(record({ type: "quiet_quarter", params: {} }))).toBe("The Council expects no change in the shop's trade this quarter.");
    expect(stretchSentence(record(), "Culture Committee")).toBe('The Culture Committee has raised its goal for Culture by 15% this quarter, instead of the usual 5%. Its reason: "THE ARTS PANEL IS PREPARING ITS ANNUAL REVIEW."');
    expect(stretchSentence(record({ stretch: { measure: "happiness", percent: 20 }, drop: 14, reason: undefined }), "Welfare Board")).toBe('Happiness fell 14% against the same quarter a year earlier. The Welfare Board requires it restored: "HAPPINESS FELL 14%. RESTORE IT."');
    expect(stretchSentence(record({ stretch: null, reason: undefined }), "x")).toBe("With two strikes counting, the bosses have held every goal at the usual 5% this quarter.");
  });

  it("have a fact sentence for every candidate drawn", () => {
    for (let seed = 0; seed < 40; seed++) for (const c of drawCandidates(seed, context)) expect(factSentence({ quarter: "2194-Q3", ...c })).toMatch(/\.$/);
  });
});

describe("the save's checks (Frank's validate())", () => {
  it("accept a record, and refuse an unbounded or malformed one", () => {
    expect(isAlmaRecord(record())).toBe(true);
    const { reason: _, ...gentle } = record({ stretch: null });
    expect(isAlmaRecord(gentle)).toBe(true);
    expect(isAlmaRecord({ ...record(), story: "a".repeat(241) })).toBe(false);
    expect(isAlmaRecord({ ...record(), extra: 1 })).toBe(false);
    expect(isAlmaRecord({ ...record(), quarter: "Q3" })).toBe(false);
    expect(isAlmaRecord({ ...record(), params: { genre: { nested: true } } })).toBe(false);
    expect(isAlmaRecord({ ...record(), attempts: 99 })).toBe(false);
    expect(isAlmaRecord({ ...record(), failure: "the model said something" })).toBe(false);
    expect(isAlmaRecord({ ...record(), failure: "text:story:name" })).toBe(true);
    // A drop belongs to a recovery goal: it has a stretch, and the server writes its reason (Frank's review).
    expect(isAlmaRecord(record({ stretch: { measure: "happiness", percent: 20 }, drop: 14, reason: undefined }))).toBe(true);
    expect(isAlmaRecord(record({ drop: 14 }))).toBe(false);
    expect(isAlmaRecord(record({ stretch: null, drop: 14, reason: undefined }))).toBe(false);
  });
  it("accept a log in quarter order, one per quarter, none past the quarter being prepared", () => {
    const q3 = record(), q4 = record({ quarter: "2194-Q4" });
    expect(isAlmaLog([q3, q4], "2194-Q4")).toBe(true);
    expect(isAlmaLog([q4, q3], "2194-Q4")).toBe(false);
    expect(isAlmaLog([q3, q3], "2194-Q4")).toBe(false);
    expect(isAlmaLog([q3, q4], "2194-Q3")).toBe(false);
  });
});

describe("the scripted flavor", () => {
  it("passes every check, for every type, measure and kind of stretch", () => {
    for (const strikes of [0, 2]) for (const recovery of [undefined, ...MEASURE_IDS]) for (let seed = 0; seed < 30; seed++) {
      const ctx: QuarterContext = { quarter: "2194-Q3", previous: [], strikes, ...(recovery ? { recovery: { measure: recovery, drop: 12 } } : {}) };
      for (const c of drawCandidates(seed, ctx)) {
        expect(checkAnswer(JSON.stringify({ candidate: 0, ...scriptedFlavor(c, ctx) }), [c, c, c], ctx, checks), JSON.stringify(c)).toMatchObject({ ok: true });
      }
    }
  });
});

describe("what Alma sees", () => {
  it("is past plans, scores, strikes, its own past choices and the candidates, never text", () => {
    const history: QuarterSummary[] = [{ quarter: "2194-Q2", plan: ["pick:123"], scores: { profit: 80, readers: 70, happiness: 75, culture: 90 }, overall: 70, grade: "C-", strike: false }];
    const input = JSON.parse(almaInput({ ...context, previous: [record({ quarter: "2194-Q2" })] }, history, drawCandidates(1, context)));
    expect(Object.keys(input)).toEqual(["quarter", "strikes", "history", "lastEvents", "candidates"]);
    expect(Object.keys(input.history[0])).toEqual(["quarter", "plan", "scores", "overall", "grade", "strike"]);
    expect(input.lastEvents[0]).toEqual({ quarter: "2194-Q2", type: "genre_surge", params: record().params, stretch: { measure: "culture" } });
    expect(input.candidates).toHaveLength(3);
    expect(Object.keys(input.candidates[0])).toEqual(["candidate", "type", "params", "stretch", "fact", "reasonWanted"]);
    expect(JSON.stringify(input)).not.toContain("book club");
    expect(ALMA_RULES).not.toMatch(/\{\{/);
  });
});

describe("Alma's turn", () => {
  const model = (...answers: (string | Error | "hang")[]): AlmaModel & { calls: number } => {
    const m = {
      name: "sonnet",
      calls: 0,
      async ask(_system: string, _input: string, signal: AbortSignal) {
        const a = answers[m.calls++];
        if (a === "hang") return new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(new AssistantUnavailable("stopped", "timeout"))));
        if (a instanceof Error) throw a;
        return a;
      },
    };
    return m;
  };
  const three = drawCandidates(1, context);
  const good = (i = 1) => JSON.stringify({ candidate: i, story: "Something is stirring on the docks.", ...(wantsReason(three[i] ?? three[0], context) ? { reason: "THE COUNCIL HAS READ A STUDY ABOUT FOOT TRAFFIC." } : {}), bossLine: "WE HAVE NOTED IT." });
  const opts = (m: AlmaModel | null, timeoutMs?: number) => ({ seed: 1, model: m, ...checks, ...(timeoutMs ? { timeoutMs } : {}) });

  it("keeps a valid answer as Alma's, with the chosen candidate's type, params and stretch", async () => {
    const r = await chooseEvent(context, [], opts(model(good(1))));
    expect(r).toMatchObject({ source: "alma", attempts: 1, model: "sonnet", type: three[1].type, params: three[1].params, stretch: three[1].stretch, quarter: "2194-Q3" });
    expect(isAlmaRecord(r)).toBe(true);
  });

  it("stores the text it checked: folded once, so a decomposed story isn't longer in the save (Frank's review of #170)", async () => {
    const story = "Café ".repeat(45).trim();
    expect(story.length).toBeGreaterThan(240);
    const r = await chooseEvent(context, [], opts(model(JSON.stringify({ ...JSON.parse(good(1)), story }))));
    expect(r.source).toBe("alma");
    expect(r.story).toBe(story.normalize("NFKC"));
    expect(isAlmaRecord(r)).toBe(true);
  });

  it("asks once more after an invalid answer, then scripts the first candidate", async () => {
    expect(await chooseEvent(context, [], opts(model("not json", good(2))))).toMatchObject({ source: "alma", attempts: 2, type: three[2].type });
    const never = model(good(5), "not json");
    const r = await chooseEvent(context, [], opts(never));
    expect(r).toMatchObject({ source: "scripted", attempts: 2, failure: "not_json", type: three[0].type, params: three[0].params });
    expect(never.calls).toBe(2);
    expect(isAlmaRecord(r)).toBe(true);
  });

  it("scripts at once, with no retry, when the model fails or runs out of time", async () => {
    const failing = model(new AssistantUnavailable("signed out", "signed_out"), good());
    expect(await chooseEvent(context, [], opts(failing))).toMatchObject({ source: "scripted", attempts: 1, failure: "unavailable:signed_out" });
    expect(failing.calls).toBe(1);
    const slow = model("hang", good());
    expect(await chooseEvent(context, [], opts(slow, 20))).toMatchObject({ source: "scripted", attempts: 1, failure: "timeout" });
    expect(slow.calls).toBe(1);
  });

  it("scripts without asking when there's no model, as in every test run", async () => {
    expect(almaModel()).toBeNull();
    expect(almaModel({ ORBITAL_ALMA_PROVIDER: "scripted" })).toBeNull();
    const r = await chooseEvent(context, [], opts(null));
    expect(r).toMatchObject({ source: "scripted", attempts: 0 });
    expect(r).not.toHaveProperty("failure");
    expect(r).toEqual(await chooseEvent(context, [], opts(null)));
  });

  it("keeps a recovery's drop, and has no reason or stretch with two strikes counting", async () => {
    const recovering = await chooseEvent({ ...context, recovery: { measure: "happiness", drop: 14 } }, [], opts(null));
    expect(recovering).toMatchObject({ stretch: { measure: "happiness", percent: 20 }, drop: 14 });
    expect(recovering).not.toHaveProperty("reason");
    const gentle = await chooseEvent({ ...context, strikes: 2, recovery: { measure: "happiness", drop: 14 } }, [], opts(null));
    expect(gentle.stretch).toBeNull();
    expect(gentle).not.toHaveProperty("drop");
    expect(gentle).not.toHaveProperty("reason");
  });
});
