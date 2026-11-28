"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { HandCoins, PartyPopper, ShieldCheck, ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { savedFor } from "@/lib/akte/savings";
import type { AkteViewModel } from "@/lib/akte/view-model";
import { haptic } from "@/lib/client/haptics";
import { postJson } from "@/lib/client/jobs";
import { formatEur } from "@/lib/domain/labels";

/** Zählt einen Eurobetrag sanft hoch. */
export function CountUpEur({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => formatEur(Math.round(v)));
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span className={className}>{text}</motion.span>;
}

function parseEur(s: string): number | null {
  const n = Number(s.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** „Wie ist es ausgegangen?“ – Grundlage für den Gespart-Zähler. */
export function OutcomeCard({ vm }: { vm: AkteViewModel }) {
  const router = useRouter();
  const o = vm.outcome;
  const [mode, setMode] = useState<"idle" | "price">("idle");
  const [price, setPrice] = useState(vm.askingEur ? String(Math.round(vm.askingEur)) : "");
  const [busy, setBusy] = useState(false);

  async function save(status: "bought" | "not_bought") {
    const paidEur = status === "bought" ? parseEur(price) : undefined;
    if (status === "bought" && !paidEur) return toast.error("Bitte gib den bezahlten Preis ein.");
    setBusy(true);
    try {
      await postJson(`/api/analyses/${vm.analysisId}/outcome`, { status, paidEur });
      haptic("success");
      setMode("idle");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const saved = o ? savedFor(o) : 0;
  return (
    <section id="s-outcome" className="scroll-mt-20 overflow-hidden rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
          <HandCoins className="size-4" />
        </span>
        <h3 className="flex-1 font-semibold">Wie ist es ausgegangen?</h3>
      </div>

      {o && mode === "idle" ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {o.status === "bought" ? (
            saved > 0 ? (
              <div className="rounded-xl bg-good-soft/40 p-4 text-center ring-1 ring-good/40">
                <PartyPopper className="mx-auto size-6 text-good" />
                <p className="mt-1 text-sm text-muted">Gekauft für {formatEur(o.paidEur)} statt {formatEur(o.askingEur)}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-good">
                  <CountUpEur value={saved} /> gespart
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-surface-2 p-4 text-center">
                <ShoppingBag className="mx-auto size-6 text-accent" />
                <p className="mt-1 font-semibold">Gekauft für {formatEur(o.paidEur)}</p>
                <p className="text-sm text-muted">Viel Freude damit!</p>
              </div>
            )
          ) : (
            <div className="rounded-xl bg-surface-2 p-4 text-center">
              <ShieldCheck className="mx-auto size-6 text-accent" />
              <p className="mt-1 font-semibold">Nicht gekauft</p>
              <p className="text-sm text-muted">{o.recommendation === "elevated_risk" ? "Bei erhöhtem Risiko lieber verzichtet – gute Entscheidung." : "Manchmal ist Abwarten der beste Deal."}</p>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <Link href="/dashboard" className="text-muted underline-offset-2 hover:underline">Gesamt-Ersparnis ansehen</Link>
            <button className="text-muted underline-offset-2 hover:underline" onClick={() => setMode("price")}>Ändern</button>
          </div>
        </motion.div>
      ) : mode === "price" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save("bought");
          }}
        >
          <label className="block text-sm text-muted" htmlFor="paid">Für wie viel hast du es gekauft?</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input id="paid" inputMode="decimal" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} className="pr-8 text-lg font-semibold" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">€</span>
            </div>
            <Button type="submit" disabled={busy}>Speichern</Button>
          </div>
          {vm.askingEur && <p className="text-xs text-muted">Angebotspreis war {formatEur(vm.askingEur)}. Die Differenz zählt als gespart.</p>}
          <div className="flex justify-between">
            <button type="button" className="text-sm text-muted hover:underline" onClick={() => save("not_bought")} disabled={busy}>Doch nicht gekauft</button>
            <button type="button" aria-label="Abbrechen" className="text-muted" onClick={() => setMode("idle")}>
              <X className="size-4" />
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">Sag uns, wie es gelaufen ist – so siehst du, wie viel du mit DEAL-NIVO insgesamt gespart hast.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setMode("price")} disabled={busy}>
              <ShoppingBag className="size-4" /> Gekauft
            </Button>
            <Button variant="outline" onClick={() => save("not_bought")} disabled={busy}>
              <ShieldCheck className="size-4" /> Nicht gekauft
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
