"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { formatEur, PRICE_RATING_LABELS } from "@/lib/domain/labels";
import type { MarketValuation } from "@/lib/domain/schemas";
import { cn } from "@/lib/utils";

/**
 * Preis-Wasserwaage: Die Libelle zeigt, wo der Angebotspreis im Vergleich
 * zum Markt liegt (links = günstig, Mitte = fair, rechts = teuer).
 * Beim Erscheinen kippt die Waage und die Blase pendelt sich ein.
 */
export function PriceLevel({ market, compact = false }: { market: MarketValuation; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const known = market.status === "ok" && market.deviationPct != null;
  const dev = known ? Math.max(-30, Math.min(30, market.deviationPct as number)) : 0;
  const pos = 50 + (dev / 30) * 40; // Prozent der Röhrenbreite
  const tilt = known ? (-dev / 30) * 3.5 : 0;
  const zone = !known ? "none" : Math.abs(dev) <= 5 ? "fair" : dev < 0 ? "cheap" : "expensive";

  return (
    <div ref={ref} className={cn("select-none", compact ? "pt-1" : "pt-2")}>
      <motion.div
        className="relative"
        initial={{ rotate: 0 }}
        animate={inView ? { rotate: [0, tilt * 2.2, -tilt * 0.6, tilt] } : {}}
        transition={{ duration: 1.6, times: [0, 0.35, 0.7, 1], ease: "easeInOut" }}
        style={{ transformOrigin: "50% 50%" }}
      >
        {/* Körper der Wasserwaage */}
        <div className="relative h-14 rounded-2xl bg-[linear-gradient(180deg,oklch(0.32_0.005_60),oklch(0.2_0.004_60))] p-2 shadow-[inset_0_1px_0_oklch(1_0_0/0.12),0_8px_20px_-8px_oklch(0_0_0/0.6)] ring-1 ring-black/40">
          {/* Libelle (Röhre) */}
          <div className="relative h-full overflow-hidden rounded-full bg-[linear-gradient(180deg,oklch(0.95_0.15_100),var(--accent)_45%,oklch(0.75_0.16_95))] shadow-[inset_0_2px_6px_oklch(0_0_0/0.35)]">
            <div className="absolute inset-x-3 top-1 h-1.5 rounded-full bg-white/45" />
            {/* Markierungen „fair“ */}
            <div className="absolute inset-y-1 left-[calc(50%-14%)] w-0.5 rounded bg-black/55" />
            <div className="absolute inset-y-1 left-[calc(50%+14%)] w-0.5 rounded bg-black/55" />
            {/* Blase */}
            <motion.div
              className={cn("absolute top-1/2 h-[70%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full", known ? "bg-white/85" : "bg-white/40")}
              style={{ boxShadow: "inset -3px -3px 6px oklch(0.7 0.1 100 / 0.6), inset 3px 3px 6px white" }}
              initial={{ left: "50%" }}
              animate={inView ? { left: known ? ["50%", `${100 - pos}%`, `${pos + (pos - 50) * 0.25}%`, `${pos}%`] : ["50%", "38%", "62%", "50%"] } : {}}
              transition={{ duration: 1.7, times: [0, 0.35, 0.72, 1], ease: "easeInOut" }}
            />
          </div>
        </div>
      </motion.div>

      {/* Skala */}
      <div className="relative mt-2 h-4">
        {Array.from({ length: 21 }, (_, i) => (
          <span key={i} className={cn("absolute top-0 w-px bg-muted/60", i % 5 === 0 ? "h-3" : "h-1.5")} style={{ left: `${5 + i * 4.5}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-3 text-[11px] font-medium uppercase tracking-wide">
        <span className={cn("text-left", zone === "cheap" ? "text-good" : "text-muted")}>Günstig</span>
        <span className={cn("text-center", zone === "fair" ? "text-accent" : "text-muted")}>Fair</span>
        <span className={cn("text-right", zone === "expensive" ? "text-bad" : "text-muted")}>Teuer</span>
      </div>
      {!compact && (
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
      )}
    </div>
  );
}
