/**
 * 3D-Szene für den Startseiten-Hero: schwebende, thematisch passende
 * Objekte (Smartphone mit Mini-Bericht, Uhr, Autoschlüssel, Euro-Münze,
 * Lupe, Preisschild, Prüf-Siegel). Alles prozedural mit three.js erzeugt –
 * keine externen Modelle oder Bilder.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const ORANGE = 0xff7a1a;

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d") as CanvasRenderingContext2D;
  draw(ctx);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

function materials() {
  return {
    orange: new THREE.MeshPhysicalMaterial({ color: ORANGE, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
    black: new THREE.MeshPhysicalMaterial({ color: 0x151515, roughness: 0.32, metalness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.18 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xf2b54a, metalness: 1, roughness: 0.22 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf4f1ec, roughness: 0.35, clearcoat: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.95, thickness: 0.3, roughness: 0.04, ior: 1.45, transparent: true, opacity: 0.9 }),
  };
}
type Mats = ReturnType<typeof materials>;

function phone(m: Mats) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(1.0, 2.05, 0.13, 6, 0.15), m.black));
  // Bildschirm mit Mini-Bericht im DEAL-NIVO-Stil
  const tex = canvasTexture(440, 920, (c) => {
    c.fillStyle = "#0e0e0d";
    c.fillRect(0, 0, 440, 920);
    c.fillStyle = "#ff7a1a";
    roundRect(c, 40, 110, 170, 170, 32);
    c.fill();
    c.fillStyle = "#1a1208";
    c.font = `800 84px ${FONT}`;
    c.textAlign = "center";
    c.fillText("8,4", 125, 215);
    c.font = `600 22px ${FONT}`;
    c.fillText("von 10", 125, 252);
    c.textAlign = "left";
    c.fillStyle = "#f4f1ec";
    c.font = `700 34px ${FONT}`;
    c.fillText("Fairer", 235, 170);
    c.fillText("Preis", 235, 210);
    c.fillStyle = "#3fd58a";
    c.font = `600 24px ${FONT}`;
    c.fillText("● Interessant", 235, 255);
    const rows: [string, string][] = [
      ["Preis", "#3fd58a"],
      ["Zustand", "#ff7a1a"],
      ["Risiken", "#3fd58a"],
      ["Verkäufer", "#3fd58a"],
    ];
    rows.forEach(([label, col], i) => {
      const y = 330 + i * 120;
      c.fillStyle = "#1c1c1b";
      roundRect(c, 40, y, 360, 96, 22);
      c.fill();
      c.fillStyle = "#cfcac2";
      c.font = `600 28px ${FONT}`;
      c.fillText(label, 70, y + 58);
      c.fillStyle = col;
      c.beginPath();
      c.arc(365, y + 48, 12, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = "#ff7a1a";
    roundRect(c, 40, 820, 360, 64, 20);
    c.fill();
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.z = 0.067;
  g.add(screen);
  const island = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.07, 0.01, 2, 0.035), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  island.position.set(0, 0.88, 0.073);
  g.add(island);
  return g;
}

function watch(m: Mats) {
  const g = new THREE.Group();
  const caseM = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.2, 64), m.metal);
  caseM.rotation.x = Math.PI / 2;
  g.add(caseM);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 24, 64), m.orange);
  bezel.position.z = 0.1;
  g.add(bezel);
  const dialTex = canvasTexture(512, 512, (c) => {
    c.fillStyle = "#101010";
    c.beginPath();
    c.arc(256, 256, 256, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 12; i++) {
      c.save();
      c.translate(256, 256);
      c.rotate((i / 12) * Math.PI * 2);
      c.fillStyle = i % 3 === 0 ? "#ff7a1a" : "#e8e4dc";
      c.fillRect(-8, -230, 16, i % 3 === 0 ? 58 : 38);
      c.restore();
    }
    c.strokeStyle = "#e8e4dc";
    c.lineCap = "round";
    c.lineWidth = 16;
    c.beginPath();
    c.moveTo(256, 256);
    c.lineTo(256, 110);
    c.stroke();
    c.lineWidth = 20;
    c.beginPath();
    c.moveTo(256, 256);
    c.lineTo(360, 300);
    c.stroke();
  });
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.44, 64), new THREE.MeshStandardMaterial({ map: dialTex, roughness: 0.4 }));
  dial.position.z = 0.101;
  g.add(dial);
  for (const s of [1, -1]) {
    const strap = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.75, 0.08, 4, 0.04), m.black);
    strap.position.set(0, s * 0.88, -0.02);
    g.add(strap);
  }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 24), m.metal);
  crown.rotation.z = Math.PI / 2;
  crown.position.x = 0.6;
  g.add(crown);
  return g;
}

function carKey(m: Mats) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.7, 1.15, 0.28, 6, 0.2), m.black));
  [0.2, -0.1].forEach((y, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 32), i === 0 ? m.orange : m.white);
    b.rotation.x = Math.PI / 2;
    b.position.set(0, y, 0.15);
    g.add(b);
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 16, 48), m.metal);
  ring.position.set(0, 0.85, 0);
  g.add(ring);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.06), m.metal);
  blade.position.set(0, -0.92, 0);
  g.add(blade);
  return g;
}

function coin(m: Mats) {
  const face = canvasTexture(512, 512, (c) => {
    const grd = c.createRadialGradient(200, 180, 40, 256, 256, 260);
    grd.addColorStop(0, "#ffd889");
    grd.addColorStop(1, "#d89a2c");
    c.fillStyle = grd;
    c.fillRect(0, 0, 512, 512);
    c.strokeStyle = "#b37a17";
    c.lineWidth = 18;
    c.beginPath();
    c.arc(256, 256, 200, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#9c6610";
    c.font = `900 260px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("€", 256, 270);
  });
  const faceMat = new THREE.MeshStandardMaterial({ map: face, metalness: 0.85, roughness: 0.28 });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 64), [m.gold, faceMat, faceMat]);
  mesh.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

function magnifier(m: Mats) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.1, 24, 64), m.black));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 48), m.glass);
  lens.rotation.x = Math.PI / 2;
  g.add(lens);
  const handle = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.85, 0.2, 4, 0.09), m.orange);
  handle.position.set(0.55, -0.78, 0);
  handle.rotation.z = Math.PI / 5;
  g.add(handle);
  return g;
}

function priceTag(m: Mats) {
  const s = new THREE.Shape();
  s.moveTo(-0.45, -0.32);
  s.lineTo(0.35, -0.32);
  s.lineTo(0.7, 0);
  s.lineTo(0.35, 0.32);
  s.lineTo(-0.45, 0.32);
  s.lineTo(-0.45, -0.32);
  const hole = new THREE.Path();
  hole.absarc(0.38, 0, 0.08, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 4 });
  geo.center();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, m.orange));
  const label = canvasTexture(256, 160, (c) => {
    c.fillStyle = "#1a1208";
    c.font = `900 84px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("−8%", 128, 84);
  });
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), new THREE.MeshBasicMaterial({ map: label, transparent: true }));
  txt.position.set(-0.1, 0, 0.09);
  g.add(txt);
  const string = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 8, 32), m.white);
  string.position.set(0.5, 0.1, 0);
  string.rotation.y = Math.PI / 2;
  g.add(string);
  return g;
}

function badge(m: Mats) {
  const s = new THREE.Shape();
  s.moveTo(0, 0.62);
  s.bezierCurveTo(0.25, 0.5, 0.45, 0.48, 0.52, 0.45);
  s.lineTo(0.5, -0.05);
  s.bezierCurveTo(0.45, -0.38, 0.2, -0.55, 0, -0.66);
  s.bezierCurveTo(-0.2, -0.55, -0.45, -0.38, -0.5, -0.05);
  s.lineTo(-0.52, 0.45);
  s.bezierCurveTo(-0.45, 0.48, -0.25, 0.5, 0, 0.62);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 5 });
  geo.center();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, m.black));
  const path = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.22, 0.0, 0), new THREE.Vector3(-0.06, -0.16, 0), new THREE.Vector3(0.24, 0.2, 0)], false, "catmullrom", 0.1);
  const check = new THREE.Mesh(new THREE.TubeGeometry(path, 32, 0.055, 12, false), m.orange);
  check.position.z = 0.12;
  g.add(check);
  for (const p of [path.getPoint(0), path.getPoint(1)]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), m.orange);
    cap.position.set(p.x, p.y, 0.12);
    g.add(cap);
  }
  return g;
}

interface Placed {
  obj: THREE.Group;
  /** Zielposition in normierten Bildschirmkoordinaten (-1..1) */
  nx: number;
  ny: number;
  z: number;
  scale: number;
  baseRot: THREE.Euler;
  spin: number;
  phase: number;
  delay: number;
}

