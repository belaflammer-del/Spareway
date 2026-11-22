/**
 * Datenqualität & Deal-Score (0–100)
 *
 * - Ein Score wird nur berechnet, wenn genügend belastbare Informationen vorliegen.
 * - Fehlende Informationen werden NIE positiv gewertet: fehlende Teilbewertungen
 *   werden nicht neutral aufgefüllt, sondern deckeln den Gesamtscore.
 * - Der Score ist eine Orientierung, keine Garantie.
 */
import { CATEGORY_PROFILES } from "../domain/category-profiles";
import type {
  DataQuality,
  DealScore,
  Listing,
  MarketValuation,
  ProductAnalysis,
  Recommendation,
  RiskFinding,
  SellerAnalysis,
  SubScore,
} from "../domain/schemas";
import { clamp } from "../utils";
import { hasValue } from "./missing-info";

export function computeDataQuality(input: {
  listing: Listing;
  market: MarketValuation;
  seller?: SellerAnalysis;
  imagesAnalyzed: boolean;
}): DataQuality {
  const { listing, market, seller } = input;
  const profile = CATEGORY_PROFILES[listing.category];
  const totalWeight = profile.fields.reduce((s, f) => s + f.weight, 0);
  const presentWeight = profile.fields.filter((f) => hasValue(listing, f.field)).reduce((s, f) => s + f.weight, 0);
  const completeness = totalWeight ? presentWeight / totalWeight : 0;

  const gaps: string[] = [];
  const photos = listing.images.filter((i) => i.kind !== "review_screenshot").length;
  const imageFactor = photos === 0 ? 0 : Math.min(1, photos / profile.minImages) * (input.imagesAnalyzed ? 1 : 0.4);
  if (photos === 0) gaps.push("Keine Bilder ausgewertet");
  else if (!input.imagesAnalyzed) gaps.push("Bilder vorhanden, aber nicht automatisch analysiert (KI nicht konfiguriert)");
  else if (photos < profile.minImages) gaps.push(`Nur ${photos} von ${profile.minImages} empfohlenen Ansichten`);

  const marketFactor =
    market.status !== "ok" ? 0 : market.comparables.quality === "high" ? 1 : market.comparables.quality === "medium" ? 0.75 : 0.45;
  if (market.status !== "ok") gaps.push("Keine belastbaren Marktvergleichsdaten");
  else if (market.comparables.soldPrices === 0) gaps.push("Nur Inseratspreise, keine tatsächlichen Verkaufspreise");

  const sellerFactor = seller ? (seller.visibleReviewCount >= 10 ? 1 : seller.visibleReviewCount >= 3 ? 0.6 : 0.3) : 0;
  if (!seller) gaps.push("Verkäufer nicht geprüft");

  const missingCritical = profile.fields.filter((f) => f.importance === "critical" && !hasValue(listing, f.field));
  for (const f of missingCritical) gaps.push(`Fehlt: ${f.question}`);

  // Gewichtung: Angaben 50 %, Bilder 20 %, Markt 20 %, Verkäufer 10 %
  let score = 100 * (0.5 * completeness + 0.2 * imageFactor + 0.2 * marketFactor + 0.1 * sellerFactor);
  if (missingCritical.length > 0) score = Math.min(score, 45);
  score = Math.round(clamp(score, 0, 100));

  const level: DataQuality["level"] = score >= 75 ? "high" : score >= 55 ? "medium" : score >= 35 ? "low" : "insufficient";
  const uncertainty =
    level === "high"
      ? "Geringe Unsicherheit – dennoch keine Garantie für Zustand oder Echtheit."
      : level === "medium"
        ? "Mittlere Unsicherheit – einzelne wichtige Informationen fehlen."
        : level === "low"
          ? "Hohe Unsicherheit – Ergebnis nur als grobe Orientierung nutzen."
          : "Datenlage reicht für eine Gesamtbewertung nicht aus.";
  return { score, level, completeness: Math.round(completeness * 100) / 100, gaps, uncertainty };
}

const SEV_PENALTY = { high: 35, medium: 15, low: 6, info: 0 } as const;

