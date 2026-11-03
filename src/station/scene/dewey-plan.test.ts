import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { seeded } from "./bookshop";
import {
  DEWEY_CRUISE,
  DEWEY_REST,
  DEWEY_TALK_HEIGHT,
  errandPlace,
  nextErrand,
  tripTo,
  type DeweyErrand,
} from "./dewey-plan";
import { KEEPER } from "./navigation";
import { intoShelf } from "./robot-paths";
import { SHELF_UNITS } from "./shelves";

describe("Dewey in the shop", () => {
  it("never does the same errand twice running, and does each of them", () => {
    const random = seeded(7);
    let last: DeweyErrand | null = null;
    const seen = new Set<DeweyErrand>();
    for (let i = 0; i < 200; i++) {
      const next = nextErrand(last, random);
      expect(next).not.toBe(last);
      seen.add(next);
      last = next;
    }
    expect([...seen].sort()).toEqual(["keeper", "lookup", "rest", "show"]);
  });

  it("goes beside a browsing shopper to show them something, facing them, at head height", () => {
    const shopper = { x: -6.6, z: 1.0 };
    const place = errandPlace("show", [null, shopper, null], () => 0.5);
    expect(place.errand).toBe("show");
    expect(place.shopper).toBe(1);
    expect(place.at.y).toBe(DEWEY_TALK_HEIGHT);
    // Near them, not on them.
    const apart = Math.hypot(place.at.x - shopper.x, place.at.z - shopper.z);
    expect(apart).toBeGreaterThan(0.5);
    expect(apart).toBeLessThan(1.6);
    // Facing them.
    const toThem = Math.atan2(shopper.x - place.at.x, shopper.z - place.at.z);
    expect(
      Math.abs(Math.atan2(Math.sin(place.face - toThem), Math.cos(place.face - toThem))),
    ).toBeLessThan(1e-9);
  });

  it("looks something up instead when nobody's browsing", () => {
    expect(errandPlace("show", [null, null], () => 0.3).errand).toBe("lookup");
  });

  it("talks to the keeper across the counter, facing them", () => {
    const place = errandPlace("keeper", [], () => 0.5);
    expect(place.at.x).toBeGreaterThan(KEEPER[0]);
    expect(place.at.z).toBeCloseTo(KEEPER[1]);
    expect(place.face).toBeCloseTo(-Math.PI / 2);
  });

  it("works clear of the shelves, wherever his errands take him", () => {
    const random = seeded(3);
    for (let i = 0; i < 300; i++) {
      const errand = (["lookup", "show", "keeper", "rest"] as const)[i % 4]!;
      const place = errandPlace(errand, [{ x: -1.5, z: 1.2 }], random);
      for (const unit of SHELF_UNITS) expect(intoShelf(place.at, unit)).toBeLessThan(0);
    }
  });

  it("crosses the room at his cruising height and holds at the end", () => {
    const legs = tripTo(
      DEWEY_REST.clone(),
      errandPlace("keeper", [], () => 0.5),
      () => 0.5,
    );
    expect(legs.map((l) => l.to.y)).toEqual([DEWEY_CRUISE, DEWEY_CRUISE, DEWEY_TALK_HEIGHT]);
    expect(legs[2]!.hold).toBeGreaterThan(3);
    expect(legs[2]!.errand).toBe("keeper");
    expect(legs[0]!.to).toEqual(new Vector3(DEWEY_REST.x, DEWEY_CRUISE, DEWEY_REST.z));
  });
});
