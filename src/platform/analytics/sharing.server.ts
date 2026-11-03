import { serverAnalytics } from "./analytics.server";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_BODY_BYTES = 256;
const READ_DEADLINE_MS = 2000;
const MAX_PER_MINUTE = 30;
let recent: number[] = [];

type Answer = { status: number; body: { on: boolean } | { error: string } };

/**
 * The player's "Share play data" choice, applied to the server's analytics too,
 * so turning sharing off in the browser stops all play data, not just the
 * browser's (Audit's finding on #9; the privacy page promises it).
 *
 * Only a page served by this same local server may change it: the request's
 * Origin must be present, a loopback host, and the server's own origin. A page
 * on any other site, including one that rebinds its DNS to 127.0.0.1, sends
 * its own Origin and is refused.
 */
export async function setSharingFromRequest(
  request: Request,
  apply = (on: boolean) => serverAnalytics().setSharing(on),
): Promise<Answer> {
  if (request.method !== "POST") return { status: 405, body: { error: "POST only" } };
  const origin = request.headers.get("origin");
  let host: string;
  try {
    host = new URL(origin ?? "").hostname;
  } catch {
    return { status: 403, body: { error: "same-origin requests only" } };
  }
  if (!LOOPBACK.has(host) || origin !== new URL(request.url).origin)
    return { status: 403, body: { error: "same-origin requests only" } };
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json"))
    return { status: 415, body: { error: "JSON only" } };
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return { status: 413, body: { error: "too large" } };
  // Admission before the body is read: a flood can't tie the server up reading bodies.
  const now = Date.now();
  recent = recent.filter((t) => now - t < 60_000);
  if (recent.length >= MAX_PER_MINUTE) return { status: 429, body: { error: "too many requests" } };
  recent.push(now);
  const text = await readCapped(request, MAX_BODY_BYTES, READ_DEADLINE_MS);
  if (text === "timeout") return { status: 408, body: { error: "too slow" } };
  if (text === null) return { status: 413, body: { error: "too large" } };
  let on: unknown;
  try {
    const parsed = JSON.parse(text);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).join() !== "on"
    )
      throw 0;
    on = parsed.on;
  } catch {
    on = undefined;
  }
  if (typeof on !== "boolean")
    return { status: 400, body: { error: 'expected {"on": true|false}' } };
  apply(on);
  return { status: 200, body: { on } };
}

/** For tests: forget recent requests. */
export function resetAdmission() {
  recent = [];
}

/** The body as text; null once it passes the cap, "timeout" past the deadline. Never buffers more than the cap. */
async function readCapped(
  request: Request,
  cap: number,
  deadlineMs: number,
): Promise<string | null | "timeout"> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">(
    (resolve) => (timer = setTimeout(() => resolve("timeout"), deadlineMs)),
  );
  for (;;) {
    const next = await Promise.race([reader.read(), deadline]);
    if (next === "timeout") {
      void reader.cancel();
      return "timeout";
    }
    const { done, value } = next;
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      clearTimeout(timer);
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  clearTimeout(timer);
  return new TextDecoder().decode(Buffer.concat(chunks));
}
