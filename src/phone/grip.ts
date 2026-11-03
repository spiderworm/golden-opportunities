import { Matrix4, Quaternion, Vector3, type Bone, type Object3D } from "three";

// How the robot's left hand holds the phone, solved in the phone's own frame
// (David: the fingers and thumb must actually wrap round the phone's sides).
// The phone is a box, wide by tall by deep, centred on its origin; its face
// toward the robot is at z = -deep / 2. The palm lies flat against that face,
// low on the phone, its fingers pointing to the phone's right (+x, the
// robot's own left; David, 2 Nov: fingers on that side, the thumb on the
// other). The wrist is placed so the knuckles sit just inside the right side;
// each finger then bends (only about its curl axis, within limits) so its tip
// hooks round the right edge onto the phone's back; the thumb swings across
// the palm and does the same round the left edge. Kept apart from the scene so
// it can be tested on the robot's own skeleton (grip.test.ts).

export interface Hand {
  hand: Bone;
  /** Each digit's three joints and its tip (index, middle, ring, pinky, then the thumb). */
  digits: Bone[][];
  /** Each digit's joints at rest, to solve from. */
  rest: Quaternion[][];
}

export interface PhoneSize {
  wide: number;
  tall: number;
  deep: number;
}

/** A phone's thickness for its width (its short side): a real one is about a ninth as thick as it is wide. */
export const phoneDeep = (wide: number) => 0.11 * wide;

/**
 * The phone's size in the scene, in metres per CSS pixel: wider devices are wider phones, so the grip opens wider.
 * The robot's hand spans phones up to just under 0.30 m (grip.test.ts), so the widest common phone, 430 CSS px
 * across, is 0.29 m.
 */
export const PHONE_SCALE = 0.29 / 430;

/**
 * The frame the hand grips the phone in, and the phone's size in it. Upright, the phone's own: fingers round its
 * right side, thumb round its left. Turned, a phone is too wide for one hand to span, so a person takes it across
 * its short side: the frame is turned a quarter turn, the fingers take its top edge and the thumb its bottom, and
 * the hand holds it near its right end.
 */
export function gripFrame(phone: Object3D, size: PhoneSize, frame: Object3D): PhoneSize {
  if (frame.parent !== phone) phone.add(frame);
  const turned = size.wide > size.tall;
  frame.rotation.set(0, 0, turned ? Math.PI / 2 : 0);
  frame.updateMatrixWorld(true);
  return turned ? { wide: size.tall, tall: size.wide, deep: size.deep } : size;
}

/** The phone for a screen `wide` by `tall` CSS pixels. */
export const phoneSize = (wide: number, tall: number): PhoneSize => ({
  wide: wide * PHONE_SCALE,
  tall: tall * PHONE_SCALE,
  deep: phoneDeep(Math.min(wide, tall) * PHONE_SCALE),
});

/**
 * How far behind the phone's middle the camera sits, in metres, for the phone's face toward the robot to fill the
 * window exactly at this lens (David, 3 Nov: the red outline of that face should "barely touch the edges of the
 * window" on every device). The face has the window's own shape (phoneSize), so its height fixes the distance.
 */
export function cameraBack(screen: PhoneSize, fov: number): number {
  return screen.tall / 2 / Math.tan((fov / 2) * (Math.PI / 180)) - screen.deep / 2;
}

export const THUMB = 4;
/** The side of the phone (its x) the fingers go round; the thumb goes round the other. */
export const FINGERS_SIDE = 1;
/**
 * The palm is the hand's -X side, and the fingers curl toward it about their +Z (David, 2 Nov: measured on this rig,
 * whose fingers curl a little toward -X at rest, its thumb toward the body's middle with the arm hanging; the grip
 * once took +X for the palm, which held the phone on the back of the hand with the fingers bent back round it).
 * No joint bends past CURL_MAX.
 */
const CURL_MAX = 1.9;
/** The thumb's first joint also swings across the palm, about its X, within these. */
const ACROSS = [-3.2, 3.2] as const;
/** And twists about its own length (its Y), within these. */
const TWIST = [-0.8, 0.8] as const;
/** The knuckles sit this far inside the fingers' side, and the tips land this far round the edges, on the back. */
export const KNUCKLES_IN = 0.02;
export const WRAP = 0.012;
/** How far the palm's middle rests off the phone's face, and how thick a fingertip is (its centre off the back). */
const PALM_OFF = 0.044;
const TIP = 0.012;

const scratch = {
  v: new Vector3(),
  w: new Vector3(),
  a: new Vector3(),
  q: new Quaternion(),
  p: new Quaternion(),
  m: new Matrix4(),
};

/** Where the hand's middle holds the phone, as a share of its height up from the bottom edge. */
export const GRIP_UP = 0.14;

