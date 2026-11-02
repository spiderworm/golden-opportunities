// Whether the assistant can answer on this machine, asked before the player types (GET /api/assistant).

/** `short`: the game's backstory in one sentence, for the greeting (docs/design/backstory.md, section 6). */
export type AssistantStatus = ({ available: true } | { available: false; reason: string; message: string; hint: string }) & { short?: string };

/**
 * The server's answer, read defensively. If the status can't be read, the panel stays usable: asking reports
 * any problem itself, in the same fixed words.
 */
export async function fetchStatus(fetcher: typeof fetch = fetch): Promise<AssistantStatus> {
  try {
    const res = await fetcher("/api/assistant", { headers: { accept: "application/json" } });
    const body = (await res.json()) as Record<string, unknown>;
    // Checked on the server; here only bounded, and shown as plain text.
    const short = typeof body.short === "string" && body.short.length <= 140 ? { short: body.short } : {};
    if (body.available === false && typeof body.reason === "string" && typeof body.message === "string" && typeof body.hint === "string") {
      return { available: false, reason: body.reason, message: body.message, hint: body.hint, ...short };
    }
    return { available: true, ...short };
  } catch {
    // Unknown: don't block the player.
  }
  return { available: true };
}
