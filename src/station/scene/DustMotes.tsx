import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from "three";

import { ROOM } from "./layout";

// Dust drifting in the shop's light. The drift is worked out on the GPU,
// so it costs one draw call and no per-frame JavaScript.

const COUNT = 260;

export function DustMotes() {
  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions.set(
        [(Math.random() - 0.5) * (ROOM.width - 1), 0.3 + Math.random() * (ROOM.height - 0.6), (Math.random() - 0.5) * (ROOM.depth - 1)],
        i * 3,
      );
      seeds[i] = Math.random() * 100;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("seed", new BufferAttribute(seeds, 1));
    const material = new ShaderMaterial({
      uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float time;
        uniform float pixelRatio;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float t = time * 0.12 + seed;
          p += vec3(sin(t * 1.3) * 0.35, sin(t * 0.7 + seed) * 0.25, cos(t * 1.1) * 0.35);
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = clamp(14.0 * pixelRatio / -view.z, 1.0, 6.0 * pixelRatio);
          vAlpha = 0.25 + 0.35 * (0.5 + 0.5 * sin(time * 0.8 + seed * 3.0));
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vAlpha;
          gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * a, a);
        }
      `,
    });
    return { geometry, material };
  }, []);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  useFrame(({ gl }, delta) => {
    material.uniforms.time!.value += delta;
    material.uniforms.pixelRatio!.value = gl.getPixelRatio();
  });
  return <points geometry={geometry} material={material} position={[0, 0, 0]} />;
}
