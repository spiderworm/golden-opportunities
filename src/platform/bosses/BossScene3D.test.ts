import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { fitCamera } from "./BossScene3D";

/** Where a point at height y on the robots' line lands, in px from the floor box's top. */
function screenY(fit: { distance: number; height: number }, y: number, height: number) {
  const camera = new PerspectiveCamera(30, 1000 / height, 0.1, 30);
  camera.position.set(0, fit.height, fit.distance);
  camera.rotation.set(-0.08, 0, 0);
  camera.updateMatrixWorld(true);
  const ndc = new Vector3(0, y, 0).project(camera).y;
  return ((1 - ndc) / 2) * height;
}

describe("framing the bosses to their floor", () => {

  for (const [height, headroom] of [
    [220, 12],
    [360, 40],
    [500, 40],
    [160, 12],
  ] as const) {
    it(`puts the feet on a ${height} px floor's bottom and the tallest ${headroom} px under its top`, () => {
      const fit = fitCamera(height, headroom);
      expect(screenY(fit, 0, height)).toBeCloseTo(height - 4, 1);
      expect(screenY(fit, 1, height)).toBeCloseTo(headroom, 1);
    });
  }
});
