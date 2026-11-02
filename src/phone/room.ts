import { BackSide, BoxGeometry, Color, Mesh, ShaderMaterial, Vector3, type Texture } from "three";

// The bosses' room in 3D, for the phone scene (David, 2 Nov: the room has to
// be a 3D scene, so the phone's moves show against it). Rebuilt from the one
// picture there is of it, public/bosses/backdrop.webp (Tripo's concept,
// research/station-assets/backdrop.py): a box the room's size, floor,
// walls and ceiling, each point of it coloured by projecting it back through
// the camera the picture was taken from. From there it is the picture
// exactly; from near there (the phone, walking in and held up) the walls,
// floor and ceiling move as a room's would. The racks and pillars are painted
// on the back wall, so they're flat; the floor and walls nearer than the
// picture shows are its nearest edge, stretched (plain floor and wall).
//
// Measured on the 2400 x 1200 picture, which looks straight at the back wall
// (one-point perspective): the floor's edges along the side walls meet at
// (1205, 577), where the camera points; the back wall spans x 350 to 2050,
// floor at y 856, ceiling at y 280. A server rack, 2 m tall, is 440 px there,
// so the back wall is at 220 px a metre. The picture's lens isn't knowable
// from one view; at a 60 degree lens (focal length 2078 px) the back wall is
// 9.4 m away.

export const PHOTO = {
  url: "/bosses/backdrop.webp",
  width: 2400,
  height: 1200,
  /** Where the camera pointed, in the picture's pixels (y down). */
  centre: [1205, 577] as const,
  /** Its focal length, in the picture's pixels: a 60 degree lens across its width. */
  focal: 1200 / Math.tan(Math.PI / 6),
  /** Its height off the floor, in metres. */
  eye: 1.27,
};
const SCALE = PHOTO.focal / 220; // the back wall's distance: 220 px a metre there
/** The room in metres, in its own frame: the floor at y = 0, the picture's camera at (0, eye, 0) looking along -z. */
export const ROOM = {
  left: (350 - PHOTO.centre[0]) / 220,
  right: (2050 - PHOTO.centre[0]) / 220,
  ceiling: PHOTO.eye + (PHOTO.centre[1] - 280) / 220,
  back: -SCALE,
  /** Behind the picture's camera: never seen, but closes the box. */
  front: 3,
};

/** Where a point in the room's frame shows in the picture, in its pixels (y down); null behind the camera. */
export function inPicture(p: Vector3): [number, number] | null {
  const z = -p.z;
  if (z <= 0) return null;
  return [
    PHOTO.centre[0] + (PHOTO.focal * p.x) / z,
    PHOTO.centre[1] - (PHOTO.focal * (p.y - PHOTO.eye)) / z,
  ];
}

/**
 * The room: a box seen from inside, its origin on the floor below the picture's camera. `dim` is the screen's
 * shade over it, as the phone screen's CSS laid it over the picture: a colour and how much of it.
 */
export function makeRoom(
  picture: Texture,
  dim = { colour: new Color(12 / 255, 16 / 255, 30 / 255), amount: 0.45 },
): Mesh {
  const { left, right, ceiling, back, front } = ROOM;
  const geometry = new BoxGeometry(right - left, ceiling, front - back);
  geometry.translate((left + right) / 2, ceiling / 2, (front + back) / 2);
  const material = new ShaderMaterial({
    side: BackSide,
    uniforms: {
      picture: { value: picture },
      centre: { value: [PHOTO.centre[0] / PHOTO.width, PHOTO.centre[1] / PHOTO.height] },
      focal: { value: [PHOTO.focal / PHOTO.width, PHOTO.focal / PHOTO.height] },
      eye: { value: PHOTO.eye },
      dimColour: { value: dim.colour },
      dimAmount: { value: dim.amount },
    },
    vertexShader: /* glsl */ `
      varying vec3 vAt;
      void main() {
        vAt = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D picture;
      uniform vec2 centre;
      uniform vec2 focal;
      uniform float eye;
      uniform vec3 dimColour;
      uniform float dimAmount;
      varying vec3 vAt;
      void main() {
        // Through the picture's camera: x right, y up, looking along -z. Nothing behind it is ever in view.
        float z = max(-vAt.z, 0.05);
        vec2 uv = vec2(centre.x + focal.x * vAt.x / z, centre.y - focal.y * (vAt.y - eye) / z);
        vec3 colour = texture2D(picture, vec2(uv.x, 1.0 - uv.y)).rgb;
        // Shaded as the CSS did it, in the picture's own (sRGB) values, and written out as they are.
        gl_FragColor = vec4(mix(colour, dimColour, dimAmount), 1.0);
      }`,
  });
  return new Mesh(geometry, material);
}
