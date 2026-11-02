import { Group, Quaternion, Vector3, type Bone, type Object3D } from "three";
import { describe, expect, it } from "vitest";

import {
  closeGrip,
  FINGERS_SIDE,
  fitGrip,
  gripFrame,
  gripRotation,
  intoPhone,
  phoneSize,
  THUMB,
  tipMiss,
  type Hand,
  type PhoneSize,
} from "./grip";
import { robotSkeleton } from "./skeleton.test-helper";

// The premise the phone scene rests on (David): the robot's fingers and thumb really hold the phone, wrapped
// round its sides. Its own skeleton, its left hand placed by the grip, closed on phones of several widths.

const HEIGHT = 1.75;
const DIGITS = ["Index", "Middle", "Ring", "Pinky", "Thumb"];

function setup(screen: PhoneSize) {
  const { root, bone } = robotSkeleton(HEIGHT);
  const H = "mixamorigLeftHand";
  const digits = DIGITS.map((f) => [1, 2, 3, 4].map((n) => bone(`${H}${f}${n}`)));
  const hand: Hand = {
    hand: bone(H),
    digits,
    rest: digits.map((j) => j.map((b) => b.quaternion.clone())),
  };
  // The phone held up in front of the robot, turned a little, as the scene might hold it.
  const phone = new Group();
  phone.position.set(0.1, 1.2, 0.5);
  phone.rotation.set(0.1, -0.2, 0.05);
  root.add(phone);
  root.updateMatrixWorld(true);
  // The hand grips in the phone's own frame upright, or turned a quarter turn on a turned phone.
  const frame = new Group();
  const size = gripFrame(phone, screen, frame);
  // The hand turned to the grip and put where the grip wants its wrist (the arm's reach is solved elsewhere).
  setWorld(hand.hand, null, gripRotation(frame));
  setWorld(hand.hand, fitGrip(hand, frame, size), null);
  closeGrip(hand, frame, size, 1);
  return { hand, phone: frame, size };
}

/** Sets a bone's world position and/or rotation, through its parent. */
function setWorld(o: Object3D, at: Vector3 | null, turn: Quaternion | null) {
  const parent = o.parent!;
  parent.updateMatrixWorld(true);
  if (turn) o.quaternion.copy(parent.getWorldQuaternion(new Quaternion()).invert().multiply(turn));
  if (at) o.position.copy(parent.worldToLocal(at.clone()));
  o.updateMatrixWorld(true);
}

const local = (phone: Object3D, b: Bone) => phone.worldToLocal(b.getWorldPosition(new Vector3()));

// Phones from a Galaxy Fold's cover screen to a Pro Max, upright and turned: their CSS widths and heights.
describe.each([
  [280, 653],
  [320, 568],
  [375, 667],
  [390, 844],
  [412, 915],
  [430, 932],
  [659, 393],
  [844, 390],
  [932, 430],
])("a phone %i by %i CSS px", (px, tallPx) => {
  // In the grip's frame: on a turned phone its sides are the phone's top and bottom edges.
  const { hand, phone, size } = setup(phoneSize(px, tallPx));
  const wide = size.wide;

  it("has each fingertip round or clamped on the fingers' side, and the thumb's on the other", () => {
    hand.digits.forEach((joints, d) => {
      const tip = local(phone, joints[3]!);
      const miss = tipMiss(d, tip, size);
      expect(miss, `${DIGITS[d]} tip at ${tip.toArray().map((n) => n.toFixed(3))}`).toBeLessThan(
        0.012,
      );
    });
  });

  it("goes round the phone with every digit, never through it", () => {
    hand.digits.forEach((joints, d) =>
      expect(intoPhone(joints, phone, size), `${DIGITS[d]} into the phone`).toBeLessThan(1e-4),
    );
  });

  it("reaches past the side with every digit, and puts no joint inside the phone", () => {
    hand.digits.forEach((joints, d) => {
      const side = d === THUMB ? -FINGERS_SIDE : FINGERS_SIDE;
      const xs = joints.map((j) => local(phone, j));
      expect(
        Math.max(...xs.map((p) => side * p.x)),
        `${DIGITS[d]} passes its side`,
      ).toBeGreaterThan(wide / 2);
      for (const p of xs) {
        const inside =
          Math.abs(p.x) < wide / 2 - 0.002 &&
          Math.abs(p.y) < size.tall / 2 &&
          Math.abs(p.z) < size.deep / 2;
        expect(inside, `${DIGITS[d]} joint at ${p.toArray().map((n) => n.toFixed(3))}`).toBe(false);
      }
    });
  });
});
