import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/misc";
import { GUARDIAN_SERVICES, INCLUDED_SERVICES, perCheckEur } from "@/lib/config/pricing";
import { getStore } from "@/lib/store";
import { formatEur } from "@/lib/domain/labels";
import { getPricing } from "@/lib/wallet/service";

export const metadata: Metadata = { title: "Preise" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const pricing = await getPricing();
  const cfgAll = await getStore().getConfig();
  const guardian = cfgAll.guardian;
  const watchCost = cfgAll.watch?.tokenCost ?? 1;
  const watchDays = cfgAll.watch?.periodDays ?? 60;
  const packages = [...pricing.packages].sort((a, b) => a.tokens - b.tokens);
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <SectionTitle
        eyebrow="Preise"
        title="Transparent und ohne Abo"
        desc="1 Token = 1 vollständiger Kaufcheck. Tokens werden erst nach bestätigter Zahlung gutgeschrieben und bei fehlgeschlagenen Analysen automatisch zurückgebucht."
      />
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        <Card className="flex flex-col p-6">
          <p className="text-sm font-semibold">Schnellcheck</p>
          <p className="mt-2 text-3xl font-bold">0 €</p>
          <p className="mt-1 text-sm text-muted">Grundinformationen und bis zu drei Risikohinweise, begrenzt pro Tag.</p>
          <Button asChild variant="outline" className="mt-auto w-full">
            <Link href="/check">Starten</Link>
          </Button>
        </Card>
        {packages.map((p) => (
          <Card key={p.id} className="flex flex-col p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{p.tokens === 1 ? "Einzelcheck" : `${p.tokens}er-Paket`}</p>
              {p.tokens > 1 && <Badge>{p.tokens} Tokens</Badge>}
            </div>
            <p className="tabular mt-2 text-3xl font-bold">{formatEur(p.priceCents / 100)}</p>
            <p className="tabular mt-1 text-sm text-muted">
              {p.tokens === 1 ? "1 Token · 1 vollständiger Kaufcheck" : `${p.tokens} Kaufchecks · entspricht ca. ${formatEur(perCheckEur(p))} pro Check`}
            </p>
            <Button asChild className="mt-6 w-full">
              <Link href="/dashboard/wallet">Auswählen</Link>
            </Button>
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-6">
        <p className="font-semibold">In jedem Kaufcheck enthalten</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {INCLUDED_SERVICES.map((i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <Check className="size-4 text-accent" /> {i}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-muted">
          Angebot beobachten (Preisalarm, Änderungen mit Zusammenfassung): {watchCost} Token je {watchDays} Tage, jederzeit beendbar, keine automatische Verlängerung. Alle Preise inkl. MwSt. Externe Fahrzeughistorien (per FIN) wären eine separate Zusatzleistung ({formatEur(pricing.vehicleHistoryPriceCents / 100)}), sobald ein Datenanbieter angebunden ist. Keine Streichpreise, keine automatischen Verlängerungen.
        </p>
      </Card>
      {guardian?.enabled && (
        <Card className="mt-6 border-dashed p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Guardian – dein Kaufbegleiter</p>
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">In Vorbereitung · noch nicht buchbar</span>
          </div>
          <p className="mt-1 text-sm text-muted">Geplant: ca. {formatEur((guardian.priceCents ?? 1499) / 100)} pro Kaufakte, inkl. {guardian.chatChecks ?? 3} Chatprüfungen.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {GUARDIAN_SERVICES.map((i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Check className="size-4 text-accent" /> {i}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
