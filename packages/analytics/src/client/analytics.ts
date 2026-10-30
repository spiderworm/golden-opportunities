// A game's analytics (How We Build, principle 3): track(event, props) records
// what happened, never content, in a log on the device, and, while the player
// leaves sharing on, sends it to the studio's endpoint (../ingest) in batches.
// Nothing about the player is sent: an install is a random id made here, with
// no account, advertising id or device id behind it.
//
// Sending is best-effort. Events wait in an outbox (kept on the device) until
// the endpoint says it has them, so play offline is sent later; a batch sent as
// the app is put away may arrive without the answer getting back, so each
// event carries its install's running number (n) and the report drops repeats.

import { deviceProps } from "../device/device.ts";
import { automation, testLab } from "../environment/environment.ts";

export type Props = Record<string, string | number | boolean>;
/** t: when (ms), s: this launch, n: the install's running number (none in logs from before it), e: event, p: props */
export type Event = { t: number; s: string; n?: number; e: string; p: Props };
/** an event as it's sent (and as ingest keeps it) */
export type Sent = Event & { n: number };

export type Options = {
  /** the game's name at the endpoint, e.g. "waddleberg" */
  game: string;
  /** the ingest endpoint (a Lambda function URL); none: kept on the device only */
  endpoint?: string;
  /** prefix for this game's storage keys, e.g. "cubeberg" */
  key: string;
  /** the build the events came from */
  build: string;
  /** the release it is, e.g. "0.1.12-alpha" (the game's versionName); sent with each batch, so reports needn't guess it */
  version?: string;
  /** e.g. "android" or "web" */
  platform: string;
  /** most events kept in the on-device log (3000) */
  keep?: number;
  /** what an event looks like under the debugger, or nothing */
  log?: (event: string, props: Props) => void;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  /** true: kept; false: try again later; "refused": the endpoint will never take it (malformed), so it's dropped */
  send?: (url: string, body: string, leaving: boolean) => Promise<boolean | "refused">;
  /** the game's WebGL context, for the device event's GPU (its own; none is made here) */
  gl?: () => Pick<WebGLRenderingContext, "getExtension" | "getParameter"> | null | undefined;
  /** what the device is, for the tests (default: the browser's) */
  env?: { userAgent: string; webdriver: boolean; search: string; session?: Pick<Storage, "getItem" | "setItem"> };
};

const OUTBOX_MAX = 5000; // a long time offline: the oldest go first
const BATCH_BYTES = 12_000; // a request's events, under the endpoint's 16 KB (its edge refuses more)
const WRITE_MS = 3000;
const SEND_MS = 60_000;
const DEVICE_MS = 1500;

// The endpoint's function answers only CloudFront, which signs each request
// to it (an origin access control), and a POST's signature needs the body's
// SHA-256 from the sender (../ingest/stack.ts).
const post = async (url: string, body: string, leaving: boolean) => {
  if (!crypto?.subtle) return false; // not a secure context: kept for later
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const res = await fetch(url, { method: "POST", body, keepalive: leaving, headers: { "content-type": "text/plain", "x-amz-content-sha256": hex } });
  return res.ok ? true : res.status === 400 || res.status === 413 ? "refused" : false;
};

// the oldest events that fit in a request (at least one)
export function nextBatch<T>(queue: T[], maxBytes = BATCH_BYTES): T[] {
  let bytes = 0;
  let i = 0;
  while (i < queue.length && (i === 0 || bytes + JSON.stringify(queue[i]).length + 1 <= maxBytes)) bytes += JSON.stringify(queue[i++]).length + 1;
  return queue.slice(0, i);
}

