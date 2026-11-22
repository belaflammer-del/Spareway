/**
 * 3D-Szenen:
 *  - createLevelScene: 3D-Wasserwaage, deren Libelle pendelt (Hero, Warte-Bildschirm)
 *  - createGridScene: je ein drehendes 3D-Objekt in den Kategorie-Kacheln
 * Beide pausieren außerhalb des Sichtbereichs und respektieren „Bewegung reduzieren“.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { materials, spiritLevel, type Mats } from "./three-objects";

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

/* ── Wasserwaage ───────────────────────────────────────────── */

export function createLevelScene(
  container: HTMLElement,
  opts: { reducedMotion: boolean; onBubble?: (x: number) => void },
): SceneHandle {
  const { renderer, scene, pmrem } = setup(container);
  const rim = new THREE.PointLight(0xf0dc1c, 18, 14);
  rim.position.set(-3, -2, 3);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0.6, 12);
  camera.lookAt(0, 0, 0);

  const level = spiritLevel(materials());
  scene.add(level);
  const bubble = level.getObjectByName("bubble") as THREE.Mesh;

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Wasserwaage passt immer in die Breite
    const fitDist = (camera.aspect > 1 ? 2.9 : 3.4) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.aspect;
    camera.position.z = Math.max(7, fitDist);
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const pointer = { x: 0, tx: 0, active: 0 };
  const onPointer = (e: PointerEvent) => {
    const r = container.getBoundingClientRect();
    pointer.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    pointer.active = 1;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  // Kippfolge: teuer → günstig → leicht → fair (Pause) – Schleife alle 8 s
  const keys: [number, number][] = [
    [0, 0],
    [1.0, 0.11],
    [2.2, -0.09],
    [3.2, 0.035],
    [4.0, 0],
    [8.0, 0],
  ];
  const tiltAt = (t: number) => {
    const c = t % 8;
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, a0] = keys[i];
      const [t1, a1] = keys[i + 1];
      if (c >= t0 && c <= t1) {
        const k = (c - t0) / (t1 - t0);
        const e = k * k * (3 - 2 * k);
        return a0 + (a1 - a0) * e;
      }
    }
    return 0;
  };

  let bubbleX = 0;
  let bubbleV = 0;
  let lastT = 0;
  let lastReport = 0;
  const frame = (t: number) => {
    const dt = Math.min(0.05, t - lastT || 0.016);
    lastT = t;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.active *= 0.995;
    const auto = tiltAt(t);
    const tilt = auto * (1 - pointer.active * 0.7) + -pointer.x * 0.1 * pointer.active;
    level.rotation.z = tilt;
    level.rotation.y = Math.sin(t * 0.35) * 0.18 - 0.08;
    level.rotation.x = 0.12 + Math.sin(t * 0.5) * 0.03;
    level.position.y = Math.sin(t * 0.8) * 0.06;
    // Blase: gedämpfte Feder, läuft zum höheren Ende
    const target = Math.max(-0.42, Math.min(0.42, tilt * 4.2));
    bubbleV += (target - bubbleX) * 40 * dt;
    bubbleV *= Math.pow(0.02, dt);
    bubbleX += bubbleV * dt;
    bubble.position.x = bubbleX;
    if (opts.onBubble && t - lastReport > 0.15) {
      lastReport = t;
      opts.onBubble(bubbleX / 0.42);
    }
    renderer.render(scene, camera);
  };
  const stop = runLoop(container, frame, opts.reducedMotion);

  return {
    dispose() {
      stop();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
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
