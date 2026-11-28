"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { OrbitHero } from "@/components/home/three-views";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function AnalysisProgress({ ai, seller, status }: { ai: boolean; seller: boolean; status?: string | null }) {
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
        <OrbitHero className="-mx-6 -mt-4 mb-2 h-40" showLabel={false} />
        <p className="text-lg font-semibold tracking-tight">Dein Angebot wird geprüft …</p>
        <p className="mt-1 text-sm text-muted">Das dauert {ai ? "meist 20–60 Sekunden" : "nur einen Moment"}. Bitte lass dieses Fenster geöffnet.</p>
        {status && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">{status}</p>}
        {/* Fortschritt: weicher Balken mit Lichtreflex */}
        <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            initial={{ width: "4%" }}
            animate={{ width: `${Math.round(((i + 0.6) / steps.length) * 100)}%` }}
            transition={{ type: "spring", stiffness: 60, damping: 20 }}
          />
          <motion.div
            className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/50 to-transparent"
            animate={{ left: ["-20%", "110%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <ol className="mt-5 space-y-3">
          {steps.map((s, idx) => (
            <motion.li
              key={s}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 * idx }}
              className={cn("flex items-center gap-3 text-sm transition-colors", idx > i && "text-muted")}
            >
              <span className={cn("relative flex size-6 items-center justify-center rounded-full border transition-colors", idx < i ? "border-good bg-good text-white" : idx === i ? "border-accent" : "border-border")}>
                <AnimatePresence mode="popLayout">
                  {idx < i ? (
                    <motion.span key="ok" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
                      <Check className="size-3.5" />
                    </motion.span>
                  ) : idx === i ? (
                    <motion.span key="run" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <Spinner className="size-3 text-accent" />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                {idx === i && <span className="absolute inset-0 animate-ping rounded-full border border-accent/60" />}
              </span>
              <span className={cn(idx === i && "bg-gradient-to-r from-foreground via-accent to-foreground bg-[length:200%_100%] bg-clip-text font-medium text-transparent [animation:shimmer_2.2s_linear_infinite]")}>{s}</span>
            </motion.li>
          ))}
        </ol>
      </motion.div>
    </div>
  );
}