export function scorePrice(market: MarketValuation): SubScore {
  if (market.status !== "ok" || market.rating === "insufficient_data" || market.deviationPct == null) {
    return { score: null, label: "Nicht bewertbar", reasons: ["Keine belastbaren Vergleichsdaten"] };
  }
  // -25 % → 100, 0 % → 70, +25 % → 20
  const d = market.deviationPct;
  // Bis -25 % steigt der Wert; deutlich darunter wird ein Preis nicht weiter
  // belohnt, sondern wegen erhöhter Unsicherheit wieder abgewertet.
  let s = d <= 0 ? 70 + Math.min(30, (-d / 25) * 30) : 70 - Math.min(70, (d / 25) * 50);
  if (d < -25) s = Math.max(45, 100 - (-d - 25) * 3);
  // Unsicherheit der Vergleichsbasis: Extremwerte abschwächen
  const q = market.comparables.quality;
  const shrink = q === "high" ? 1 : q === "medium" ? 0.85 : 0.65;
  s = 60 + (s - 60) * shrink;
  return {
    score: Math.round(clamp(s, 0, 100)),
    label: d <= -5 ? "Günstig" : d <= 5 ? "Marktgerecht" : "Teuer",
    reasons: [`${d > 0 ? "+" : ""}${d} % zum mittleren Vergleichswert`, `Vergleichsbasis: ${market.comparables.used} Angebote (Qualität: ${q})`],
  };
}

export function scoreProduct(listing: Listing, product: ProductAnalysis, imagesAnalyzed: boolean): SubScore {
  const hasCondition = hasValue(listing, "condition");
  if (!hasCondition && !imagesAnalyzed && product.weaknesses.length === 0) {
    return { score: null, label: "Nicht bewertbar", reasons: ["Weder Zustandsangaben noch analysierte Bilder"] };
  }
  let s = 85;
  const reasons: string[] = [];
  for (const f of product.imageFindings) {
    if (f.evidenceLevel === "visible") s -= f.severity === "high" ? 25 : f.severity === "medium" ? 12 : f.severity === "low" ? 4 : 0;
    else if (f.evidenceLevel === "possible") s -= f.severity === "high" ? 10 : f.severity === "medium" ? 5 : 1;
  }
  const vis = product.imageFindings.filter((f) => f.evidenceLevel === "visible" && f.severity !== "info").length;
  if (vis) reasons.push(`${vis} sichtbar belegte Auffälligkeit(en)`);
  for (const w of product.weaknesses) s -= w.severity === "high" ? 6 : w.severity === "medium" ? 3 : 1;
  if (product.weaknesses.length) reasons.push(`${product.weaknesses.length} bekannte Schwachstelle(n) zu prüfen`);
  if (!imagesAnalyzed) {
    s = Math.min(s, 65);
    reasons.push("Bilder nicht analysiert – Bewertung gedeckelt");
  }
  const auth = product.authenticity;
  if (auth?.applicable) {
    const conspicuous = auth.checkedFeatures.filter((f) => f.status === "conspicuous").length;
    s -= conspicuous * 8;
    if (conspicuous) reasons.push(`${conspicuous} auffällige(s) Echtheitsmerkmal(e)`);
    if (s > 70) {
      s = 70;
      reasons.push("Echtheit per Foto nicht bestätigbar – Produktbewertung max. 70");
    }
  }
  if (product.missingViews.length >= 3) {
    s -= 5;
    reasons.push(`${product.missingViews.length} wichtige Ansichten fehlen`);
  }
  return { score: Math.round(clamp(s, 0, 100)), label: s >= 75 ? "Unauffällig" : s >= 55 ? "Prüfen" : "Auffällig", reasons };
}

export function scoreSeller(seller?: SellerAnalysis): SubScore {
  if (!seller || seller.visibleReviewCount < 3) {
    return {
      score: null,
      label: seller ? "Zu wenige Bewertungen" : "Nicht geprüft",
      reasons: [seller ? `Nur ${seller.visibleReviewCount} Bewertung(en) erkannt` : "Verkäuferprüfung nicht durchgeführt"],
    };
  }
  const rated = seller.positive + seller.neutral + seller.negative;
  const posShare = rated ? seller.positive / rated : 0;
  const negShare = rated ? seller.negative / rated : 0;
  let s = 40 + posShare * 55 - negShare * 60;
  const nr = seller.complaints.find((c) => c.category === "not_received")?.count ?? 0;
  const cf = seller.complaints.find((c) => c.category === "counterfeit_suspicion")?.count ?? 0;
  s -= nr * 6 + cf * 6;
  // Kleine Stichprobe → zur Mitte ziehen
  const n = seller.visibleReviewCount;
  const conf = n >= 30 ? 1 : n >= 10 ? 0.8 : 0.55;
  s = 55 + (s - 55) * conf;
  return {
    score: Math.round(clamp(s, 0, 100)),
    label: s >= 75 ? "Vertrauenssignale" : s >= 50 ? "Gemischt" : "Auffällig",
    reasons: [`${seller.positive} positiv · ${seller.neutral} neutral · ${seller.negative} negativ (von ${n} erkannten)`],
  };
}

