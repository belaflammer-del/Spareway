import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/misc";
import { formatEur } from "@/lib/domain/labels";
import { getPricing } from "@/lib/wallet/service";

export const metadata: Metadata = { title: "Preise" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const pricing = await getPricing();
  const included = ["Marktwertanalyse mit Vergleichsdaten", "KI-Bildanalyse mit Belegbildern", "Bekannte Schwachstellen", "Betrugs- & Plausibilitätsprüfung", "Verkäuferanalyse (Screenshots, Aufnahme, Text)", "Deal-Score mit Teilbewertungen", "Checkliste, Nachricht & Verhandlungshilfe", "PDF-Bericht"];
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <SectionTitle eyebrow="Preise" title="Einmal zahlen, wenn du wirklich prüfst" desc="Kein Abo. Tokens werden erst nach bestätigter Zahlung gutgeschrieben – und bei fehlgeschlagenen Analysen automatisch zurückgebucht." />
      <div className="mt-10 grid gap-4 md:grid-cols-4">
        <Card className="p-6">
          <p className="text-sm text-muted">Schnellcheck</p>
          <p className="mt-1 text-3xl font-semibold">0 €</p>
          <p className="mt-2 text-sm text-muted">Grundinformationen und bis zu drei Risikohinweise. Begrenzte Anzahl pro Tag.</p>
          <Button asChild variant="outline" className="mt-6 w-full"><Link href="/check">Starten</Link></Button>
        </Card>
        {pricing.packages.map((p) => (
          <Card key={p.id} className="p-6">
            <p className="text-sm text-muted">{p.label}</p>
            <p className="tabular mt-1 text-3xl font-semibold">{formatEur(p.priceCents / 100)}</p>
            <p className="tabular mt-2 text-sm text-muted">{formatEur(p.priceCents / p.tokens / 100)} pro Kaufcheck</p>
            <Button asChild className="mt-6 w-full"><Link href="/dashboard/wallet">Auswählen</Link></Button>
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-6">
        <p className="font-semibold">Im vollständigen Kaufcheck enthalten</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {included.map((i) => (
            <li key={i} className="flex items-center gap-2 text-sm"><Check className="size-4 text-accent" /> {i}</li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-muted">
          Externe Fahrzeughistorien (per FIN) sind eine separate Zusatzleistung ({formatEur(pricing.vehicleHistoryPriceCents / 100)}), sobald ein Datenanbieter angebunden ist. Alle Preise inkl. MwSt. Hinweis: Diese Preisangaben sind Entwürfe und vor dem kommerziellen Start zu prüfen.
        </p>
      </Card>
    </div>
  );
}
