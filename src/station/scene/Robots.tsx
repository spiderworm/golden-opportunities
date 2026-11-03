import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  ConeGeometry,
  DoubleSide,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from "three";

import { Bookshop } from "./bookshop";
import { ROOM, smoothstep } from "./layout";
import { selfLit, useModelParts } from "./models";
import { clear, CRUISE, HOMES, inFrontOf, routePoints, SIZE, unitFront } from "./robot-paths";
import { SHELF_HEIGHT, SHELF_UNITS } from "./shelves";
import { kept } from "./world";

// The shop's little flying robots. They float above the shoppers' heads and
// keep the place tidy: they fetch books left lying about and slide them back
// into their gaps, straighten books left leaning, dust the shelf tops,
// polish the window, and rest in their corners when there's nothing to do.

export const ROBOTS = 3;
const SPEED = 1.4;
/** Where a carried book hangs, below the robot. */
const GRIP = 0.33;
/** The window's inside face, less a little room for the robot. */
const GLASS_Z = ROOM.depth / 2 - 0.4;
const DOWN = new Vector3(0, -1, 0);
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/** One stretch of a chore: fly to `to`, then stay there for `hold` seconds. */
interface Leg {
  to: Vector3;
  speed?: number;
  hold?: number;
  /** Which way to face while holding (radians about Y). */
  face?: number;
  arrive?: () => void;
  during?: (f: number) => void;
  done?: () => void;
}

interface Robot {
  at: Vector3;
  yaw: number;
  tilt: number;
  legs: Leg[];
  /** Seconds held at the current leg's end, or -1 while flying. */
  held: number;
  /** The stray it's carrying (a bookshop slot), or -1. */
  carrying: number;
  /** Which way its work light points, or null when it's off. */
  beam: Vector3 | null;
}

/** Up to cruising height, across, and down to `to`; `last` adds to the final leg. */
function route(from: Vector3, to: Vector3, cruise: number, last: Partial<Leg> = {}): Leg[] {
  const [up, across, down] = routePoints(from, to, cruise);
  return [{ to: up! }, { to: across! }, { ...last, to: down! }];
}

