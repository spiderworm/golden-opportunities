// @vitest-environment node
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { DOOR, inPicture, PHOTO, ROOM } from "./room";

// The 3D room puts each of the picture's corners back where they were measured: from the picture's camera, the
// box is the picture.
describe("the bosses' room in 3D", () => {
  const at = (x: number, y: number, z: number) =>
    inPicture(new Vector3(x, y, z))!.map((n) => Math.round(n));

  it("puts the back wall's corners where they are in the picture", () => {
    expect(at(ROOM.left, 0, ROOM.back)).toEqual([350, 856]);
    expect(at(ROOM.right, 0, ROOM.back)).toEqual([2050, 856]);
    expect(at(ROOM.left, ROOM.ceiling, ROOM.back)).toEqual([350, 280]);
    expect(at(ROOM.right, ROOM.ceiling, ROOM.back)).toEqual([2050, 280]);
  });

  it("is a room's size: about 7.7 m wide, 2.6 m high and 9.4 m deep, its rack 2 m tall", () => {
    expect(ROOM.right - ROOM.left).toBeCloseTo(7.73, 1);
    expect(ROOM.ceiling).toBeCloseTo(2.62, 1);
    expect(-ROOM.back).toBeCloseTo(9.45, 1);
    // A rack from the floor to 440 px above it, on the back wall.
    expect(856 - inPicture(new Vector3(0, 2, ROOM.back))![1]).toBeCloseTo(440, 0);
  });

  it("shows nothing behind the camera, and the floor runs to where the picture's bottom edge is", () => {
    expect(inPicture(new Vector3(0, 1, 1))).toBeNull();
    // The picture's bottom edge meets the floor about 4.2 m out: nearer floor is that edge, stretched.
    const near = (PHOTO.focal * PHOTO.eye) / (PHOTO.height - PHOTO.centre[1]);
    expect(at(0, 0, -near)[1]).toBe(PHOTO.height);
    expect(near).toBeCloseTo(4.24, 1);
  });

  it("has its door where the picture shows it: about 2.1 m wide and 2.2 m high, in the back wall's middle", () => {
    expect(at(DOOR.left, 0, ROOM.back)).toEqual([971, 856]);
    expect(at(DOOR.right, DOOR.top, ROOM.back)).toEqual([1430, 381]);
    expect(DOOR.right - DOOR.left).toBeCloseTo(2.09, 2);
    expect(DOOR.top).toBeCloseTo(2.16, 2);
    expect(DOOR.split).toBeGreaterThan(DOOR.left);
    expect(DOOR.split).toBeLessThan(DOOR.right);
  });
});