export function scorePlausibility(risks: RiskFinding[]): SubScore {
  const relevant = risks.filter((r) => r.area !== "seller");
  let s = 95;
  for (const r of relevant) s -= SEV_PENALTY[r.severity];
  const reasons = relevant.filter((r) => r.severity !== "info").map((r) => r.title);
  return {
    score: Math.round(clamp(s, 0, 100)),
    label: s >= 80 ? "Plausibel" : s >= 55 ? "Einzelne Hinweise" : "Auffällig",
    reasons: reasons.length ? reasons : ["Keine Auffälligkeiten durch die Regelprüfung"],
  };
}

export function computeDealScore(input: {
  listing: Listing;
  market: MarketValuation;
  product: ProductAnalysis;
  seller?: SellerAnalysis;
  risks: RiskFinding[];
  dataQuality: DataQuality;
  imagesAnalyzed: boolean;
}): DealScore {
  const price = scorePrice(input.market);
  const product = scoreProduct(input.listing, input.product, input.imagesAnalyzed);
  const seller = scoreSeller(input.seller);
  const plausibility = scorePlausibility(input.risks);
  const caps: string[] = [];

  const hasHigh = input.risks.some((r) => r.severity === "high");
  const hasMedium = input.risks.some((r) => r.severity === "medium");

  // Mindestvoraussetzungen für einen Score
  const enough = input.dataQuality.level !== "insufficient" && (price.score != null || product.score != null);
  if (!enough) {
    return {
      overall: null,
      recommendation: hasHigh ? "elevated_risk" : "missing_info",
      price,
      product,
      seller,
      plausibility,
      caps: [],
      explanation:
        "Für einen belastbaren Deal-Score fehlen wesentliche Informationen. Ergänze die markierten Angaben, lade Bilder hoch oder füge Vergleichsangebote hinzu.",
    };
  }

  const parts: { s: number; w: number }[] = [];
  if (price.score != null) parts.push({ s: price.score, w: 0.35 });
  if (product.score != null) parts.push({ s: product.score, w: 0.3 });
  if (seller.score != null) parts.push({ s: seller.score, w: 0.15 });
  parts.push({ s: plausibility.score as number, w: 0.2 });
  const wSum = parts.reduce((a, p) => a + p.w, 0);
  let overall = parts.reduce((a, p) => a + p.s * p.w, 0) / wSum;

  // Fehlende Teilbewertungen deckeln – niemals positiv auffüllen
  if (price.score == null) {
    overall = Math.min(overall, 70);
    caps.push("Ohne Marktvergleich maximal 70 Punkte");
  }
  if (product.score == null) {
    overall = Math.min(overall, 70);
    caps.push("Ohne Zustandsprüfung maximal 70 Punkte");
  }
  if (seller.score == null) {
    overall = Math.min(overall, 85);
    caps.push("Ohne Verkäuferprüfung maximal 85 Punkte");
  }
  if (input.dataQuality.level === "low") {
    overall = Math.min(overall, 60);
    caps.push("Geringe Datenqualität: maximal 60 Punkte");
  }
  const mediumCount = input.risks.filter((r) => r.severity === "medium").length;
  if (mediumCount >= 2) {
    overall = Math.min(overall, 45);
    caps.push("Mehrere relevante Risikohinweise: maximal 45 Punkte");
  }
  if (plausibility.score != null && plausibility.score < 60) {
    overall = Math.min(overall, plausibility.score + 10);
    caps.push("Geringe Plausibilität begrenzt den Gesamtscore");
  }
  if (hasHigh) {
    overall = Math.min(overall, 35);
    caps.push("Schwerwiegender Risikohinweis: maximal 35 Punkte");
  }
  overall = Math.round(clamp(overall, 0, 100));

  let recommendation: Recommendation;
  if (hasHigh || mediumCount >= 2 || overall < 45) recommendation = "elevated_risk";
  else if (overall >= 75 && !hasMedium && input.dataQuality.level === "high") recommendation = "interesting";
  else recommendation = "inspect_further";

  return {
    overall,
    recommendation,
    price,
    product,
    seller,
    plausibility,
    caps,
    explanation:
      "Gewichteter Wert aus Preis (35 %), Produkt (30 %), Verkäufer (15 %) und Plausibilität (20 %). Nicht bewertbare Bereiche werden nicht positiv angerechnet, sondern begrenzen den Score. Der Score ist eine Orientierung und keine Garantie für Zustand, Echtheit oder Seriosität.",
  };
}