export function createAnalytics(options: Options) {
  // Every game gets these without asking (shared, David 27 Oct 2026): Play's
  // test robots send as platform "testlab"; automated runs send nothing, in
  // a log of their own; and a "device" event goes once per startup.
  const env = options.env ?? {
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    webdriver: typeof navigator !== "undefined" && navigator.webdriver === true,
    search: typeof location === "undefined" ? "" : location.search,
    session: (() => { try { return globalThis.sessionStorage; } catch { return undefined; } })(),
  };
  const automated = automation(env.webdriver, env.search, options.key, env.session);
  const o: Options = {
    ...options,
    key: automated ? `${options.key}.test` : options.key,
    endpoint: automated ? undefined : options.endpoint,
    platform: testLab(env.userAgent) ? "testlab" : options.platform,
  };
  const store = o.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const send = o.send ?? post;
  const keep = o.keep ?? 3000;
  const K = { log: `${o.key}.events`, outbox: `${o.key}.outbox`, install: `${o.key}.install`, n: `${o.key}.eventNo`, off: `${o.key}.sharingOff`, early: `${o.key}.earlySent` };
  const read = <T>(k: string, fallback: T): T => {
    try {
      const v = store?.getItem(k);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  };
  const write = (k: string, v: unknown) => {
    try {
      if (v === null) store?.removeItem(k);
      else store?.setItem(k, JSON.stringify(v));
    } catch {
      // storage full or blocked: keep going in memory
    }
  };

  const session = Math.random().toString(36).slice(2, 8);
  let install = read<string>(K.install, "");
  if (!install) write(K.install, (install = randomId()));
  let n = read<number>(K.n, 0);
  let sharing = !read<boolean>(K.off, false);
  let log: Event[] | null = null;
  let outbox: Sent[] | null = null;
  const loaded = () => (log ??= read<Event[]>(K.log, []));
  const queued = () => (outbox ??= read<Sent[]>(K.outbox, []));

  // Written to storage a moment later, not as each event comes: writing the
  // whole log on every event cost Waddleberg a dropped frame on David's Pixel
  // (22 Oct 2026). Events that come together are written once.
  // The log from before events were sent (Waddleberg's, before 22 Oct 2026)
  // goes too, once, ahead of everything else (David, 26 Oct: the closed
  // test's players are family and friends). Those events have no running
  // number, so they get -k…-1, in order; any the endpoint would refuse stay
  // behind, so they can't hold the outbox up.
  if (sharing && o.endpoint && !read<boolean>(K.early, false)) {
    const early = loaded().filter((e) => e.n === undefined && acceptable(e));
    if (early.length) outbox = [...early.map((e, i) => ({ ...e, n: i - early.length })), ...queued()];
    write(K.early, true);
    if (early.length) write(K.outbox, outbox);
  }

  let pending: ReturnType<typeof setTimeout> | 0 = 0;
  const later = () => {
    if (!pending) pending = setTimeout(save, WRITE_MS);
  };
  function save() {
    clearTimeout(pending);
    pending = 0;
    write(K.log, loaded());
    write(K.outbox, queued());
    write(K.n, n);
  }

  function track(event: string, props: Record<string, unknown> = {}) {
    if (!NAME.test(event)) {
      // the endpoint takes lower_snake_case names only: a game bug, not the player's
      console.warn(`[analytics] "${event}" isn't a valid event name (lower_snake_case, at most 40 characters); not recorded`);
      return;
    }
    const ev: Sent = { t: Date.now(), s: session, n: ++n, e: event, p: flat(props) };
    const l = loaded();
    l.push(ev);
    if (l.length > keep) l.splice(0, l.length - keep);
    if (sharing && o.endpoint) {
      const q = queued();
      q.push(ev);
      if (q.length > OUTBOX_MAX) q.splice(0, q.length - OUTBOX_MAX);
    }
    later();
    o.log?.(event, ev.p);
  }

  let sending = false;
  async function flush(leaving = false): Promise<void> {
    if (!o.endpoint || !sharing || sending) return;
    const batch = nextBatch(queued());
    if (!batch.length) return;
    sending = true;
    let batchWent = false;
    const body = JSON.stringify({ v: 1, game: o.game, install, platform: o.platform, build: o.build, ...(o.version ? { version: o.version } : {}), tz: new Date().getTimezoneOffset(), events: batch });
    try {
      const answer = await send(o.endpoint, body, leaving);
      if (answer === "refused") console.warn(`[analytics] the endpoint refused a batch of ${batch.length} events as malformed; dropped so later events still go`);
      if ((batchWent = answer !== false)) {
        const sent = new Set(batch.map((e) => e.n));
        outbox = queued().filter((e) => !sent.has(e.n));
        save();
      }
    } catch {
      // offline or unreachable: they go next time
    } finally {
      sending = false;
    }
    if (!leaving && queued().length > 0 && !sending && batchWent) void flush();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        track("app_hidden");
        save();
        void flush(true);
      } else track("app_shown");
    });
    addEventListener("pagehide", () => pending && save());
    addEventListener("online", () => void flush());
    setInterval(() => document.visibilityState === "visible" && void flush(), SEND_MS);
  }

  // what the device is, once per startup (after the game has made its GL context)
  if (typeof setTimeout !== "undefined" && (typeof navigator !== "undefined" || options.env))
    setTimeout(() => {
      const display = typeof screen === "undefined" ? { width: 0, height: 0, ratio: 0 } : { width: screen.width, height: screen.height, ratio: devicePixelRatio };
      const nav = options.env || typeof navigator === "undefined" ? { userAgent: env.userAgent } : navigator;
      const none = { getExtension: () => null, getParameter: () => null };
      let gl: Pick<WebGLRenderingContext, "getExtension" | "getParameter"> = none;
      try { gl = o.gl?.() ?? none; } catch { /* no GPU name, then */ }
      // never silently nothing: if working it out fails, say so, with the browser's version
      void deviceProps(gl, nav, display).then(
        (p) => track("device", p),
        (e) => track("device", { failed: String(e?.name ?? e).slice(0, 40), chrome: Number(env.userAgent.match(/Chrome\/(\d+)/)?.[1]) || 0 }),
      );
    }, DEVICE_MS);

  return {
    track,
    flush,
    /** the on-device log, oldest first */
    events: (): Event[] => loaded().slice(),
    clear() {
      log = [];
      write(K.log, null);
    },
    /** whether play data goes to the studio (on unless the player turned it off) */
    sharing: () => sharing,
    setSharing(on: boolean) {
      if (on === sharing) return;
      write(K.off, on ? null : true);
      if (on) {
        sharing = true;
        return track("sharing_set", { on });
      }
      // turned off: what was waiting is dropped, and only the turning off is
      // sent (so the report knows why the install went quiet)
      outbox = [];
      track("sharing_set", { on });
      void flush(); // takes its batch before sharing goes off below
      sharing = false;
      save();
    },
    install: () => install,
  };
}

export type Analytics = ReturnType<typeof createAnalytics>;

// what the endpoint takes (../ingest/handler.cjs)
const NAME = /^[a-z][a-z0-9_]{0,39}$/;

/** props as the endpoint takes them: at most 40, keys up to 40 characters, values a number, boolean or string up to 200 characters (anything else, such as an array, as its JSON) */
export function flat(p: Record<string, unknown>): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(p ?? {}).slice(0, 40)) {
    if (v === undefined || v === null) continue;
    const key = k.slice(0, 40);
    if (typeof v === "number") out[key] = Number.isFinite(v) ? v : String(v);
    else if (typeof v === "boolean") out[key] = v;
    else out[key] = (typeof v === "string" ? v : JSON.stringify(v)).slice(0, 200);
  }
  return out;
}
export function acceptable(e: Event): boolean {
  if (!Number.isFinite(e.t) || typeof e.s !== "string" || e.s.length > 16 || !NAME.test(e.e)) return false;
  const p = e.p;
  if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).length > 40) return false;
  return Object.entries(p).every(([k, v]) => k.length <= 40 && (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 200)));
}

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("-");
}