/**
 * How far a tip (in the phone's frame) is from where it may go: hooked round its edge (the fingers' FINGERS_SIDE,
 * the thumb's the other) just past it on the back, or else clamped flat on that side; anywhere along the edge, since
 * each digit meets the edge where its own curl takes it, the thumb at a slant.
 */
export function tipMiss(digit: number, tip: Vector3, phone: PhoneSize): number {
  const side = digit === THUMB ? -FINGERS_SIDE : FINGERS_SIDE;
  const y = Math.min(phone.tall / 2, Math.max(-phone.tall / 2, tip.y));
  return Math.min(
    tip.distanceTo(scratch.a.set(side * (phone.wide / 2 - WRAP), y, phone.deep / 2 + TIP)),
    tip.distanceTo(scratch.a.set(side * (phone.wide / 2 + TIP), y, 0)),
  );
}

/**
 * The hand's world rotation for the grip: fingers (its +Y) toward the phone's FINGERS_SIDE, palm (its -X) on the
 * phone's face toward the robot, facing along the phone's +z.
 */
export function gripRotation(phone: Object3D, out = new Quaternion()): Quaternion {
  phone.updateMatrixWorld(true);
  const x = scratch.v.set(0, 0, -1).transformDirection(phone.matrixWorld);
  const y = scratch.w.set(FINGERS_SIDE, 0, 0).transformDirection(phone.matrixWorld);
  const z = scratch.a.crossVectors(x, y);
  return out.setFromRotationMatrix(scratch.m.makeBasis(x, y, z));
}

/**
 * Where the wrist goes (world space), with the hand already turned to `gripRotation`: the middle finger's knuckle
 * `inset` inside the fingers' side, at the grip's height, the palm PALM_OFF off the face.
 */
export function wristTarget(
  hand: Hand,
  phone: Object3D,
  size: PhoneSize,
  inset = KNUCKLES_IN,
  out = new Vector3(),
): Vector3 {
  phone.updateMatrixWorld(true);
  const wrist = hand.hand.getWorldPosition(scratch.v);
  // The knuckle's offset from the wrist, in the phone's frame (the phone isn't scaled, so rotation only).
  const toKnuckle = hand.digits[1]![0]!.getWorldPosition(scratch.w).sub(wrist);
  const length = toKnuckle.length();
  toKnuckle.transformDirection(scratch.m.copy(phone.matrixWorld).invert()).multiplyScalar(length);
  const want = scratch.a.set(
    FINGERS_SIDE * (size.wide / 2 - inset),
    -size.tall / 2 + GRIP_UP * size.tall,
    -size.deep / 2 - PALM_OFF,
  );
  return phone.localToWorld(out.copy(want).sub(toKnuckle));
}

/**
 * Where along the phone the hand holds it best, and the wrist there: with the hand turned to `gripRotation`, it
 * tries the knuckles at INSETS from the fingers' side, closes the grip at each, and keeps the one where the digit that
 * reaches its target worst reaches it best: every one of them has to hold. Moves the hand bone to try them; the caller then puts the wrist there for real.
 */
export function fitGrip(
  hand: Hand,
  phone: Object3D,
  size: PhoneSize,
  out = new Vector3(),
): Vector3 {
  const parent = hand.hand.parent!;
  parent.updateMatrixWorld(true);
  const home = hand.hand.position.clone();
  let best = Infinity;
  for (const inset of INSETS) {
    const wrist = wristTarget(hand, phone, size, inset, new Vector3());
    hand.hand.position.copy(parent.worldToLocal(wrist.clone()));
    hand.hand.updateMatrixWorld(true);
    const cost = closeGrip(hand, phone, size, 1);
    if (cost < best) {
      best = cost;
      out.copy(wrist);
    }
  }
  hand.hand.position.copy(home);
  hand.hand.updateMatrixWorld(true);
  return out;
}
const INSETS = Array.from({ length: 15 }, (_, i) => 0.12 - i * 0.01);

/**
 * Closes the hand on the phone by `amount` (0 open, 1 holding): each digit's joints, from rest, turned so its tip
 * reaches its target round the phone's side (or clamped on it). The hand must already be at its place and
 * rotation. Returns how far the worst-placed tip is from its target (with how deep it goes into the phone, weighted).
 */
export function closeGrip(hand: Hand, phone: Object3D, size: PhoneSize, amount: number): number {
  phone.updateMatrixWorld(true);
  let cost = 0;
  hand.digits.forEach((joints, d) => {
    joints.slice(0, 3).forEach((j, n) => j.quaternion.copy(hand.rest[d]![n]!));
    hand.hand.updateMatrixWorld(true);
    if (amount <= 0) return;
    cost = Math.max(cost, solveDigit(joints, d, phone, size));
    // Partway: blend each joint from rest toward its solved turn.
    if (amount < 1) {
      joints
        .slice(0, 3)
        .forEach((j, n) =>
          j.quaternion.slerpQuaternions(hand.rest[d]![n]!, j.quaternion.clone(), amount),
        );
      hand.hand.updateMatrixWorld(true);
    }
  });
  return cost;
}

