/**
 * Kostenloser Schnellcheck: nur Grundinformationen und wenige Risiken.
 * Keine KI-Kosten, kein Marktwert, keine Bild- oder Verkäuferanalyse.
 */
import type { Listing, MissingInfo, RiskFinding } from "../domain/schemas";
import { detectMissingInfo } from "../engine/missing-info";
import { evaluateRisks } from "../engine/risk";

export interface QuickCheckResult {
  platform: Listing["platform"];
  category: Listing["category"];
  title?: string;
  priceEur?: number;
  missingInfo: MissingInfo[];
  risks: Pick<RiskFinding, "id" | "title" | "severity" | "explanation" | "caveat">[];
  hiddenRiskCount: number;
  lockedSections: string[];
}

export function runQuickCheck(listing: Listing): QuickCheckResult {
  const risks = evaluateRisks({ listing }).filter((r) => r.severity !== "info");
  const shown = risks.slice(0, 3);
  return {
    platform: listing.platform,
    category: listing.category,
    title: listing.title,
    priceEur: listing.priceEur,
    missingInfo: detectMissingInfo(listing).slice(0, 4),
    risks: shown.map((r) => ({ id: r.id, title: r.title, severity: r.severity, explanation: r.explanation, caveat: r.caveat })),
    hiddenRiskCount: Math.max(0, risks.length - shown.length),
    lockedSections: [
      "Marktwertanalyse mit Vergleichsangeboten",
      "KI-Bildanalyse & sichtbare Auffälligkeiten",
      "Modellspezifische Schwachstellen",
      "Verkäuferanalyse",
      "Deal-Score mit Teilbewertungen",
      "Individuelle Checkliste, Nachricht & Verhandlungshilfe",
      "PDF-Bericht",
    ],
  };
}
