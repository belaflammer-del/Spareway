/**
 * 3D-Szenen:
 *  - createOrbitScene: Produkte kreisen um einen Prüf-Ring (Hero, Warte-Bildschirm)
 *  - createGridScene: je ein drehendes 3D-Objekt in den Kategorie-Kacheln
 * Beide pausieren außerhalb des Sichtbereichs und respektieren „Bewegung reduzieren“.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { badge, carKey, coin, gamepad, materials, phone, tshirt, watch, type Mats } from "./three-objects";

export interface SceneHandle {
  dispose(): void;
}

function setup(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfffaf0, 1.5);
  key.position.set(3, 6, 8);
  scene.add(key);
  return { renderer, scene, pmrem, mobile };
}

function disposeScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer, pmrem: THREE.PMREMGenerator) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mt of mats) {
      (mt as THREE.MeshStandardMaterial).map?.dispose();
      mt.dispose();
    }
  });
  pmrem.dispose();
  renderer.dispose();
  renderer.domElement.remove();
}

function runLoop(container: HTMLElement, frame: (t: number) => void, reducedMotion: boolean) {
  const clock = new THREE.Clock();
  let visible = true;
  let raf = 0;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(container);
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (visible && !document.hidden) frame(reducedMotion ? 0 : clock.getElapsedTime());
  };
  loop();
  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
  };
}

/* ── 3D-Karussell: Produkte kreisen um den Prüf-Ring ─────────── */

export const ORBIT_LABELS = ["Smartphone", "Uhr", "Auto", "Mode", "Konsole", "Preis", "Deal"];

export function createOrbitScene(
  container: HTMLElement,
  opts: { reducedMotion: boolean; onFront?: (index: number) => void },
): SceneHandle {
  const { renderer, scene, pmrem, mobile } = setup(container);
  const rim = new THREE.PointLight(0xf0dc1c, 26, 16);
  rim.position.set(0, -1.5, 3);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  const m = materials();
  const makers = [phone, watch, carKey, tshirt, gamepad, coin, badge];
  const R = 2.6;
  const carousel = new THREE.Group();
  scene.add(carousel);
  const items = makers.map((make, i) => {
    const obj = make(m);
    // auf Einheitsgröße normieren
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    obj.position.sub(box.getCenter(new THREE.Vector3()));
    const holder = new THREE.Group();
    holder.add(obj);
    const unit = 1.75 / Math.max(size.x, size.y, 0.001);
    const a = (i / makers.length) * Math.PI * 2;
    holder.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
    carousel.add(holder);
    return { holder, unit, angle: a, phase: i * 0.8 };
  });

  // Prüf-Ring in der Mitte + Scan-Strahl
  const ringMat = new THREE.MeshPhysicalMaterial({ color: 0xf0dc1c, emissive: 0xf0dc1c, emissiveIntensity: 0.6, roughness: 0.2, clearcoat: 1 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.07, 24, 96), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -1.05;
  scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(R, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: 0xf0dc1c, transparent: true, opacity: 0.25 }));
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = -0.9;
  scene.add(ring2);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xf0dc1c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.035), beamMat);
  beam.position.set(0, 0, R + 0.05);
  scene.add(beam);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.0, 48), new THREE.MeshBasicMaterial({ color: 0xf0dc1c, transparent: true, opacity: 0.08, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -1.08;
  scene.add(glow);

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Karussell passt immer in die Breite
    const dist = Math.max(6.2, (R + 0.7) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect));
    camera.position.set(0, mobile ? 1.3 : 1.6, dist);
    camera.lookAt(0, -0.15, 0);
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  let spinBoost = 0;
  const onPointer = () => (spinBoost = 1);
  container.parentElement?.addEventListener("pointerdown", onPointer);

  let lastFront = -1;
  let rot = 0;
  let lastT = 0;
  const frame = (t: number) => {
    const dt = Math.min(0.05, t - lastT || 0.016);
    lastT = t;
    spinBoost *= 0.97;
    rot += dt * (0.32 + spinBoost * 1.6);
    carousel.rotation.y = opts.reducedMotion ? 0.3 : rot;

    let front = 0;
    let bestZ = -Infinity;
    items.forEach((it, i) => {
      const worldA = it.angle + carousel.rotation.y;
      const z = Math.cos(worldA); // 1 = vorne
      if (z > bestZ) {
        bestZ = z;
        front = i;
      }
      // Auftauchen beim Laden (gestaffelt), vorne leicht größer
      const appear = opts.reducedMotion ? 1 : Math.min(1, Math.max(0, (t - 0.15 - i * 0.12) / 0.6));
      const pop = appear < 1 ? 1 - Math.pow(1 - appear, 3) * Math.cos(appear * 6) : 1;
      const s = it.unit * (0.85 + Math.max(0, z) * 0.3) * pop;
      it.holder.scale.setScalar(Math.max(0.0001, s));
      it.holder.position.y = Math.sin(t * 1.1 + it.phase) * 0.12 + (z > 0.9 ? 0.15 : 0);
      it.holder.rotation.y = -carousel.rotation.y + Math.sin(t * 0.6 + it.phase) * 0.5 + 0.4;
      it.holder.rotation.x = 0.12 + Math.sin(t * 0.8 + it.phase) * 0.08;
    });
    // Scan-Strahl gleitet über das vordere Objekt
    beam.position.y = Math.sin(t * 2.2) * 0.75;
    beamMat.opacity = 0.1 + Math.max(0, bestZ) * 0.15;
    ring.rotation.z = t * 0.4;
    ringMat.emissiveIntensity = 0.45 + Math.sin(t * 2) * 0.15;
    if (front !== lastFront && bestZ > 0.97) {
      lastFront = front;
      opts.onFront?.(front);
    }
    renderer.render(scene, camera);
  };
  const stop = runLoop(container, frame, opts.reducedMotion);

  return {
    dispose() {
      stop();
      ro.disconnect();
      container.parentElement?.removeEventListener("pointerdown", onPointer);
      disposeScene(scene, renderer, pmrem);
    },
  };
}

