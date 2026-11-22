"use client";

import { useEffect, useRef } from "react";

/** Lädt die 3D-Szene erst im Browser (eigenes Bundle, blockiert den ersten Seitenaufbau nicht). */
export function Hero3D() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let handle: { dispose(): void } | null = null;
    let cancelled = false;
    const el = ref.current;
    if (!el) return;
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("./hero-scene").then(({ createHeroScene }) => {
      if (!cancelled && el) handle = createHeroScene(el, { reducedMotion });
    });
    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, []);
  return <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />;
}
