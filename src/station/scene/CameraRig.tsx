import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import {
  CatmullRomCurve3,
  Vector3,
  type DirectionalLight,
  type Group,
  type PerspectiveCamera,
} from "three";

import {
  easeInOutCubic,
  GLIDE_STATION_POINTS,
  INSIDE_LOOK,
  OUTSIDE_EYE,
  OUTSIDE_LOOK,
  smoothstep,
  WINDOW_CENTER,
} from "./layout";
import { GLIDE_SECONDS } from "../scene-params";
import type { StationViewpoint } from "./StationScene";

// Flies the camera between its home outside and the corner of the shop.
// The path's later points turn with the station, so it is rebuilt every
// frame; once inside, the camera turns with the station too, and the planet
// drifts past the window.

export const SUN_INTENSITY = 2.4;

export function CameraRig({
  station,
  sun,
  view,
  instant,
  onSettled,
}: {
  station: RefObject<Group | null>;
  /** The sun lights everything, walls or not, so it dims while the camera is in the shop. */
  sun: RefObject<DirectionalLight | null>;
  view: StationViewpoint;
  /** Jump instead of gliding (prefers-reduced-motion). */
  instant: boolean;
  onSettled: (view: StationViewpoint) => void;
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const progress = useRef(view === "inside" ? 1 : 0);
  const settled = useRef<StationViewpoint | null>(null);
  const work = useMemo(
    () => ({
      points: [OUTSIDE_EYE, ...GLIDE_STATION_POINTS].map((p) => p.clone()),
      curve: new CatmullRomCurve3([], false, "centripetal"),
      look: new Vector3(),
      windowCenter: new Vector3(),
      inside: new Vector3(),
      sway: new Vector3(),
      right: new Vector3(),
    }),
    [],
  );

  useFrame(({ clock, pointer }, delta) => {
    const frame = station.current;
    if (!frame) return;
    frame.updateMatrixWorld();
    const target = view === "inside" ? 1 : 0;
    const p = progress.current;
    if (p !== target) {
      settled.current = null;
      const step = instant ? 1 : Math.min(delta, 0.1) / GLIDE_SECONDS;
      progress.current = target > p ? Math.min(target, p + step) : Math.max(target, p - step);
    } else if (settled.current !== view) {
      settled.current = view;
      onSettled(view);
    }

    const u = easeInOutCubic(progress.current);
    const t = clock.elapsedTime;
    const { points, curve, look, windowCenter, inside, sway, right } = work;
    // Outside, the home point drifts a little so the view never freezes.
    points[0]!
      .copy(OUTSIDE_EYE)
      .add(sway.set(Math.sin(t * 0.07) * 12, Math.sin(t * 0.05) * 6, Math.cos(t * 0.06) * 8));
    GLIDE_STATION_POINTS.forEach((local, i) =>
      points[i + 1]!.copy(local).applyMatrix4(frame.matrixWorld),
    );
    curve.points = points;
    camera.position.copy(curve.getPoint(u));

    windowCenter.copy(WINDOW_CENTER).applyMatrix4(frame.matrixWorld);
    inside.copy(INSIDE_LOOK).applyMatrix4(frame.matrixWorld);
    look
      .copy(OUTSIDE_LOOK)
      .lerp(windowCenter, smoothstep(0.1, 0.45, u))
      .lerp(inside, smoothstep(0.5, 0.68, u));
    // A little parallax from the pointer, more of it outside. It shifts the
    // look target along the screen's right, not the world's x, which faces
    // away from the camera outside and turns with the station inside.
    const reach = u > 0.6 ? 0.9 : 14;
    right.subVectors(look, camera.position).cross(camera.up).normalize();
    look.addScaledVector(right, pointer.x * reach);
    look.y += pointer.y * reach * 0.5;
    camera.lookAt(look);

    if (sun.current) sun.current.intensity = SUN_INTENSITY * (1 - 0.85 * smoothstep(0.6, 0.8, u));

    const near = u > 0.55 ? 0.05 : 0.5;
    if (camera.near !== near) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
