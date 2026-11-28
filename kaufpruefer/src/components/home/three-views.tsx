"use client";

import { Car, Gamepad2, Package, Shirt, Smartphone, Watch, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 3D-Karussell: Produkte kreisen um den Prüf-Ring; das vordere wird „geprüft“. */
export function OrbitHero({ className, showLabel = true }: { className?: string; showLabel?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [front, setFront] = useState<number | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !webglAvailable()) return;
    let handle: { dispose(): void } | null = null;
    let cancelled = false;
    import("./three-scenes").then(({ createOrbitScene, ORBIT_LABELS }) => {
      if (cancelled) return;
      setLabels(ORBIT_LABELS);
      handle = createOrbitScene(el, { reducedMotion: reduced(), onFront: setFront });
    });
    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, []);
  return (
    <div className={cn("relative", className)}>
      <div ref={ref} aria-hidden className="absolute inset-0" />
      {showLabel && front != null && labels[front] && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
          <span key={front} className="animate-[fadeUp_.4s_ease-out] rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-fg shadow-lg shadow-accent/20">
            {labels[front]} geprüft ✓
          </span>
        </div>
      )}
    </div>
  );
}

export type GridObject = "carKey" | "phone" | "tshirt" | "watch" | "gamepad" | "parcel";

const CATEGORY_ITEMS: { key: string; label: string; object: GridObject; model?: import("./three-models").ModelName; icon: LucideIcon }[] = [
  { key: "vehicle", label: "Autos", object: "carKey", model: "sportwagen", icon: Car },
  { key: "electronics", label: "Elektronik", object: "phone", model: "smartphone", icon: Smartphone },
  { key: "fashion", label: "Mode", object: "tshirt", model: "jacke", icon: Shirt },
  { key: "watches", label: "Uhren", object: "watch", model: "uhr", icon: Watch },
  { key: "gaming", label: "Gaming", object: "gamepad", model: "controller", icon: Gamepad2 },
  { key: "other", label: "Sonstiges", object: "parcel", icon: Package },
];

/** Kategorie-Kacheln mit je einem drehenden 3D-Objekt (eine gemeinsame WebGL-Fläche). */
export function CategoryGrid3D() {
  const items = CATEGORY_ITEMS;
  const wrap = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const tiles = useRef<(HTMLLIElement | null)[]>([]);
  const [has3d, setHas3d] = useState(false);
  useEffect(() => {
    const host = canvasHost.current;
    if (!host || !webglAvailable()) return;
    let handle: { dispose(): void } | null = null;
    let cancelled = false;
    Promise.all([import("./three-scenes"), import("./three-objects")]).then(([{ createGridScene }, objs]) => {
      if (cancelled) return;
      const list = items
        .map((it, i) => ({ el: tiles.current[i] as HTMLElement, make: objs[it.object] as (m: import("./three-objects").Mats) => import("three").Group, model: it.model }))
        .filter((x) => x.el);
      handle = createGridScene(host, list, { reducedMotion: reduced() });
      setHas3d(true);
    });
    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, [items]);

  return (
    <div ref={wrap} className="relative">
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-6" aria-label="Kategorien">
        {items.map((it, i) => (
          <li
            key={it.key}
            ref={(el) => {
              tiles.current[i] = el;
            }}
            className="relative flex aspect-square flex-col items-center justify-end rounded-2xl bg-surface pb-3 text-xs font-semibold ring-1 ring-border"
          >
            {!has3d && <it.icon className="absolute top-1/3 size-7 -translate-y-1/2 text-accent" />}
            {it.label}
          </li>
        ))}
      </ul>
      <div ref={canvasHost} aria-hidden className="pointer-events-none absolute inset-0" />
    </div>
  );
}
