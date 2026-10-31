// Whether the assistant can answer on this machine, asked before the player types (GET /api/assistant).

export type AssistantStatus = { available: true } | { available: false; reason: string; message: string; hint: string };

/**
 * The server's answer, read defensively. If the status can't be read, the panel stays usable: asking reports
 * any problem itself, in the same fixed words.
 */
export async function fetchStatus(fetcher: typeof fetch = fetch): Promise<AssistantStatus> {
  try {
    const res = await fetcher("/api/assistant", { headers: { accept: "application/json" } });
    const body = (await res.json()) as Record<string, unknown>;
    if (body.available === false && typeof body.reason === "string" && typeof body.message === "string" && typeof body.hint === "string") {
      return { available: false, reason: body.reason, message: body.message, hint: body.hint };
    }
  } catch {
    // Unknown: don't block the player.
  }
  return { available: true };
}
