"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Drehbares 3D-Modell (z. B. passende Karosserieform), wenn ein Inserat kein
 * Produktfoto hat. Rein dekorativ – kennzeichnet sich als Symbolbild.
 */
export function ModelViewer({ model, className }: { model: import("@/components/home/three-models").ModelName; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const c = document.createElement("canvas");
        if (!(c.getContext("webgl2") || c.getContext("webgl"))) return;
      } catch {
        return;
      }
      const THREE = await import("three");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      const { loadModel, normalize } = await import("@/components/home/three-models");
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      const keyL = new THREE.DirectionalLight(0xffffff, 1.6);
      keyL.position.set(3, 5, 4);
      scene.add(keyL);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
      const obj = normalize(await loadModel(model));
      if (disposed) return;
      const pivot = new THREE.Group();
      pivot.add(obj);
      scene.add(pivot);
      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.position.set(0, 0.45, 2.6 / Math.min(1, camera.aspect * 1.1));
        camera.lookAt(0, -0.02, 0);
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      // Ziehen zum Drehen, sonst langsame Eigenrotation
      let drag: number | null = null;
      let vel = 0.35;
      let rot = 0.7;
      const down = (e: PointerEvent) => (drag = e.clientX);
      const move = (e: PointerEvent) => {
        if (drag == null) return;
        vel = (e.clientX - drag) * 0.6;
        rot += (e.clientX - drag) * 0.01;
        drag = e.clientX;
      };
      const up = () => {
        drag = null;
        vel = Math.sign(vel || 1) * 0.35;
      };
      el.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const clock = new THREE.Clock();
      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, clock.getDelta());
        if (drag == null && !reduced) rot += dt * vel;
        pivot.rotation.y = rot;
        renderer.render(scene, camera);
      };
      loop();
      setReady(true);
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        el.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [model]);
  return (
    <div ref={ref} className={cn("relative touch-pan-y", className)} aria-label="3D-Symbolbild">
      {!ready && <div className="absolute inset-0 animate-pulse rounded-2xl bg-surface-2/60" />}
      {ready && <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] uppercase tracking-wider text-muted">Symbolbild · ziehen zum Drehen</span>}
    </div>
  );
}
