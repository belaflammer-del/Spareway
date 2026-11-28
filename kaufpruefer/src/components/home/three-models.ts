/**
 * Hochwertige 3D-Modelle (Meshy, komprimiert mit Meshopt + WebP) aus /public/models.
 * Werden nachgeladen und zwischengespeichert; bis dahin zeigen die Szenen das
 * schlichte Code-Objekt als Platzhalter.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export type { ModelName } from "./model-choice";
import type { ModelName } from "./model-choice";
const cache = new Map<ModelName, Promise<THREE.Group>>();
const VEHICLES: ModelName[] = ["kombi", "limousine", "suv", "sportwagen", "kleinwagen", "motorrad", "roller"];
let loader: GLTFLoader | null = null;

function getLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

/** Lädt ein Modell einmalig; jeder Aufruf erhält eine eigene Kopie (Geometrie/Texturen geteilt). */
export async function loadModel(name: ModelName): Promise<THREE.Group> {
  let p = cache.get(name);
  if (!p) {
    p = getLoader()
      .loadAsync(`/models/${name}.glb`)
      .then((gltf) => {
        const root = gltf.scene;
        const vehicle = VEHICLES.includes(name);
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
          const next = mats.map((mt) => {
            if (mt.map) mt.map.anisotropy = 4;
            mt.envMapIntensity = 1.15;
            if (!vehicle) return mt;
            // KI-Texturen haben fleckige Rauheit → glatterer Lack mit Klarlack-Schicht
            const pm = new THREE.MeshPhysicalMaterial();
            THREE.MeshStandardMaterial.prototype.copy.call(pm, mt);
            pm.roughness = 0.6;
            pm.clearcoat = 0.6;
            pm.clearcoatRoughness = 0.08;
            return pm;
          });
          mesh.material = Array.isArray(mesh.material) ? next : next[0];
        });
        return root;
      });
    cache.set(name, p);
  }
  return (await p).clone(true);
}

/** Modell zentrieren und auf Einheitsgröße bringen (größte Kante = 1). */
export function normalize(obj: THREE.Object3D): THREE.Group {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  obj.position.sub(box.getCenter(new THREE.Vector3()));
  const wrap = new THREE.Group();
  wrap.add(obj);
  wrap.scale.setScalar(1 / Math.max(size.x, size.y, size.z, 0.0001));
  const g = new THREE.Group();
  g.add(wrap);
  return g;
}