/* ── Objekte in Kacheln ────────────────────────────────────── */

export function createGridScene(
  container: HTMLElement,
  items: { el: HTMLElement; make: (m: Mats) => THREE.Group }[],
  opts: { reducedMotion: boolean },
): SceneHandle {
  const { renderer, scene, pmrem } = setup(container);
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -100, 100);
  const m = materials();
  const objs = items.map((it, i) => {
    const g = it.make(m);
    // auf Einheitsgröße normieren
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const unit = 1 / Math.max(size.x, size.y, 0.001);
    const wrap = new THREE.Group();
    g.position.sub(box.getCenter(new THREE.Vector3()));
    wrap.add(g);
    scene.add(wrap);
    let hover = 0;
    it.el.addEventListener("pointerenter", () => (hover = 1));
    it.el.addEventListener("pointerleave", () => (hover = 0));
    return { wrap, el: it.el, unit, phase: i * 0.9, hover: () => hover, h: 0 };
  });

  let cw = 1;
  let ch = 1;
  const resize = () => {
    cw = container.clientWidth;
    ch = container.clientHeight;
    renderer.setSize(cw, ch, false);
    camera.left = 0;
    camera.right = cw;
    camera.top = 0;
    camera.bottom = -ch;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const frame = (t: number) => {
    const cr = container.getBoundingClientRect();
    for (const o of objs) {
      const r = o.el.getBoundingClientRect();
      const px = Math.min(r.width, r.height) * 0.42;
      o.h += (o.hover() - o.h) * 0.12;
      o.wrap.position.set(r.left - cr.left + r.width / 2, -(r.top - cr.top + r.height * 0.4), 0);
      o.wrap.scale.setScalar(px * o.unit * (1 + o.h * 0.12));
      o.wrap.rotation.set(0.25 + Math.sin(t * 0.7 + o.phase) * 0.12, t * (0.5 + o.h * 2) + o.phase, Math.sin(t * 0.5 + o.phase) * 0.08);
    }
    renderer.render(scene, camera);
  };
  const stop = runLoop(container, frame, opts.reducedMotion);
  return {
    dispose() {
      stop();
      ro.disconnect();
      disposeScene(scene, renderer, pmrem);
    },
  };
}