export function Robots({ shop }: { shop: Bookshop }) {
  const bodies = useRef<InstancedMesh>(null);
  const beams = useRef<InstancedMesh>(null);
  const model = useModelParts("robot");
  const geometry = useMemo(
    () => ({
      // The model stands on y = 0; a robot hovers about its middle.
      body: model.geometry.clone().translate(0, -0.5, 0),
      // Its tip at the robot, opening along -y.
      beam: new ConeGeometry(0.22, 0.75, 20, 1, true).translate(0, -0.375, 0),
    }),
    [model],
  );
  const materials = useMemo(
    () => ({
      body: selfLit(model.material, 0.45),
      beam: new MeshBasicMaterial({
        color: "#9fe6ff",
        transparent: true,
        opacity: 0.16,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    }),
    [model],
  );
  useEffect(
    () => () => {
      for (const g of Object.values(geometry)) g.dispose();
      for (const m of Object.values(materials)) m.dispose();
    },
    [geometry, materials],
  );

  // Where they are and what they're doing outlives the canvas (see world.ts).
  const robots = useMemo(
    () =>
      kept<Robot[]>("robots", () =>
        HOMES.map((home, i) => ({
          at: home.clone(),
          yaw: Math.PI,
          tilt: 0,
          // Staggered starts, so they don't all set off at once.
          legs: [{ to: home.clone(), hold: 0.5 + i * 1.5 }],
          held: -1,
          carrying: -1,
          beam: null,
        })),
      ),
    [],
  );
  const busy = useMemo(
    () => kept("robot chores", () => ({ polishing: -1, dusting: new Set<number>() })),
    [],
  );
  const work = useMemo(
    () => ({ dummy: new Object3D(), q: new Quaternion(), v: new Vector3(), m: new Matrix4() }),
    [],
  );

  /** Fetch a stray book and put it back in its gap. */
  function reshelve(i: number, robot: Robot, slot: number): Leg[] {
    const stray = shop.strays[slot]!;
    const book = stray.book;
    const above = new Vector3()
      .setFromMatrixPosition(stray.matrix)
      .add(new Vector3(0, GRIP + 0.05, 0));
    const facing = shop.books[book]!.facing;
    const hover = inFrontOf(shop, book, 0.32);
    const from = { at: new Vector3(), turn: new Quaternion() };
    const into = {
      at: new Vector3(),
      turn: new Quaternion(),
      scale: new Vector3(),
      pose: new Matrix4(),
    };
    const cruise = CRUISE[i]!;
    return [
      ...route(robot.at, above, cruise, {
        hold: 0.6,
        arrive: () => {
          shop.lift(slot);
          robot.carrying = slot;
        },
      }),
      ...route(above, hover, cruise, {
        hold: 1,
        face: facing + Math.PI,
        arrive: () => {
          robot.carrying = -1;
          from.at.copy(robot.at).y -= GRIP;
          Bookshop.flat(robot.yaw, from.turn);
          shop.shelfPose(book, into.pose).decompose(into.at, into.turn, into.scale);
        },
        during: (f) => {
          const e = smoothstep(0, 1, f);
          work.v.lerpVectors(from.at, into.at, e);
          work.q.slerpQuaternions(from.turn, into.turn, e);
          shop.hold(slot, work.v, work.q);
        },
        done: () => shop.shelve(slot),
      }),
    ];
  }

  /** Nudge a leaning book upright. */
  function straighten(i: number, robot: Robot, book: number): Leg[] {
    const b = shop.books[book]!;
    const hover = inFrontOf(shop, book, 0.3);
    const lean = b.lean;
    return route(robot.at, hover, CRUISE[i]!, {
      hold: 1.4,
      face: b.facing + Math.PI,
      arrive: () => {
        // Its work light on the book, from wherever it hovers.
        robot.beam = shop.shelfCenter(book).sub(robot.at).normalize();
      },
      during: (f) => shop.setLean(book, lean * (1 - smoothstep(0.2, 0.9, f))),
      done: () => {
        shop.straightened(book);
        robot.beam = null;
      },
    });
  }

  /** Sweep along the top of a shelf unit. */
  function dust(i: number, robot: Robot): Leg[] {
    const free = SHELF_UNITS.map((_, u) => u).filter((u) => !busy.dusting.has(u));
    const u = free[Math.floor(Math.random() * free.length)]!;
    busy.dusting.add(u);
    const unit = SHELF_UNITS[u]!;
    const front = unitFront(unit);
    const along = new Vector3(Math.cos(unit.facing), 0, -Math.sin(unit.facing)).multiplyScalar(
      unit.width / 2 - 0.35,
    );
    const top = new Vector3(unit.x, SHELF_HEIGHT + 0.32, unit.z).addScaledVector(front, 0.05);
    const [a, b] =
      Math.random() < 0.5
        ? [top.clone().add(along), top.clone().sub(along)]
        : [top.clone().sub(along), top.clone().add(along)];
    // Come up in front of the shelf, not through it (nor the one beside it, in a corner), and leave the same way.
    const outA = clear(a.clone().addScaledVector(front, 0.6));
    const outB = clear(b.clone().addScaledVector(front, 0.6));
    return [
      ...route(robot.at, outA, CRUISE[i]!),
      { to: a, arrive: () => (robot.beam = DOWN.clone()) },
      { to: b, speed: 0.5 },
      { to: a, speed: 0.5 },
      { to: b, speed: 0.5, done: () => (robot.beam = null) },
      {
        to: outB,
        arrive: () => {
          robot.beam = null;
          busy.dusting.delete(u);
        },
      },
    ];
  }

  /** Two passes across the window's glass. */
  function polish(i: number, robot: Robot): Leg[] {
    busy.polishing = i;
    const side = Math.random() < 0.5 ? 1 : -1;
    const at = (x: number, y: number) => new Vector3(x * side, y, GLASS_Z);
    const toGlass = new Vector3(0, 0, 1);
    return [
      ...route(robot.at, at(-5.5, 3.7), CRUISE[i]!, {
        face: 0,
        hold: 0.3,
        arrive: () => (robot.beam = toGlass),
      }),
      { to: at(5.5, 3.7), speed: 0.9 },
      { to: at(5.5, 2.7), speed: 0.9 },
      {
        to: at(-5.5, 2.7),
        speed: 0.9,
        done: () => {
          robot.beam = null;
          busy.polishing = -1;
        },
      },
    ];
  }

  function nextChore(i: number, robot: Robot): Leg[] {
    const slot = shop.claimStray(i, robot.at);
    if (slot >= 0) return reshelve(i, robot, slot);
    const book = shop.claimLean(i, robot.at);
    if (book >= 0) return straighten(i, robot, book);
    const r = Math.random();
    if (r < 0.35 && busy.dusting.size < SHELF_UNITS.length) return dust(i, robot);
    if (r < 0.6 && busy.polishing < 0) return polish(i, robot);
    return route(robot.at, HOMES[i]!, CRUISE[i]!, { hold: 3 + Math.random() * 5 });
  }

  useFrame(({ clock }, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1);
    const { dummy, q, v } = work;
    const t = clock.elapsedTime;
    robots.forEach((robot, i) => {
      if (!robot.legs.length) robot.legs = nextChore(i, robot);
      const leg = robot.legs[0]!;
      let speed = 0;
      if (robot.held < 0) {
        v.subVectors(leg.to, robot.at);
        const distance = v.length();
        speed = Math.min(leg.speed ?? SPEED, 0.25 + distance * 1.6);
        if (distance <= speed * delta + 1e-4) {
          robot.at.copy(leg.to);
          robot.held = 0;
          leg.arrive?.();
        } else {
          robot.at.addScaledVector(v, (speed * delta) / distance);
          if (Math.hypot(v.x, v.z) > 0.05)
            robot.yaw = turnToward(robot.yaw, Math.atan2(v.x, v.z), delta * 4);
        }
      } else {
        robot.held += delta;
        const hold = leg.hold ?? 0;
        leg.during?.(hold > 0 ? Math.min(1, robot.held / hold) : 1);
        if (leg.face !== undefined) robot.yaw = turnToward(robot.yaw, leg.face, delta * 3);
        if (robot.held >= hold) {
          leg.done?.();
          robot.legs.shift();
          robot.held = -1;
        }
      }
      robot.tilt += (Math.min(0.25, speed * 0.15) - robot.tilt) * Math.min(1, delta * 4);

      dummy.position.copy(robot.at);
      dummy.position.y += Math.sin(t * 2.2 + i * 2) * 0.025;
      dummy.rotation.set(robot.tilt, robot.yaw, Math.sin(t * 1.3 + i) * 0.04, "YXZ");
      dummy.scale.setScalar(SIZE);
      dummy.updateMatrix();
      bodies.current?.setMatrixAt(i, dummy.matrix);
      if (robot.carrying >= 0)
        shop.hold(
          robot.carrying,
          v.copy(dummy.position).setY(dummy.position.y - GRIP),
          Bookshop.flat(robot.yaw, q),
        );
      if (robot.beam) {
        dummy.quaternion.setFromUnitVectors(DOWN, robot.beam);
        dummy.scale.setScalar(0.9 + 0.1 * Math.sin(t * 9 + i));
        dummy.updateMatrix();
        beams.current?.setMatrixAt(i, dummy.matrix);
        dummy.scale.setScalar(1);
      } else {
        beams.current?.setMatrixAt(i, HIDDEN);
      }
    });
    for (const mesh of [bodies.current, beams.current])
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    materials.body.emissiveIntensity = 0.4 + 0.08 * Math.sin(t * 3);
  });

  return (
    <>
      <instancedMesh
        ref={bodies}
        args={[geometry.body, materials.body, ROBOTS]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={beams}
        args={[geometry.beam, materials.beam, ROBOTS]}
        frustumCulled={false}
      />
    </>
  );
}

/** Turns an angle toward another the short way round, by at most `step`. */
function turnToward(from: number, to: number, step: number): number {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + Math.max(-step, Math.min(step, diff));
}
