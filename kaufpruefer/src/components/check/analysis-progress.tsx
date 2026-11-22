"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { LevelHero } from "@/components/home/three-views";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function AnalysisProgress({ ai, seller }: { ai: boolean; seller: boolean }) {
  const steps = [
    "Daten validieren",
    "Produkt identifizieren",
    "Marktdaten abfragen",
    "Schwachstellen recherchieren",
    ...(ai ? ["Bilder analysieren"] : []),
    ...(seller ? ["Verkäuferbewertungen auswerten"] : []),
    "Risiken bewerten",
    "Bericht erstellen",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(steps.length - 1, x + 1)), ai ? 3200 : 700);
    return () => clearInterval(t);
  }, [ai, steps.length]);
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-4 py-16" role="status" aria-live="polite">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <LevelHero className="-mx-6 -mt-4 mb-2 h-32" showLabel={false} />
        <p className="text-lg font-semibold tracking-tight">Wir bringen deinen Deal ins Lot …</p>
        <p className="mt-1 text-sm text-muted">Das dauert {ai ? "meist 20–60 Sekunden" : "nur einen Moment"}. Bitte lass dieses Fenster geöffnet.</p>
        <ol className="mt-6 space-y-3">
          {steps.map((s, idx) => (
            <li key={s} className={cn("flex items-center gap-3 text-sm transition", idx > i && "text-muted")}>
              <span className={cn("flex size-6 items-center justify-center rounded-full border", idx < i ? "border-good bg-good text-white" : idx === i ? "border-accent" : "border-border")}>
                {idx < i ? <Check className="size-3.5" /> : idx === i ? <Spinner className="size-3 text-accent" /> : null}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </motion.div>
    </div>
  );
}
