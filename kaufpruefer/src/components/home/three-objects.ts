/**
 * Prozedural erzeugte 3D-Objekte (three.js) – keine externen Modelle/Bilder.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export const ACCENT = 0xf0dc1c;
export const ORANGE = 0xff8a1f;

export function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
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

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export function materials() {
  return {
    orange: new THREE.MeshPhysicalMaterial({ color: ACCENT, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
    black: new THREE.MeshPhysicalMaterial({ color: 0x151515, roughness: 0.32, metalness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.18 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xf2b54a, metalness: 1, roughness: 0.22 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf4f1ec, roughness: 0.35, clearcoat: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.95, thickness: 0.3, roughness: 0.04, ior: 1.45, transparent: true, opacity: 0.9 }),
  };
}
export type Mats = ReturnType<typeof materials>;

export function phone(m: Mats) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(1.0, 2.05, 0.13, 6, 0.15), m.black));
  // Bildschirm mit Mini-Bericht im DEAL-NIVO-Stil
  const tex = canvasTexture(440, 920, (c) => {
    c.fillStyle = "#0e0e0d";
    c.fillRect(0, 0, 440, 920);
    c.fillStyle = "#f0dc1c";
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
      ["Zustand", "#ffa23a"],
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
    c.fillStyle = "#f0dc1c";
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

export function watch(m: Mats) {
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
      c.fillStyle = i % 3 === 0 ? "#f0dc1c" : "#e8e4dc";
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

export function carKey(m: Mats) {
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

export function coin(m: Mats) {
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

export function magnifier(m: Mats) {
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

export function priceTag(m: Mats) {
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

export function badge(m: Mats) {
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


export function tshirt(m: Mats) {
  const s = new THREE.Shape();
  s.moveTo(-0.22, 0.62);
  s.quadraticCurveTo(0, 0.5, 0.22, 0.62);
  s.lineTo(0.62, 0.48);
  s.lineTo(0.8, 0.12);
  s.lineTo(0.5, 0.02);
  s.lineTo(0.45, -0.66);
  s.lineTo(-0.45, -0.66);
  s.lineTo(-0.5, 0.02);
  s.lineTo(-0.8, 0.12);
  s.lineTo(-0.62, 0.48);
  s.lineTo(-0.22, 0.62);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 4 });
  geo.center();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, m.white));
  const stripe = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.12, 0.06, 2, 0.03), m.orange);
  stripe.position.set(0, -0.12, 0.11);
  g.add(stripe);
  return g;
}

export function gamepad(m: Mats) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.75, 0.3, 6, 0.3), m.black));
  for (const x of [-0.55, 0.55]) {
    const grip = new THREE.Mesh(new THREE.SphereGeometry(0.33, 32, 24), m.black);
    grip.position.set(x, -0.25, 0);
    grip.scale.set(1, 1.1, 0.75);
    g.add(grip);
  }
  const dpadH = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.09, 0.06, 2, 0.03), m.white);
  const dpadV = dpadH.clone();
  dpadV.rotation.z = Math.PI / 2;
  for (const d of [dpadH, dpadV]) {
    d.position.set(-0.42, 0.05, 0.17);
    g.add(d);
  }
  [[0.42, 0.14], [0.55, 0.02], [0.42, -0.1], [0.29, 0.02]].forEach(([x, y], i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.06, 20), i === 0 ? m.orange : m.white);
    b.rotation.x = Math.PI / 2;
    b.position.set(x, y, 0.17);
    g.add(b);
  });
  return g;
}

export function parcel(m: Mats) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(1, 0.8, 0.8, 4, 0.06), new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.85 })));
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.82, 0.82), m.orange);
  g.add(tape);
  return g;
}

/** Gesteppte Daunenjacke. */
export function jacket(m: Mats, color = 0x1d2a44) {
  const s = new THREE.Shape();
  s.moveTo(-0.2, 0.95);
  s.quadraticCurveTo(0, 0.85, 0.2, 0.95);
  s.lineTo(0.55, 0.86);
  s.quadraticCurveTo(0.78, 0.7, 0.88, 0.2);
  s.lineTo(1.0, -0.75);
  s.lineTo(0.74, -0.8);
  s.lineTo(0.58, -0.05);
  s.lineTo(0.55, -0.95);
  s.lineTo(-0.55, -0.95);
  s.lineTo(-0.58, -0.05);
  s.lineTo(-0.74, -0.8);
  s.lineTo(-1.0, -0.75);
  s.quadraticCurveTo(-0.78, 0.7, -0.55, 0.86);
  s.lineTo(-0.2, 0.95);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 6, curveSegments: 16 });
  geo.center();
  const fabric = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25, sheen: 0.6 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, fabric));
  // Steppnähte
  const seam = new THREE.MeshStandardMaterial({ color: 0x0d1424, roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const y = 0.62 - i * 0.28;
    const w = 1.08 - Math.max(0, 0.62 - y) * 0;
    const band = new THREE.Mesh(new RoundedBoxGeometry(w, 0.025, 0.04, 2, 0.01), seam);
    band.position.set(0, y, 0.31);
    g.add(band);
  }
  const zip = new THREE.Mesh(new RoundedBoxGeometry(0.035, 1.75, 0.03, 2, 0.01), m.metal);
  zip.position.set(0, -0.05, 0.32);
  g.add(zip);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 16, 32, Math.PI), fabric);
  collar.position.set(0, 0.86, 0.05);
  g.add(collar);
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
  patch.position.set(0.74, 0.25, 0.27);
  patch.rotation.y = 0.5;
  g.add(patch);
  return g;
}

/** Spielmodul (Retro-Cartridge) mit Etikett. */
export function cartridge(m: Mats) {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color: 0x3b3f48, roughness: 0.45, clearcoat: 0.5 });
  g.add(new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.3, 0.2, 4, 0.06), shell));
  const label = canvasTexture(512, 400, (c) => {
    const grd = c.createLinearGradient(0, 0, 512, 400);
    grd.addColorStop(0, "#1f9d5c");
    grd.addColorStop(1, "#0d5b36");
    c.fillStyle = grd;
    c.fillRect(0, 0, 512, 400);
    c.fillStyle = "rgba(255,255,255,0.18)";
    c.beginPath();
    c.arc(256, 170, 110, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#eafff3";
    c.font = `900 66px ${FONT}`;
    c.textAlign = "center";
    c.fillText("SMARAGD", 256, 340);
  });
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.76), new THREE.MeshStandardMaterial({ map: label, roughness: 0.4 }));
  lab.position.set(0, 0.12, 0.106);
  g.add(lab);
  const grip = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.12, 0.06, 2, 0.03), m.black);
  grip.position.set(0, -0.5, 0.1);
  g.add(grip);
  return g;
}
