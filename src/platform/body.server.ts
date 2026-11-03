// Reading a request's body at the door, for every action a public visitor can reach (Audit and Goldy, 3 Nov 2026:
// the entry and reports actions read formData() with no cap or deadline). The declared length is checked first, then
// the body is read with a byte cap and a deadline, so no request can make the server buffer more than the cap or
// wait on it for long. /api/query, Dewey and the plan form read theirs the same way, each with its own errors.

/** Why a body was refused: its status, and a short line to answer with. */
export class BodyRefused extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** How long a body has to arrive by default: a form or a small JSON change, from a browser on any connection. */
export const BODY_DEADLINE_MS = 3_000;

/**
 * The body as UTF-8 text, read with a byte cap and a deadline: 413 past the cap (declared or as read), 408 past the
 * deadline, 400 if it isn't UTF-8. An absent body is "". Never buffers more than the cap. Throws BodyRefused.
 */
export async function readCappedText(
  request: Request,
  maxBytes: number,
  deadlineMs = BODY_DEADLINE_MS,
): Promise<string> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))
    throw new BodyRefused(413, "Too large.");
  if (!request.body) return "";
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new BodyRefused(413, "Too large.");
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
        throw new BodyRefused(400, "Not UTF-8.");
      }
    };
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BodyRefused(408, "Too slow.")), deadlineMs);
    });
    return await Promise.race([read(), deadline]);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * A form's fields, as a page's <form> or a fetcher posts them (form-encoded), read through readCappedText: 415 for
 * any other type, as multipart would let a body carry files. Throws BodyRefused.
 */
export async function readCappedForm(
  request: Request,
  maxBytes: number,
  deadlineMs = BODY_DEADLINE_MS,
): Promise<URLSearchParams> {
  const type = request.headers.get("content-type")?.split(";")[0]!.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") throw new BodyRefused(415, "Send the form.");
  return new URLSearchParams(await readCappedText(request, maxBytes, deadlineMs));
}
