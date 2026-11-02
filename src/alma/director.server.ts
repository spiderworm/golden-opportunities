// Alma's turn for one quarter (endless.md section 9): ask the model, check its answer, retry once if the answer
// was invalid (not after a timeout or a failure), and otherwise fall back to the scripted event. The model is
// injected, so tests and automated runs never reach the real one (`almaModel` gives none for them).

import { claudeCodeAssistant } from "~/assistant/server/claudeCode.server";
import { AssistantUnavailable } from "~/assistant/server/provider.server";
import { almaInput, ALMA_RULES, PROMPT_VERSION, type QuarterSummary } from "./prompt";
import type { AlmaChoice, AlmaRecord } from "./record";
import { scriptedChoice } from "./scripted";
import { checkAnswer, type ChoiceContext } from "./validate";

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

const failureOf = (error: unknown) => (error instanceof AssistantUnavailable ? `unavailable:${error.kind}` : "unavailable:other");

export async function chooseEvent(
  context: ChoiceContext,
  history: readonly QuarterSummary[],
  { seed, model, timeoutMs = ALMA_TIMEOUT_MS }: { seed: number; model: AlmaModel | null; timeoutMs?: number },
): Promise<AlmaRecord> {
  const record = (choice: AlmaChoice, rest: Pick<AlmaRecord, "source" | "attempts"> & Partial<AlmaRecord>): AlmaRecord => ({
    quarter: context.quarter,
    ...structuredClone(choice),
    promptVersion: PROMPT_VERSION,
    ...(context.recovery ? { drop: context.recovery.drop } : {}),
    ...rest,
  });
  const scripted = (attempts: number, failure?: string) => record(scriptedChoice(seed, context), { source: "scripted", attempts, ...(failure ? { failure } : {}) });
  if (!model) return scripted(0);

  const input = almaInput(context, history);
  let failure = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let text: string;
    try {
      text = await model.ask(ALMA_RULES, attempt === 1 ? input : `${input}\n\nYour last answer was rejected (${failure}). Answer again, within the limits and rules.`, controller.signal);
    } catch (error) {
      return scripted(attempt, controller.signal.aborted ? "timeout" : failureOf(error));
    } finally {
      clearTimeout(timer);
    }
    if (controller.signal.aborted) return scripted(attempt, "timeout");
    const checked = checkAnswer(text, context);
    if (checked.ok) return record(checked.choice, { source: "alma", model: model.name, attempts: attempt });
    failure = checked.failure;
  }
  return scripted(2, failure);
}
