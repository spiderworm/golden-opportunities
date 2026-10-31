import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  MeshBasicMaterial,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Mesh,
  type Texture,
} from "three";

import { PLANET_POSITION, PLANET_RADIUS, SUN_DIRECTION } from "./layout";
import { kept } from "./world";

// Everything far away: the planet, its atmosphere, the sun and the stars.
// The planet's day and night maps and the starfield behind the stars are
// pictures from Gemini (public/textures/station/, provenance.json); its
// clouds, atmosphere, the sun and the stars themselves are shaders.

const TEXTURES = ["planet-day", "planet-night", "starfield"].map((name) => `/textures/station/${name}.jpg`);

/** Equirectangular maps, wrapped once round a sphere by its own UVs (so mipmaps leave no seam). */
function prepare(texture: Texture): Texture {
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const NOISE = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;

function Planet({ day, night }: { day: Texture; night: Texture }) {
  const surface = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { sun: { value: SUN_DIRECTION.clone() }, time: { value: 0 }, dayMap: { value: prepare(day) }, nightMap: { value: prepare(night) } },
        vertexShader: /* glsl */ `
          varying vec3 vLocal;
          varying vec3 vNormal;
          varying vec2 vUv;
          void main() {
            vLocal = position;
            vUv = uv;
            vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 sun;
          uniform float time;
          uniform sampler2D dayMap;
          uniform sampler2D nightMap;
          varying vec3 vLocal;
          varying vec3 vNormal;
          varying vec2 vUv;
          ${NOISE}
          void main() {
            vec3 p = normalize(vLocal);
            vec2 uv = vUv;
            vec3 color = texture2D(dayMap, uv).rgb;
            // Clouds drift with time against the turning surface.
            float c = fbm(p * 4.0 + vec3(time * 0.004, 0.0, time * 0.002));
            float clouds = smoothstep(0.5, 0.75, c);
            color = mix(color, vec3(0.95), clouds * 0.85);
            float light = dot(normalize(vNormal), sun);
            float day = smoothstep(-0.08, 0.25, light);
            vec3 lit = color * (0.06 + 1.15 * max(light, 0.0));
            // City lights from the night map (only its warm lights, not its grey ice or blue sea),
            // on the night side, under the clouds.
            vec3 night = texture2D(nightMap, uv).rgb;
            vec3 cities = min(night * smoothstep(0.08, 0.3, night.r - night.b), vec3(0.28)) * (1.0 - clouds) * (1.0 - day);
            gl_FragColor = vec4(lit + cities, 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [day, night],
  );
  const atmosphere = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { sun: { value: SUN_DIRECTION.clone() } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: BackSide,
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vNormal = normalize(mat3(modelMatrix) * normal);
            vView = normalize(cameraPosition - world.xyz);
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 sun;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float rim = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
            float lit = smoothstep(-0.35, 0.4, dot(-vNormal, sun));
            vec3 color = mix(vec3(0.42, 0.36, 1.0), vec3(0.45, 0.75, 1.0), lit);
            gl_FragColor = vec4(color * rim * (0.25 + 1.3 * lit), 1.0);
          }
        `,
      }),
    [],
  );

  useFrame(({ clock }) => {
    material.uniforms.time!.value = clock.elapsedTime;
    if (surface.current) surface.current.rotation.y = clock.elapsedTime * 0.004;
  });

  return (
    <group position={PLANET_POSITION}>
      <mesh ref={surface} material={material} rotation={[0.3, 0, 0.2]}>
        <sphereGeometry args={[PLANET_RADIUS, 96, 64]} />
      </mesh>
      <mesh material={atmosphere} scale={1.06}>
        <sphereGeometry args={[PLANET_RADIUS, 64, 32]} />
      </mesh>
    </group>
  );
}

const STAR_COUNT = 2600;

function starField() {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const palette = [new Color("#ffffff"), new Color("#c9d6ff"), new Color("#ffe2b8"), new Color("#b9aaff")];
  for (let i = 0; i < STAR_COUNT; i++) {
    // Uniform on a sphere far beyond the planet.
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions.set([r * Math.cos(a) * 6000, u * 6000, r * Math.sin(a) * 6000], i * 3);
    const c = palette[i % palette.length]!;
    colors.set([c.r, c.g, c.b], i * 3);
    sizes[i] = 0.8 + Math.random() ** 4 * 3.2;
  }
  return { positions, colors, sizes };
}

function Stars() {
  const { geometry, material } = useMemo(() => {
    // The same sky on every visit.
    const { positions, colors, sizes } = kept("stars", starField);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.setAttribute("size", new BufferAttribute(sizes, 1));
    const material = new ShaderMaterial({
      uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        uniform float time;
        uniform float pixelRatio;
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vColor = color;
          vTwinkle = 0.75 + 0.25 * sin(time * (0.6 + fract(position.x) * 1.5) + position.y);
          gl_PointSize = size * pixelRatio;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * a * vTwinkle, a);
        }
      `,
    });
    return { geometry, material };
  }, []);

  useFrame(({ gl, clock }) => {
    material.uniforms.time!.value = clock.elapsedTime;
    material.uniforms.pixelRatio!.value = gl.getPixelRatio();
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/** Gemini's nebula (its stars filtered out), faint, on a sphere beyond the point stars. */
function Nebula({ map }: { map: Texture }) {
  const material = useMemo(
    () => new MeshBasicMaterial({ map: prepare(map), side: BackSide, depthWrite: false, color: new Color(0.55, 0.55, 0.6), toneMapped: false }),
    [map],
  );
  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[7000, 48, 24]} />
    </mesh>
  );
}

/** A soft glow where the sun is; it follows the camera so it never gets closer. */
function Sun() {
  const ref = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            float d = length(vUv - 0.5) * 2.0;
            float core = smoothstep(0.12, 0.0, d);
            float halo = pow(max(0.0, 1.0 - d), 3.0) * 0.6;
            gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * (core * 3.0 + halo), 1.0);
          }
        `,
      }),
    [],
  );
  useFrame(({ camera }) => {
    if (!ref.current) return;
    ref.current.position.copy(camera.position).addScaledVector(SUN_DIRECTION, 5000);
    ref.current.quaternion.copy(camera.quaternion);
  });
  return (
    <mesh ref={ref} material={material} frustumCulled={false}>
      <planeGeometry args={[900, 900]} />
    </mesh>
  );
}

export function Sky() {
  const [day, night, starfield] = useLoader(TextureLoader, TEXTURES);
  return (
    <>
      <Nebula map={starfield!} />
      <Stars />
      <Sun />
      <Planet day={day!} night={night!} />
    </>
  );
}
