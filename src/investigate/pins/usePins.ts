import { useCallback, useEffect, useState } from "react";

import type { Track } from "~/platform/analytics/track";
import { addPin, parsePins, parsePinSpec, pinKey, type Pin, type PinSpec } from "./spec";

// TODO(game-state): pins belong in the player's save once Frank's game state
// lands. Until then they're kept in this browser.
export const STORAGE_KEY = "orbital-books:pins:v1";

export interface Pins {
  pins: Pin[];
  /** Pins a chart, table or comparison; returns false when the spec isn't a valid one. Dewey's onPin can be this, bound to "dewey". */
  add: (spec: unknown, pinnedBy: Pin["pinnedBy"]) => boolean;
  remove: (id: string) => void;
  /** Whether the same pin is on the board, whatever its title. */
  has: (spec: PinSpec) => boolean;
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
      const { measure, by } = spec.kind === "comparison" ? spec.comparison : spec.query;
      track("investigate_pin_added", { pinnedBy, kind: spec.kind, measure, dimensions: by.length });
      return true;
    },
    [track],
  );

  const remove = useCallback(
    (id: string) => {
      const pin = pins.find((p) => p.id === id);
      setPins((current) => (current ?? []).filter((p) => p.id !== id));
      track("investigate_pin_removed", pin ? { kind: pin.kind } : {});
    },
    [track, pins],
  );

  // A spec from before months had a year ("03") matches the 2193 pin it became when stored.
  const has = useCallback((spec: PinSpec) => {
    const key = pinKey(parsePinSpec(spec) ?? spec);
    return pins.some((p) => pinKey(p) === key);
  }, [pins]);

  return { pins, add, remove, has };
}
