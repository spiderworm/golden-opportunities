import { useCallback, useEffect, useState } from "react";

import type { Track } from "~/platform/analytics/track";
import type { Query } from "~/query/types";
import { addPin, parsePins, parsePinSpec, pinKey, type Pin, type PinKind, type PinSpec } from "./spec";

// TODO(game-state): pins belong in the player's save once Frank's game state
// lands. Until then they're kept in this browser.
const STORAGE_KEY = "orbital-books:pins:v1";

export interface Pins {
  pins: Pin[];
  /** Pins a chart; returns false when the spec isn't a valid chart. Dewey's onPin can be this, bound to "dewey". */
  add: (spec: unknown, pinnedBy: Pin["pinnedBy"]) => boolean;
  remove: (id: string) => void;
  has: (kind: PinKind, query: Query) => boolean;
}

export function usePins(track: Track): Pins {
  // null until read from storage, so the first render can't overwrite what's stored.
  const [stored, setPins] = useState<Pin[] | null>(null);
  const pins = stored ?? [];

  // Storage is only readable in the browser, so pins appear after hydration.
  useEffect(() => {
    setPins(parsePins(localStorage.getItem(STORAGE_KEY)));
  }, []);

  useEffect(() => {
    if (stored) localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [stored]);

  const add = useCallback(
    (value: unknown, pinnedBy: Pin["pinnedBy"]) => {
      const spec: PinSpec | null = parsePinSpec(value);
      if (!spec) {
        track("investigate_pin_rejected", { pinnedBy });
        return false;
      }
      setPins((current) => addPin(current ?? [], spec, pinnedBy, crypto.randomUUID()));
      track("investigate_pin_added", { pinnedBy, kind: spec.kind, measure: spec.query.measure, dimensions: spec.query.by.length });
      return true;
    },
    [track],
  );

  const remove = useCallback(
    (id: string) => {
      setPins((current) => (current ?? []).filter((p) => p.id !== id));
      track("investigate_pin_removed");
    },
    [track],
  );

  const has = useCallback((kind: PinKind, query: Query) => pins.some((p) => pinKey(p.kind, p.query) === pinKey(kind, query)), [pins]);

  return { pins, add, remove, has };
}
