/**
 * Angebotsvergleich – rein aus bereits vorhandenen, belegten Berichtsdaten.
 * Keine neuen Fakten, keine erfundenen Eigenschaften.
 */
import { formatEur, PRICE_RATING_LABELS } from "../domain/labels";
import type { AnalysisReport } from "../domain/schemas";

export interface ComparisonResult {
  points: string[];
  winner: "a" | "b" | "none";
  verdict: string;
}

function name(r: AnalysisReport, fallback: string) {
  return (r.listing.title ?? [r.listing.brand, r.listing.model].filter(Boolean).join(" ")).replace(/\s*\(Demo\)$/, "") || fallback;
}

export function compareReports(a: AnalysisReport, b: AnalysisReport): ComparisonResult {
  const A = name(a, "Angebot A");
  const B = name(b, "Angebot B");
  const points: string[] = [];

  if (a.listing.priceEur != null && b.listing.priceEur != null && a.listing.priceEur !== b.listing.priceEur) {
    const cheaper = a.listing.priceEur < b.listing.priceEur ? "A" : "B";
    points.push(`Angebot ${cheaper} ist ${formatEur(Math.abs(a.listing.priceEur - b.listing.priceEur))} günstiger.`);
  }
  if (a.market.status === "ok" && b.market.status === "ok" && a.market.deviationPct != null && b.market.deviationPct != null) {
    points.push(`Im Marktvergleich: A ${PRICE_RATING_LABELS[a.market.rating]} (${a.market.deviationPct > 0 ? "+" : ""}${a.market.deviationPct} %), B ${PRICE_RATING_LABELS[b.market.rating]} (${b.market.deviationPct > 0 ? "+" : ""}${b.market.deviationPct} %).`);
  } else if (a.market.status !== b.market.status) {
    points.push(`Nur für Angebot ${a.market.status === "ok" ? "A" : "B"} liegt ein belastbarer Marktvergleich vor.`);
  }
  if (a.listing.mileageKm != null && b.listing.mileageKm != null && Math.abs(a.listing.mileageKm - b.listing.mileageKm) >= 5000) {
    const lower = a.listing.mileageKm < b.listing.mileageKm ? "A" : "B";
    points.push(`Angebot ${lower} hat ${Math.abs(a.listing.mileageKm - b.listing.mileageKm).toLocaleString("de-DE")} km weniger Laufleistung.`);
  }
  if (a.listing.year != null && b.listing.year != null && a.listing.year !== b.listing.year) {
    points.push(`Angebot ${a.listing.year > b.listing.year ? "A" : "B"} ist ${Math.abs(a.listing.year - b.listing.year)} Jahr(e) jünger.`);
  }
  const hasService = (r: AnalysisReport) => !!r.listing.serviceHistory && !/^(nein|keine?|unbekannt)/i.test(r.listing.serviceHistory);
  if (a.listing.category === "vehicle" && hasService(a) !== hasService(b)) points.push(`Nur Angebot ${hasService(a) ? "A" : "B"} nennt Wartungsnachweise.`);
  const serious = (r: AnalysisReport) => r.risks.filter((x) => x.severity === "high" || x.severity === "medium").length;
  if (serious(a) !== serious(b)) points.push(`Angebot ${serious(a) < serious(b) ? "A" : "B"} hat weniger relevante Risikohinweise (${Math.min(serious(a), serious(b))} statt ${Math.max(serious(a), serious(b))}).`);
  if (a.seller && b.seller) {
    points.push(`Verkäuferbewertungen: A ${a.seller.positive}/${a.seller.visibleReviewCount} positiv, B ${b.seller.positive}/${b.seller.visibleReviewCount} positiv (nur erfasste Bewertungen).`);
  }
  if (Math.abs(a.dataQuality.score - b.dataQuality.score) >= 15) points.push(`Für Angebot ${a.dataQuality.score > b.dataQuality.score ? "A" : "B"} liegen deutlich mehr Informationen vor.`);

  let winner: ComparisonResult["winner"] = "none";
  let verdict: string;
  const sa = a.score.overall;
  const sb = b.score.overall;
  if (sa == null || sb == null) {
    verdict = "Für mindestens ein Angebot fehlen wesentliche Informationen – eine belastbare Empfehlung ist noch nicht möglich.";
  } else if (Math.abs(sa - sb) < 5) {
    verdict = `Beide Angebote liegen nah beieinander (${(sa / 10).toFixed(1).replace(".", ",")} vs. ${(sb / 10).toFixed(1).replace(".", ",")}). Entscheide anhand der Besichtigung und der offenen Punkte.`;
  } else {
    winner = sa > sb ? "a" : "b";
    const w = winner === "a" ? A : B;
    verdict = `${w} schneidet nach den vorliegenden Daten besser ab (Deal-Score ${(Math.max(sa, sb) / 10).toFixed(1).replace(".", ",")} vs. ${(Math.min(sa, sb) / 10).toFixed(1).replace(".", ",")}).`;
  }
  if (winner !== "none" && serious(winner === "a" ? a : b) > 0) verdict += " Beachte trotzdem die Risikohinweise.";
  return { points: points.slice(0, 7), winner, verdict };
}
