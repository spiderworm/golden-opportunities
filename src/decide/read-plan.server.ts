// Reads the Decide form at the door, as /api/query and /api/assistant read
// theirs: same origin, a small capped body, a deadline, and nothing but the
// one field the form sends.
import type { OptionId } from "~/game-stub/types";

/** `option=A` is 8 bytes; this leaves room for encoding, nothing more. */
export const MAX_PLAN_BODY = 256;
const DEADLINE_MS = 3_000;
const OPTIONS: readonly OptionId[] = ["A", "B", "C", "D"];

export class PlanRefused extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function readPlan(request: Request, deadlineMs = DEADLINE_MS): Promise<OptionId> {
  const url = new URL(request.url);
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== url.origin || (site !== null && site !== "same-origin")) {
    throw new PlanRefused(403, "Same-origin requests only.");
  }
  const type = request.headers.get("content-type")?.split(";")[0]!.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") throw new PlanRefused(415, "Send the plan form.");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_PLAN_BODY)) throw new PlanRefused(413, "Too large.");
  if (!request.body) throw new PlanRefused(400, "Choose one option.");

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

  const form = new URLSearchParams(raw);
  const keys = [...form.keys()];
  if (keys.length !== 1 || keys[0] !== "option") throw new PlanRefused(400, "Send only the chosen option.");
  const option = form.get("option");
  if (!OPTIONS.includes(option as OptionId)) throw new PlanRefused(400, "Choose one of the four options.");
  return option as OptionId;
}