export interface HeroSceneHandle {
  dispose(): void;
}

export function createHeroScene(container: HTMLElement, opts: { reducedMotion: boolean }): HeroSceneHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff1e0, 1.6);
  key.position.set(4, 6, 8);
  scene.add(key);
  const rim = new THREE.PointLight(ORANGE, 30, 20);
  rim.position.set(-5, -3, 3);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const m = materials();
  // Desktop: Objekte rund um die Überschrift; Handy: an den Rändern, teils angeschnitten
  const layout: [() => THREE.Group, number, number, number, number, number, number, number][] = mobile
    ? [
        [() => watch(m), 0.9, 0.74, -0.4, 0.52, 0.5, -0.3, 0.2],
        [() => priceTag(m), 0.94, 0.02, -0.8, 0.48, -0.2, 0.6, -0.5],
        [() => coin(m), -1.02, -0.22, -0.6, 0.42, 0.9, 0.5, -0.3],
        [() => carKey(m), 0.95, -0.5, -0.5, 0.44, 0.2, -0.5, 0.4],
        [() => badge(m), -0.98, -0.8, -0.3, 0.45, 0.2, 0.5, 0.15],
      ]
    : [
        [() => phone(m), 0.66, -0.08, 0.6, 0.95, -0.15, -0.45, 0.08],
        [() => watch(m), -0.72, 0.52, 0, 0.85, 0.5, 0.45, 0.15],
        [() => coin(m), -0.62, -0.5, 0.4, 0.75, 0.9, 0.5, -0.3],
        [() => carKey(m), 0.9, -0.78, -0.4, 0.7, 0.2, -0.6, 0.4],
        [() => magnifier(m), 0.9, 0.62, -1.2, 0.7, 0.2, -0.4, -0.5],
        [() => priceTag(m), -0.88, -0.02, -1, 0.8, -0.2, 0.6, -0.4],
        [() => badge(m), -0.5, 0.84, -1.6, 0.6, 0.2, 0.5, 0.15],
      ];

  const placed: Placed[] = layout.map(([make, nx, ny, z, scale, rx, ry, rz], i) => {
    const obj = make();
    obj.scale.setScalar(scale);
    scene.add(obj);
    return { obj, nx, ny, z, scale, baseRot: new THREE.Euler(rx, ry, rz), spin: (i % 2 ? 1 : -1) * (0.12 + i * 0.02), phase: i * 1.3, delay: 0.15 + i * 0.12 };
  });

  let w = 1;
  let h = 1;
  let viewH = 1;
  let viewW = 1;
  function resize() {
    w = container.clientWidth;
    h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    viewW = viewH * camera.aspect;
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e: PointerEvent) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  const easeOutBack = (x: number) => {
    const c1 = 1.5;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

  const clock = new THREE.Clock();
  let visible = true;
  let raf = 0;

  function frame() {
    const t = opts.reducedMotion ? 10 : clock.getElapsedTime();
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    const scrollShift = Math.min(window.scrollY, h) / h;
    for (const p of placed) {
      const tx = (p.nx * viewW) / 2;
      const ty = (p.ny * viewH) / 2;
      const k = Math.min(1, Math.max(0, (t - p.delay) / 1.1));
      const e = easeOutBack(k);
      const startY = viewH / 2 + 2;
      const floatY = Math.sin(t * 0.9 + p.phase) * 0.1;
      // Parallax: weiter vorne liegende Objekte bewegen sich beim Scrollen stärker
      const parallax = scrollShift * (1.2 + p.z * 0.4) * 1.6;
      p.obj.position.set(tx + pointer.x * 0.15 * (1 + p.z * 0.2), startY + (ty - startY) * e + floatY + parallax, p.z);
      p.obj.rotation.set(
        p.baseRot.x + Math.sin(t * 0.6 + p.phase) * 0.12 + pointer.y * 0.15 + (1 - e) * 1.2,
        p.baseRot.y + t * p.spin * 0.6 + pointer.x * 0.2,
        p.baseRot.z + Math.cos(t * 0.5 + p.phase) * 0.06,
      );
      p.obj.visible = k > 0;
    }
    renderer.render(scene, camera);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (visible && !document.hidden) frame();
  }
  const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
  io.observe(container);

  if (opts.reducedMotion) {
    frame();
    window.addEventListener("scroll", frame, { passive: true });
  } else loop();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", frame);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const mt of mats) {
          (mt as THREE.MeshStandardMaterial).map?.dispose();
          mt.dispose();
        }
      });
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
