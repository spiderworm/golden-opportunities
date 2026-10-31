// The studio's apps open in this browser, on this host: each tab says who it
// is on one channel all of them share, and answers the tabs that open after
// it. A browser lets a page see only its own host's tabs, so an app elsewhere
// is never known. Two tabs with one id but different homes are two apps
// claiming one id, a mistake the console is told of.
import type { App } from "../app/app.ts";

export type Peer = { tab: string; id: string; home: string; build?: string };
type Said = Peer & { say: "hello" | "here" | "bye" };
type Channel = Pick<BroadcastChannel, "postMessage" | "close"> & { onmessage: ((e: MessageEvent) => void) | null };

export const STUDIO_CHANNEL = "tellim.apps";

export function createPresence(app: App, o: { channel?: (name: string) => Channel; tab?: string } = {}) {
  const tab = o.tab ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  const me: Peer = { tab, id: app.id, home: app.home, build: app.build };
  const make = o.channel ?? (typeof BroadcastChannel !== "undefined" ? (n: string) => new BroadcastChannel(n) : undefined);
  const channel = make?.(STUDIO_CHANNEL);
  const peers = new Map<string, Peer>();
  const listeners = new Set<() => void>();
  const say = (s: Said["say"]) => channel?.postMessage({ ...me, say: s } satisfies Said);
  const warned = new Set<string>();

  if (channel)
    channel.onmessage = (e) => {
      const m = e.data as Said;
      if (!m || typeof m.tab !== "string" || m.tab === tab) return;
      if (m.say === "bye") peers.delete(m.tab);
      else {
        peers.set(m.tab, { tab: m.tab, id: m.id, home: m.home, build: m.build });
        if (m.say === "hello") say("here");
        if (m.id === app.id && m.home !== app.home && !warned.has(m.home)) {
          warned.add(m.home);
          console.warn(`app id "${app.id}" is used at ${app.home} and at ${m.home}: two apps can't share an id (@tellim/platform src/app/apps.ts)`);
        }
      }
      listeners.forEach((f) => f());
    };
  say("hello");
  const bye = () => say("bye");
  if (typeof addEventListener !== "undefined") addEventListener("pagehide", bye);

  return {
    /** this tab, as the others know it */
    tab,
    /** the studio's other tabs open on this host, this app's and others' */
    peers: () => [...peers.values()],
    /** this app's other tabs */
    mine: () => [...peers.values()].filter((p) => p.id === app.id && p.home === app.home),
    /** called whenever a tab comes or goes; returns the unsubscribe */
    onChange(f: () => void) {
      listeners.add(f);
      return () => void listeners.delete(f);
    },
    dispose() {
      bye();
      if (typeof removeEventListener !== "undefined") removeEventListener("pagehide", bye);
      channel?.close();
    },
  };
}

export type Presence = ReturnType<typeof createPresence>;
