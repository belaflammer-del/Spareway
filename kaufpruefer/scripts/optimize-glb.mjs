// Komprimiert 3D-Modelle (GLB) für das Web:
// Duplikate entfernen, Geometrie vereinfachen, Texturen auf max. 1024 px als WebP,
// Meshopt-Kompression. Aufruf: node scripts/optimize-glb.mjs <eingabe.glb> <ausgabe.glb> [ratio] [texturgröße]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const [, , input, output, ratioArg, texArg] = process.argv;
const tex = Number(texArg ?? 512);
const ratio = Number(ratioArg ?? 0.5);
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(input);
await doc.transform(
  dedup(),
  prune(),
  resample(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: Number(process.env.SIMPLIFY_ERROR ?? 0.004) }),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [tex, tex], quality: 82 }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write(output, doc);
console.log(`${input} → ${output}`);
