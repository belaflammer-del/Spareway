import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/misc";

export const metadata: Metadata = { title: "So bewerten wir" };

const BLOCKS = [
  { t: "Marktwert", d: "Nur aus echten Vergleichsdaten (lizenzierter Anbieter oder von dir hinterlegte Vergleichsangebote). Ausreißer werden per IQR-Regel entfernt, tatsächlich erzielte Verkaufspreise stärker gewichtet als Inseratspreise. Bei Fahrzeugen schätzen wir die Wirkung von Baujahr und Laufleistung aus den Vergleichsdaten selbst. Unter fünf verwertbaren Vergleichen: „Marktwert derzeit nicht verlässlich bestimmbar“." },
  { t: "Preisbewertung", d: "Abweichung vom gewichteten Median: bis −15 % sehr guter Preis, bis −5 % guter Preis, ±5 % fair, bis +15 % eher teuer, darüber deutlich über Marktwert." },
  { t: "Bildanalyse", d: "Die KI ordnet jede Beobachtung einer Evidenzstufe zu: sichtbar belegt, mögliche Auffälligkeit oder nicht überprüfbar. Aussagen ohne Bildbezug werden nie als „sichtbar belegt“ gewertet." },
  { t: "Schwachstellen", d: "Geprüfte Einträge der Wissensdatenbank mit Quelle und Prüfdatum werden als solche gekennzeichnet. Hinweise aus allgemeinem KI-Modellwissen erscheinen ausdrücklich als „nicht verifiziert“ und müssen zur konkreten Variante passen." },
  { t: "Risiken", d: "Deterministische Regeln (z. B. riskante Zahlungswege, Widersprüche, fehlende Angaben) mit Belegen. Ein günstiger Preis oder ein niedriger Kilometerstand allein ist nie ein Betrugsnachweis." },
  { t: "Verkäufer", d: "Bewertungen werden dedupliziert, kategorisiert und gezählt. Wir zeigen immer, wie viele Bewertungen tatsächlich erkannt wurden, und unterscheiden Behauptungen anderer Käufer von Tatsachen." },
  { t: "Deal-Score", d: "Gewichtet aus Preis (35 %), Produkt (30 %), Verkäufer (15 %) und Plausibilität (20 %). Fehlende Bereiche werden nicht positiv angerechnet, sondern begrenzen den Score. Ohne ausreichende Datenbasis wird kein Score berechnet." },
  { t: "Sicherheit", d: "Inseratstexte, Bewertungen und Bilder sind nicht vertrauenswürdige Eingaben. Darin enthaltene Anweisungen an KI-Systeme werden ignoriert und als Auffälligkeit gemeldet." },
];

export default function MethodPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <SectionTitle eyebrow="Methodik" title="So bewertet Kaufklar Angebote" desc="Nachvollziehbare Regeln statt Blackbox. Die KI arbeitet im Hintergrund – Preise und Scores berechnet eine transparente Regel-Engine." />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {BLOCKS.map((b) => (
          <Card key={b.t} className="p-5">
            <h2 className="font-semibold">{b.t}</h2>
            <p className="mt-1.5 text-sm text-muted">{b.d}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
