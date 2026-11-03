import type { Route } from "./+types/api";
import { writeSegments } from "~/game/game.server";
import { getGameSession } from "~/game/session.server";
import { SaveError } from "~/game/store.server";
import { isLocalBrowserRequest } from "~/query/access.server";
import { trackServer } from "~/platform/analytics/analytics.server";
import {
  applySegmentChange,
  filterCount,
  parseSegmentChange,
  type Segment,
  type SegmentChange,
  type SegmentOutcome,
  type SegmentRefusal,
} from "./segments";

const NO_STORE = { "Cache-Control": "no-store" };

/** A request with no save, answered as /api/reports answers one (Audit, #376), not with a 500. */
function noSave(error: unknown): Response {
  if (
    error instanceof SaveError &&
    (error.code === "MISSING_SAVE" || error.code === "INVALID_SAVE")
  )
    return new Response("Start a game first.", { status: 401, headers: NO_STORE });
  throw error;
}

/**
 * GET /api/segments: the player's saved segments, for Investigate's Segment menu once a change elsewhere (another
 * tab) has made its own copy stale. A plain fetch, as /api/reports is (Frank, #352).
 */
export function loader({ request }: Route.LoaderArgs) {
  try {
    const { save } = getGameSession(request);
    return Response.json({ segments: save.segments ?? [] }, { headers: NO_STORE });
  } catch (error) {
    return noSave(error);
  }
}

/** What POST /api/segments answers: the new list, or why not with the list as it is now. */
export type SegmentAnswer =
  | { ok: true; id: string; segments: Segment[] }
  | { ok: false; reason: SegmentRefusal; name?: string; segments: Segment[] }
  | { ok: false; reason: "busy" };

/**
 * POST /api/segments: one change to the player's segments, as JSON (segments.ts's SegmentChange), checked again
 * here with the server's id, written whole. Answers the new list, or why not with the list as it is, so a segment
 * deleted in another tab drops out of the menu (Plot, section 8). Local same-origin POSTs only, as every write.
 */
export async function action({ request }: Route.ActionArgs) {
  const refused = door(request);
  if (refused) return refused;
  let change: SegmentChange | null = null;
  try {
    change = parseSegmentChange(await request.clone().json());
  } catch {
    change = null;
  }
  let outcome: SegmentOutcome = { ok: false, reason: "invalid" };
  let segments: Segment[] = [];
  try {
    writeSegments(request, (save) => {
      segments = save.segments ?? [];
      if (!change) return null;
      outcome = applySegmentChange(segments, change, () => crypto.randomUUID());
      return outcome.ok ? outcome.segments : null;
    });
  } catch (error) {
    if (error instanceof Response && error.status === 409)
      return Response.json({ ok: false, reason: "busy" }, { status: 409, headers: NO_STORE });
    if (error instanceof Response) throw error;
    return noSave(error);
  }
  const done = outcome as SegmentOutcome;
  segmentEvent(change, done);
  return done.ok
    ? Response.json({ ok: true, id: done.id, segments: done.segments }, { headers: NO_STORE })
    : Response.json(
        { ok: false, reason: done.reason, ...(done.name ? { name: done.name } : {}), segments },
        { status: 400, headers: NO_STORE },
      );
}

/**
 * One change's JSON, at most: the rules' largest segment (50 values of 200 characters, and a 60-character name) is
 * about 10.5 KB, a real one under 4 KB (Audit and Frank, #387).
 */
export const MAX_SEGMENT_BODY = 16_384;

/**
 * Who may send a change, checked before any of its body is read, so no client can make the server buffer one
 * (Audit and Frank, #387): a POST, from the local same-origin browser, as JSON, declaring no more than the cap.
 */
function door(request: Request): Response | null {
  if (request.method !== "POST")
    return new Response("Use POST.", { status: 405, headers: { Allow: "POST", ...NO_STORE } });
  if (!isLocalBrowserRequest(request))
    return new Response("Same-origin local requests only.", { status: 403, headers: NO_STORE });
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type))
    return new Response("Send JSON.", { status: 415, headers: NO_STORE });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > MAX_SEGMENT_BODY)
    return new Response("Too large.", { status: 413, headers: NO_STORE });
  return null;
}

/**
 * Counts only, never a name: segment names are the player's own words (Audit, #377). Server side, so a refusal the
 * browser didn't see is still counted, as reports' are.
 */
function segmentEvent(change: SegmentChange | null, outcome: SegmentOutcome) {
  try {
    const intent = change?.intent ?? "other";
    if (!outcome.ok) trackServer("segment_refused", { intent, reason: outcome.reason });
    else if (intent === "delete")
      trackServer("segment_deleted", { segments: outcome.segments.length });
    else {
      const segment = outcome.segments.find((s) => s.id === outcome.id);
      trackServer("segment_saved", {
        intent,
        segments: outcome.segments.length,
        filters: segment ? filterCount(segment.filters) : 0,
      });
    }
  } catch {
    /* A transport failure can't undo a saved segment. */
  }
}
