// Reads the Decide form at the door, as /api/query and /api/assistant read
// theirs: same origin, a small capped body, a deadline, and nothing but the
// fields the quarter's form sends.
import { FIRST_QUARTER, isQuarterName, type QuarterId } from "~/simulation/quarters";
import { isQ2Plan, planOf } from "~/simulation/plan";
import type { Plan, Q2Plan, Q2LeverId } from "~/simulation/types";

/** Q2's three ISBNs and a move are about 90 bytes (`picks=` with `%2C`s, `&levers=events`); Q1's are fewer. */
export const MAX_PLAN_BODY = 512;
const DEADLINE_MS = 3_000;

export class PlanRefused extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The plan by the fields its form sends: Q1's moves, or a later quarter's picks; for a save that may have moved on since the form loaded. */
export async function readAnyPlan(request: Request, deadlineMs = DEADLINE_MS): Promise<{ form: "moves"; plan: Plan } | ({ form: "picks" } & QuarterPlan)> {
  const form = await readForm(request, deadlineMs);
  return form.has("picks") ? { form: "picks", ...q2PlanFrom(form) } : { form: "moves", plan: planFrom(form) };
}

/** Q1's plan in one field: `levers=repick,events`, or `levers=` to hold course. */
export async function readPlan(request: Request, deadlineMs = DEADLINE_MS): Promise<Plan> {
  return planFrom(await readForm(request, deadlineMs));
}

function planFrom(form: URLSearchParams): Plan {
  const keys = [...form.keys()];
  if (keys.length !== 1 || keys[0] !== "levers") throw new PlanRefused(400, "Send only the chosen moves.");
  const value = form.get("levers")!;
  // Sim's planOf refuses unknown, repeated or more than two levers.
  const plan = planOf(value === "" ? [] : value.split(","));
  if (!plan) throw new PlanRefused(400, "Choose up to two of the three moves.");
  return plan;
}

/** A plan for a quarter after Q1, with the quarter its form was written for. */
export interface QuarterPlan {
  quarter: QuarterId;
  plan: Q2Plan;
}

/**
 * A later quarter's plan in three fields (Frank's encoding): `picks` is always three slots, one a month, each an
 * ISBN or empty for no pick; `levers` is empty, `events` or `sale`; and `quarter` names the quarter the form was
 * written for, so a form left open in another tab can't be filed for the next quarter (Frank and Audit, #212).
 * Holding course is `picks=,,&levers=&quarter=2194-Q2`. Its shape is checked here; whether each ISBN is an edition,
 * no title is picked twice, and the quarter is the save's, is the game's call.
 */
export async function readQ2Plan(request: Request, deadlineMs = DEADLINE_MS): Promise<QuarterPlan> {
  return q2PlanFrom(await readForm(request, deadlineMs));
}

function q2PlanFrom(form: URLSearchParams): QuarterPlan {
  const keys = [...form.keys()].sort();
  if (keys.length !== 3 || keys[0] !== "levers" || keys[1] !== "picks" || keys[2] !== "quarter") throw new PlanRefused(400, "Send only the picks, the move and the quarter.");
  const quarter = form.get("quarter")!;
  if (!isQuarterName(quarter) || quarter === FIRST_QUARTER) throw new PlanRefused(400, "Name a quarter after Q1 2194.");
  const picks = form.get("picks")!.split(",").map((isbn) => isbn || null);
  const lever = form.get("levers")!;
  const plan = { picks, levers: lever === "" ? [] : [lever as Q2LeverId] };
  if (!isQ2Plan(plan)) throw new PlanRefused(400, "Choose a pick or none for each month, and up to one more move.");
  return { quarter, plan };
}

/** The form's fields, once the request has passed the door: same origin, form-encoded, small, and in time. */
async function readForm(request: Request, deadlineMs: number): Promise<URLSearchParams> {
  const url = new URL(request.url);
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== url.origin || (site !== null && site !== "same-origin")) {
    throw new PlanRefused(403, "Same-origin requests only.");
  }
  const type = request.headers.get("content-type")?.split(";")[0]!.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") throw new PlanRefused(415, "Send the plan form.");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_PLAN_BODY)) throw new PlanRefused(413, "Too large.");
  if (!request.body) throw new PlanRefused(400, "Send the plan.");

  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let raw: string;
  try {
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PLAN_BODY) throw new PlanRefused(413, "Too large.");
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new PlanRefused(400, "Not UTF-8.");
      }
    };
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PlanRefused(408, "The plan took too long to arrive.")), deadlineMs);
    });
    raw = await Promise.race([read(), deadline]);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  return new URLSearchParams(raw);
}
