import type { CrowdAgent } from "@recast-navigation/core";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Group, Vector3, type Mesh, type MeshStandardMaterial } from "three";

import { faceParts, newMood, pose, step, type Mood } from "~/assistant/ui/DeweyFaces3D";
import {
  DEWEY_REST,
  errandPlace,
  facing,
  nextErrand,
  tripTo,
  type DeweyErrand,
  type DeweyLeg,
} from "./dewey-plan";
import { useStationModel } from "./loading";
import { selfLit } from "./models";
import { kept, peek } from "./world";

// Dewey, floating about the shop (David, 3 Nov 2026: "can we get Dewey floating around, contributing, doing things
// like the other robots, interacting with customers and the guy sitting at the desk?"). The same model and screen
// faces as his chat (public/dewey), loaded with the rest of the scene, so he's there from its first frame. What he
// does is dewey-plan.ts's; here he's moved, posed and his screen played, as in the chat: the spinner while he looks
// something up, then the lightbulb, and his mouth while he talks. With reduced motion he rests by the counter.

export const DEWEY_MODEL = "/dewey/dewey.glb";
/** His model is 0.98 tall; in the shop he's about 0.75 m, bigger than the little robots, so he reads from the corner. */
const SCALE = 0.75;
/** Lit a little from within, as the robots are, so he reads in the shop's dim light. */
const GLOW = 0.4;
/** How fast he floats (meters a second): slower than the robots, so he never draws the eye. */
const SPEED = 0.8;
/** How quickly he turns (per second). */
const TURN = 2.2;

/** His state, kept outside the canvas so a return to the station finds him mid-errand (see world.ts). */
interface DeweyState {
  at: Vector3;
  yaw: number;
  legs: DeweyLeg[];
  /** Seconds held at the current leg's end, or -1 while flying. */
  held: number;
  last: DeweyErrand | null;
  mood: Mood;
}

/** The keeper turns to face whoever's talking to them across the counter (Shoppers.tsx reads it). */
export const keeperAttention = () =>
  kept("keeper attention", () => ({ at: null as Vector3 | null }));

/** Where the shoppers browsing now are (null for those who aren't), from the shoppers' own state. */
function browsing(): ({ x: number; z: number } | null)[] {
  const walkers = peek<{ agent: CrowdAgent | null; browseUntil: number | null }[]>("walkers") ?? [];
  return walkers.map((w) => {
    if (!w.agent || w.browseUntil === null) return null;
    const p = w.agent.position();
    return { x: p.x, z: p.z };
  });
}

export function Dewey({ reducedMotion }: { reducedMotion: boolean }) {
  const gltf = useStationModel(DEWEY_MODEL);
  const parts = useMemo(() => {
    // The face's parts are laid out on the model where it stands (faceParts casts rays at it), then the whole is
    // moved down to hover about its middle, and scaled to the shop.
    const model = new Group();
    const body = gltf.scene.clone();
    // His own materials, lit a little from within: the clone shares the loaded ones, which stay as they are.
    const lit: MeshStandardMaterial[] = [];
    body.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const material = selfLit(mesh.material as MeshStandardMaterial, GLOW);
      lit.push(material);
      mesh.material = material;
    });
    model.add(body);
    const face = faceParts(model, body, { overlay: false });
    model.position.y = -0.49;
    const posed = new Group();
    posed.add(model);
    const root = new Group();
    root.scale.setScalar(SCALE);
    root.add(posed);
    return { root, posed, face, lit };
  }, [gltf]);
  useEffect(
    () => () => {
      parts.face.dispose();
      for (const m of parts.lit) m.dispose();
    },
    [parts],
  );

  const state = useMemo(
    () =>
      kept<DeweyState>("dewey", () => ({
        at: DEWEY_REST.clone(),
        yaw: facing(DEWEY_REST, { x: 0, z: 0 }),
        // A moment by the counter first, then about his work.
        legs: [
          {
            to: DEWEY_REST.clone(),
            hold: 3,
            face: facing(DEWEY_REST, { x: 0, z: 0 }),
            errand: "rest",
          },
        ],
        held: -1,
        last: null,
        mood: newMood(false, null),
      })),
    [],
  );
  const work = useMemo(() => ({ v: new Vector3() }), []);

  useFrame(({ clock }, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1);
    const t = clock.elapsedTime;
    const attention = keeperAttention();

    let leg: DeweyLeg | undefined = state.legs[0];
    if (reducedMotion) {
      // Resting by the counter, still but for his idle hover.
      state.at.copy(DEWEY_REST);
      state.yaw = facing(DEWEY_REST, { x: 0, z: 0 });
      leg = undefined;
    } else {
      if (!leg) {
        const errand = nextErrand(state.last, Math.random);
        state.legs = tripTo(state.at, errandPlace(errand, browsing(), Math.random), Math.random);
        state.held = -1;
        leg = state.legs[0]!;
      }
      const toward = work.v.subVectors(leg.to, state.at);
      const distance = toward.length();
      if (distance > 0.01) {
        state.at.addScaledVector(toward, Math.min(1, (SPEED * delta) / distance));
        if (Math.hypot(toward.x, toward.z) > 0.05)
          turnToward(state, Math.atan2(toward.x, toward.z), delta);
      } else if (leg.hold !== undefined) {
        state.held = Math.max(0, state.held) + delta;
        // Facing what he's there for: the shopper as they move, or the way the errand faces.
        const shopper = leg.shopper !== undefined ? browsing()[leg.shopper] : null;
        turnToward(state, shopper ? facing(state.at, shopper) : (leg.face ?? state.yaw), delta);
        if (state.held >= leg.hold || (leg.errand === "show" && !shopper)) {
          state.last = leg.errand ?? state.last;
          state.legs.shift();
          state.held = -1;
        }
      } else state.legs.shift();
    }

    // What his screen and pose show: looking something up (the spinner, then the lightbulb as he finds it), or
    // talking, to a shopper or the keeper.
    const holding = !reducedMotion && leg?.hold !== undefined && state.held >= 0;
    const errand = holding ? leg!.errand : undefined;
    const talking = errand === "show" || errand === "keeper";
    step(state.mood, talking, errand === "lookup" ? "thinking" : talking ? "saying" : null, delta);
    attention.at = errand === "keeper" ? state.at : null;

    parts.root.position.copy(state.at);
    parts.root.rotation.set(0, state.yaw, 0);
    pose(parts.posed, t, 7, state.mood.talk, state.mood.think, state.mood.flare);
    parts.face.show(t, 7, state.mood, talking);
  });
  return <primitive object={parts.root} />;
}

/** Turns him toward `yaw` (radians about Y), the short way round. */
function turnToward(state: DeweyState, yaw: number, delta: number) {
  const diff = Math.atan2(Math.sin(yaw - state.yaw), Math.cos(yaw - state.yaw));
  state.yaw += diff * Math.min(1, TURN * delta);
}
