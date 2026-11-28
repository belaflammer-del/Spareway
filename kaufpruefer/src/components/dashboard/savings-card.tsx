"use client";

import { motion } from "motion/react";
import { PiggyBank } from "lucide-react";
import { CountUpEur } from "@/components/akte/outcome-card";
import type { SavingsSummary } from "@/lib/akte/savings";

/** Gesamt-Ersparnis aus den eigenen Angaben „Gekauft für …“. Nichts geschätzt, nichts erfunden. */
export function SavingsCard({ s }: { s: SavingsSummary }) {
  const empty = s.decided === 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl border border-good/40 bg-gradient-to-br from-good-soft/50 via-surface to-surface p-5"
    >
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-good/15 blur-2xl" />
      <div className="relative flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-good/20 text-good">
          <PiggyBank className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted">Mit DEAL-NIVO gespart</p>
          {empty ? (
            <p className="mt-1 text-sm">Trag nach einem Kauf im Bericht ein, was du bezahlt hast – hier siehst du dann, wie viel du gespart hast.</p>
          ) : (
            <>
              <p className="tabular mt-0.5 text-4xl font-bold tracking-tight text-good">
                <CountUpEur value={s.savedEur} />
              </p>
              <p className="mt-1 text-xs text-muted">
                {s.bought} {s.bought === 1 ? "Kauf" : "Käufe"}
                {s.avoidedRisky > 0 && ` · ${s.avoidedRisky} riskante${s.avoidedRisky === 1 ? "s Angebot" : " Angebote"} gemieden`}
                {" · "}gerechnet ab Angebotspreis
              </p>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
