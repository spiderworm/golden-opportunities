// Turns Tripo's GLB exports into the station's models, the way the studio
// does for its items (games-studio research/tripo-items.ts): colour texture
// only, as webp, every node's transform baked in, centered, resting on y = 0
// and facing +z as Tripo exports them. Rigged models keep their skeleton and
// animations, and only have their textures shrunk.
//
// It borrows the studio's installed gltf-transform and sharp rather than add
// them to this app:
//   STUDIO=~/Projects/games-studio/research/prototypes/cubeberg \
//     node research/station-assets/process.mjs <exports dir> [models dir] [texture px]
// Writes <models dir>/<name>.glb: public/models/station/ unless another is
// given (the Decide bosses go to public/models/bosses/, at 1024 px).
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const studio = (process.env.STUDIO ?? "~/Projects/games-studio/research/prototypes/cubeberg").replace(/^~/, homedir());
const studioRequire = createRequire(join(studio, "package.json"));
const load = (name) => import(pathToFileURL(studioRequire.resolve(name)).href);
const { NodeIO } = await load("@gltf-transform/core");
const { ALL_EXTENSIONS } = await load("@gltf-transform/extensions");
const { dedup, getBounds, prune, resample, textureCompress, transformMesh, weld } = await load("@gltf-transform/functions");
const sharp = (await load("sharp")).default;

/** The longest side of each model's colour texture. Big, close-up things get more. */
const TEXTURE = { "station-exterior": 1024, "shelf-unit": 1024, counter: 1024 };
const [input, models = "public/models/station", texture = "512"] = process.argv.slice(2);
const DEFAULT_TEXTURE = Number(texture);

if (!input) throw new Error("usage: process.mjs <dir of Tripo GLB exports> [models dir] [texture px]");
const out = new URL(`../../${models.replace(/\/?$/, "/")}`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const file of readdirSync(input).filter((f) => f.endsWith(".glb"))) {
  const name = basename(file, ".glb");
  const doc = await io.read(join(input, file));
  const root = doc.getRoot();
  const rigged = root.listSkins().length > 0;
  for (const m of root.listMaterials()) {
    m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    m.setMetallicFactor(0).setRoughnessFactor(0.6);
  }
  if (!rigged) {
    for (const node of root.listNodes()) {
      const mesh = node.getMesh();
      if (mesh) transformMesh(mesh, node.getWorldMatrix());
      node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
    }
    const b = getBounds(root.getDefaultScene() ?? root.listScenes()[0]);
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    for (const mesh of root.listMeshes()) transformMesh(mesh, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -cx, -b.min[1], -cz, 1]);
  }
  const size = TEXTURE[name] ?? DEFAULT_TEXTURE;
  await doc.transform(
    prune(),
    dedup(),
    ...(rigged ? [resample()] : [weld()]),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [size, size], quality: 82 }),
  );
  await io.write(join(out, `${name}.glb`), doc);
  const tris = root.listMeshes().reduce((n, me) => n + me.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  const b = getBounds(root.getDefaultScene() ?? root.listScenes()[0]);
  const dims = [0, 1, 2].map((i) => +(b.max[i] - b.min[i]).toFixed(3));
  const clips = root.listAnimations().map((a) => a.getName());
  console.log(`${name}: ${tris} triangles, ${Math.round(statSync(join(out, `${name}.glb`)).size / 1024)} KB, size ${dims.join(" x ")}${clips.length ? `, clips ${clips.join(", ")}` : ""}`);
}
