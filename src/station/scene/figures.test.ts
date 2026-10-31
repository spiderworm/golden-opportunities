import { AnimationClip, AnimationMixer, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { setWalking, startIdling, type Figure } from "./figures";

// The arm hangs down in both clips; at rest (the rig's T-pose) it's level.
const DOWN = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -1.2);
const SWING = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -1);

function figure(): { figure: Figure; arm: Bone } {
  const root = new Group();
  const arm = new Bone();
  arm.name = "arm";
  root.add(arm);
  const clip = (name: string, pose: Quaternion) =>
    new AnimationClip(name, 2, [new QuaternionKeyframeTrack("arm.quaternion", [0, 2], [...pose.toArray(), ...pose.toArray()])]);
  const mixer = new AnimationMixer(root);
  return {
    figure: { root, mixer, idle: mixer.clipAction(clip("idle", DOWN)), walk: mixer.clipAction(clip("walk", SWING)), walking: false },
    arm,
  };
}

const posedLike = (arm: Bone, pose: Quaternion) => expect(arm.quaternion.angleTo(pose)).toBeLessThan(1e-3);

describe("startIdling", () => {
  it("poses each figure in its idle before the first frame", () => {
    const { figure: f, arm } = figure();
    startIdling([f], () => 0.5);
    expect(f.idle.isRunning()).toBe(true);
    expect(f.idle.time).toBe(1);
    posedLike(arm, DOWN);
  });

  it("idles again when React cleans the effect up and reruns it (the keeper's T-pose)", () => {
    const { figure: f, arm } = figure();
    const stop = startIdling([f]);
    setWalking(f, true);
    stop();
    expect(f.idle.isRunning()).toBe(false);
    startIdling([f]);
    expect(f.idle.isRunning()).toBe(true);
    expect(f.walking).toBe(false);
    f.mixer.update(0.1);
    posedLike(arm, DOWN);
    expect(arm.quaternion.angleTo(new Quaternion())).toBeGreaterThan(1);
  });

  it("still crossfades into a walk after the rerun", () => {
    const { figure: f, arm } = figure();
    startIdling([f])();
    startIdling([f]);
    setWalking(f, true);
    f.mixer.update(1);
    expect(f.walk.isRunning()).toBe(true);
    posedLike(arm, SWING);
  });
});
