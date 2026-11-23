"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { formatEur, PRICE_RATING_LABELS } from "@/lib/domain/labels";
import type { MarketValuation } from "@/lib/domain/schemas";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  { label: "Sehr günstig", cls: "bg-good" },
  { label: "Günstig", cls: "bg-good/70" },
  { label: "Fair", cls: "bg-accent" },
  { label: "Eher teuer", cls: "bg-warn" },
  { label: "Teuer", cls: "bg-bad" },
];

/**
 * Preis-Skala: Eine Markierung mit dem Angebotspreis gleitet an die Stelle,
 * an der das Angebot im Vergleich zum Markt liegt. Ohne belastbare
 * Marktdaten bleibt die Skala grau – es wird nichts geschätzt.
 */
export function PriceScale({ market }: { market: MarketValuation }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const known = market.status === "ok" && market.deviationPct != null;
  const dev = known ? Math.max(-30, Math.min(30, market.deviationPct as number)) : 0;
  // Segmentgrenzen = Bewertungsschwellen (−15 / −5 / +5 / +15 %), stückweise linear
  const stops: [number, number][] = [[-30, 3], [-15, 20], [-5, 40], [5, 60], [15, 80], [30, 97]];
  let pos = 50;
  for (let i = 1; i < stops.length; i++) {
    const [d0, p0] = stops[i - 1];
    const [d1, p1] = stops[i];
    if (dev <= d1) {
      pos = p0 + ((dev - d0) / (d1 - d0)) * (p1 - p0);
      break;
    }
  }

  return (
    <div ref={ref} className="select-none">
      <div className="relative pt-9">
        {/* Markierung mit Angebotspreis */}
        {known && (
          <motion.div
            className="absolute top-0 -translate-x-1/2"
            initial={{ left: "4%", opacity: 0 }}
            animate={inView ? { left: `${pos}%`, opacity: 1 } : {}}
            transition={{ type: "spring", stiffness: 70, damping: 12, delay: 0.15 }}
          >
            <div className="whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-bold text-background tabular">{formatEur(market.offerPriceEur, { compact: true })}</div>
            <div className="mx-auto h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-foreground" />
          </motion.div>
        )}
        <div className={cn("flex h-3 gap-1 overflow-hidden rounded-full", !known && "opacity-30 grayscale")}>
          {SEGMENTS.map((s, i) => (
            <motion.div
              key={s.label}
              className={cn("h-full flex-1", s.cls)}
              initial={{ scaleX: 0 }}
              animate={inView ? { scaleX: 1 } : {}}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              style={{ originX: 0 }}
            />
          ))}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-5 text-center text-[10px] font-medium uppercase tracking-wide text-muted">
        {SEGMENTS.map((s) => (
          <span key={s.label}>{s.label}</span>
        ))}
      </div>
      <p className="mt-2 text-center text-sm">
        {known ? (
          <>
            <span className="font-semibold">{PRICE_RATING_LABELS[market.rating]}</span>
            <span className="text-muted">
              {" "}· {market.deviationPct! > 0 ? "+" : ""}
              {market.deviationPct} % zum Markt{market.range ? ` (Ø ${formatEur(market.range.median)})` : ""}
            </span>
          </>
        ) : (
          <span className="text-muted">Kein verlässlicher Marktwert – zu wenige Vergleichsdaten</span>
        )}
      </p>
    </div>
  );
}