/**
 * How deep a digit goes into the phone (summed over points along its three segments, each grown by the digit's
 * thickness): 0 when it goes round, as it must.
 */
export function intoPhone(joints: Bone[], phone: Object3D, size: PhoneSize): number {
  let depth = 0;
  const a = new Vector3();
  const b = new Vector3();
  const p = new Vector3();
  for (let n = 0; n < 3; n++) {
    phone.worldToLocal(joints[n]!.getWorldPosition(a));
    phone.worldToLocal(joints[n + 1]!.getWorldPosition(b));
    for (let k = 0; k <= SAMPLES; k++) {
      p.lerpVectors(a, b, k / SAMPLES);
      const inside = Math.min(
        size.wide / 2 + TIP - Math.abs(p.x),
        size.tall / 2 + TIP - Math.abs(p.y),
        size.deep / 2 + TIP - Math.abs(p.z),
      );
      if (inside > 0) depth += inside;
    }
  }
  return depth;
}
const SAMPLES = 6;

/**
 * Bends a digit's three joints so its tip reaches `target` without going through the phone (a search on each
 * joint's angle in turn, each a hinge about its local +Z within [0, CURL_MAX] from rest; the thumb's first joint
 * also turns about its X, across the palm, from whichever of a few starts holds best).
 */
function solveDigit(joints: Bone[], digit: number, phone: Object3D, size: PhoneSize): number {
  if (digit !== THUMB) return solveFrom(joints, digit, phone, size, 0);
  const rest = joints.slice(0, 3).map((j) => j.quaternion.clone());
  let best = { miss: Infinity, turns: rest };
  for (const across of THUMB_STARTS) {
    joints.slice(0, 3).forEach((j, n) => j.quaternion.copy(rest[n]!));
    const miss = solveFrom(joints, digit, phone, size, across);
    if (miss < best.miss)
      best = { miss, turns: joints.slice(0, 3).map((j) => j.quaternion.clone()) };
  }
  joints.slice(0, 3).forEach((j, n) => j.quaternion.copy(best.turns[n]!));
  joints[0]!.parent!.updateMatrixWorld(true);
  return best.miss;
}
/** Where the thumb's swing across the palm starts its search from: it keeps the best it finds. */
const THUMB_STARTS = [-2.2, -1, 0, 1, 2.2];

function solveFrom(
  joints: Bone[],
  digit: number,
  phone: Object3D,
  size: PhoneSize,
  start: number,
): number {
  const thumb = digit === THUMB;
  const rest = joints.slice(0, 3).map((j) => j.quaternion.clone());
  const curl = [0, 0, 0];
  let across = start;
  let twist = 0;
  const apply = () => {
    joints.slice(0, 3).forEach((j, n) => {
      j.quaternion.copy(rest[n]!);
      if (thumb && n === 0) j.rotateX(across).rotateY(twist);
      j.rotateZ(curl[n]!);
    });
    joints[0]!.parent!.updateMatrixWorld(true);
  };
  const tip = joints[3]!;
  const miss = () => {
    return (
      tipMiss(digit, phone.worldToLocal(tip.getWorldPosition(scratch.v)), size) +
      20 * intoPhone(joints, phone, size)
    );
  };
  apply();
  // Each joint in turn, from the tip in, a small search on its own angle: robust for hinges with limits.
  for (let pass = 0; pass < 24; pass++) {
    for (let n = 2; n >= 0; n--) {
      const angles = thumb && n === 0 ? ["across", "twist", "curl"] : ["curl"];
      for (const which of angles) {
        let step = pass < 8 ? 0.4 : pass < 16 ? 0.1 : 0.025;
        for (let k = 0; k < 6; k++, step /= 2) {
          const before = miss();
          const get = () => (which === "across" ? across : which === "twist" ? twist : curl[n]!);
          const set = (v: number) =>
            which === "across" ? (across = v) : which === "twist" ? (twist = v) : (curl[n] = v);
          const [lo, hi] = which === "across" ? ACROSS : which === "twist" ? TWIST : [0, CURL_MAX];
          const now = get();
          let best = now;
          let bestMiss = before;
          for (const tryAt of [now + step, now - step]) {
            const v = Math.min(hi, Math.max(lo, tryAt));
            set(v);
            apply();
            const m = miss();
            if (m < bestMiss) {
              bestMiss = m;
              best = v;
            }
          }
          set(best);
          apply();
        }
      }
    }
  }
  return miss();
}
