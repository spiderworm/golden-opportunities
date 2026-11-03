import { Vector3 } from "three";

import { clear, routePoints } from "./robot-paths";
import { KEEPER, SPOTS } from "./navigation";

// Dewey in the shop (David, 3 Nov: "can we get Dewey floating around, contributing, doing things like the other
// robots, interacting with customers and the guy sitting at the desk?"): what he does next, and where, kept apart
// from how he's drawn (Dewey.tsx), so it can be checked without a scene. He's the shop's reference terminal: he looks
// things up along the shelves, shows a browsing shopper something, has a word with the keeper, and rests by the
// counter. Calmly: slow, with long holds, never the same errand twice running.

/** What he's doing at the end of a trip: shown on his screen and in how he holds himself. */
export type DeweyErrand = "lookup" | "show" | "keeper" | "rest";

/** He crosses the room at this height: over the shoppers' heads (1.7 m), under the little robots' (3.1 m and up). */
export const DEWEY_CRUISE = 2.6;
/** Where he hovers to talk: about a shopper's head height, a little above, so he reads as floating. */
export const DEWEY_TALK_HEIGHT = 1.85;
/** Where he rests: off the counter's end, near the keeper, out of the shoppers' way. */
export const DEWEY_REST = new Vector3(4.6, 2.3, 1.7);
/** How far from someone he hovers to talk to them (meters, across the floor). */
const NEAR = 0.85;
/** How long he holds each errand (seconds): unhurried. */
export const HOLD: Record<DeweyErrand, [min: number, max: number]> = {
  lookup: [4, 7],
  show: [4, 6],
  keeper: [3.5, 5],
  rest: [7, 12],
};
/** How often he picks each errand. */
const WEIGHT: Record<DeweyErrand, number> = { lookup: 3, show: 2, keeper: 2, rest: 2 };

/** One stretch of his trip: fly to `to`; the last holds there, facing `face` (radians about Y, 0 = +z), doing `errand`. */
export interface DeweyLeg {
  to: Vector3;
  hold?: number;
  face?: number;
  errand?: DeweyErrand;
  /** For `show`: which shopper (by walker index) he's showing something to. */
  shopper?: number;
}

/** Which way to face to look from `from` at `at`, about Y. */
export const facing = (from: Vector3, at: { x: number; z: number }) =>
  Math.atan2(at.x - from.x, at.z - from.z);

/** The next errand, by weight, never the one he just did; `random` in [0, 1). */
export function nextErrand(last: DeweyErrand | null, random: () => number): DeweyErrand {
  const choices = (Object.keys(WEIGHT) as DeweyErrand[]).filter((e) => e !== last);
  const total = choices.reduce((sum, e) => sum + WEIGHT[e], 0);
  let pick = random() * total;
  for (const e of choices) if ((pick -= WEIGHT[e]) < 0) return e;
  return choices[choices.length - 1]!;
}

/**
 * Where he goes for an errand, and which way he faces there. `shoppers` are the browsing shoppers' places (null where
 * nobody's browsing); with none, a `show` becomes a `lookup`.
 */
export function errandPlace(
  errand: DeweyErrand,
  shoppers: readonly ({ x: number; z: number } | null)[],
  random: () => number,
): { at: Vector3; face: number; errand: DeweyErrand; shopper?: number } {
  if (errand === "show") {
    const browsing = shoppers.flatMap((s, i) => (s ? [i] : []));
    if (browsing.length) {
      const i = browsing[Math.floor(random() * browsing.length)]!;
      const s = shoppers[i]!;
      // Beside them, toward the room's middle, so he's never between them and their shelf.
      const away = new Vector3(-s.x, 0, -s.z).normalize().multiplyScalar(NEAR);
      const at = clear(new Vector3(s.x + away.x, DEWEY_TALK_HEIGHT, s.z + away.z));
      return { at, face: facing(at, s), errand, shopper: i };
    }
    errand = "lookup";
  }
  if (errand === "lookup") {
    // In front of a browsing spot's shelf, up where the books are, facing them.
    const [x, z, spotFacing] = SPOTS[Math.floor(random() * SPOTS.length)]!;
    // A spot faces its shelf; he hovers a step out from it, higher, a little to one side.
    const shelfward = new Vector3(Math.sin(spotFacing), 0, Math.cos(spotFacing));
    const side = new Vector3(shelfward.z, 0, -shelfward.x).multiplyScalar(random() - 0.5);
    const at = clear(new Vector3(x + side.x, 2.2 + random() * 0.6, z + side.z));
    return { at, face: spotFacing, errand };
  }
  if (errand === "keeper") {
    // Across the counter from the keeper, who faces +x: in front of them, facing back.
    const [kx, kz] = KEEPER;
    const at = new Vector3(kx + NEAR + 0.35, DEWEY_TALK_HEIGHT, kz);
    return { at, face: facing(at, { x: kx, z: kz }), errand };
  }
  return { at: DEWEY_REST.clone(), face: facing(DEWEY_REST, { x: 0, z: 0 }), errand };
}

/** The trip to an errand: up to cruising height, across, and down to it, holding there. */
export function tripTo(
  from: Vector3,
  place: ReturnType<typeof errandPlace>,
  random: () => number,
): DeweyLeg[] {
  const [up, across, down] = routePoints(from, place.at, DEWEY_CRUISE);
  const [min, max] = HOLD[place.errand];
  return [
    { to: up! },
    { to: across! },
    {
      to: down!,
      hold: min + random() * (max - min),
      face: place.face,
      errand: place.errand,
      shopper: place.shopper,
    },
  ];
}
