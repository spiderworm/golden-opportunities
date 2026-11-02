// Alma's turn for one quarter (endless.md section 9): draw three candidates, ask the model to pick one and write
// its flavor, check the answer, retry once if it was invalid (not after a timeout or a failure), and otherwise
// take the first candidate with scripted flavor. The model is injected, so tests and automated runs never reach
// the real one (`almaModel` gives none for them).

import { claudeCodeAssistant } from "~/assistant/server/claudeCode.server";
import { AssistantUnavailable } from "~/assistant/server/provider.server";
import { drawCandidates, recoveryOf, type Candidate, type QuarterContext } from "./candidates";
import { almaInput, ALMA_RULES, PROMPT_VERSION, type QuarterSummary } from "./prompt";
import { FAILURES, type AlmaRecord } from "./record";
import { scriptedFlavor } from "./scripted";
import { checkAnswer, type Flavor } from "./validate";

export interface AlmaModel {
  name: string;
  /** The model's whole answer as text. Rejects when it can't answer, or when `signal` aborts. */
  ask(system: string, input: string, signal: AbortSignal): Promise<string>;
}

export const ALMA_TIMEOUT_MS = 30_000;

/** The real model: headless Claude Code with no tools at all, locked like Dewey's (claudeCode.server.ts). */
export function claudeCodeAlma(model = process.env.ORBITAL_ALMA_MODEL || "sonnet", timeoutMs = ALMA_TIMEOUT_MS): AlmaModel {
  const provider = claudeCodeAssistant({ server: null, model, timeoutMs });
  return {
    name: model.slice(0, 60),
    async ask(system, input, signal) {
      let text = "";
      for await (const event of provider.ask({ system, message: input }, signal)) if (event.type === "text") text += event.text;
      if (signal.aborted) throw new AssistantUnavailable("Alma was stopped.", "timeout");
      return text;
    },
  };
}

/** The model to ask, or null to always script: `ORBITAL_ALMA_PROVIDER=scripted`, and every test run. */
export function almaModel(env: NodeJS.ProcessEnv = process.env): AlmaModel | null {
  if (env.ORBITAL_ALMA_PROVIDER === "scripted" || env.VITEST || env.NODE_ENV === "test") return null;
  return claudeCodeAlma();
}

/** A failed call's code, always one of FAILURES: a kind added to the provider later reads as "other" until it's listed. */
const failureOf = (error: unknown) => {
  const code = error instanceof AssistantUnavailable ? `unavailable:${error.kind}` : "unavailable:other";
  return FAILURES.includes(code) ? code : "unavailable:other";
};

/**
 * Alma's turn for a quarter: the server's three candidates, Alma's pick and flavor if they pass, otherwise the
 * first candidate with scripted flavor. `titles` are the catalog's titles, none of which Alma's text may name.
 * Nothing is read from the player's home folder to check for names (David, 2 Nov): the prompt forbids naming a
 * real person, and the checks use only what the game itself holds.
 */
export async function chooseEvent(
  context: QuarterContext,
  history: readonly QuarterSummary[],
  { seed, model, titles, timeoutMs = ALMA_TIMEOUT_MS }: { seed: number; model: AlmaModel | null; titles: readonly string[]; timeoutMs?: number },
): Promise<AlmaRecord> {
  const candidates = drawCandidates(seed, context);
  const recovery = recoveryOf(context);
  const record = (candidate: Candidate, flavor: Flavor, rest: Pick<AlmaRecord, "source" | "attempts"> & Partial<AlmaRecord>): AlmaRecord => ({
    quarter: context.quarter,
    type: candidate.type,
    params: { ...candidate.params },
    stretch: candidate.stretch && { ...candidate.stretch },
    ...(recovery && candidate.stretch ? { drop: recovery.drop } : {}),
    ...flavor,
    promptVersion: PROMPT_VERSION,
    ...rest,
  });
  const scripted = (attempts: number, failure?: string) => record(candidates[0], scriptedFlavor(candidates[0], context), { source: "scripted", attempts, ...(failure ? { failure } : {}) });
  if (!model) return scripted(0);

  const input = almaInput(context, history, candidates);
  let failure = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let text: string;
    try {
      text = await model.ask(ALMA_RULES, attempt === 1 ? input : `${input}\n\nYour last answer was rejected (${failure}). Answer again, keeping every rule.`, controller.signal);
    } catch (error) {
      return scripted(attempt, controller.signal.aborted ? "timeout" : failureOf(error));
    } finally {
      clearTimeout(timer);
    }
    if (controller.signal.aborted) return scripted(attempt, "timeout");
    const checked = checkAnswer(text, candidates, context, { titles });
    if (checked.ok) return record(candidates[checked.index], checked.flavor, { source: "alma", model: model.name, attempts: attempt });
    failure = checked.failure;
  }
  return scripted(2, failure);
}
