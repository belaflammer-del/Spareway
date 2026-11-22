/**
 * Market-Valuation-Engine
 *
 * Regelbasierte, nachvollziehbare Bewertung des Angebotspreises auf Basis
 * ECHTER Vergleichsdaten (Marktdaten-Provider oder vom Nutzer hinterlegte
 * Vergleichsangebote). Die KI ist an der Preisfindung NICHT beteiligt.
 *
 * Ohne ausreichende Vergleichsdaten lautet das Ergebnis immer
 * „Marktwert derzeit nicht verlässlich bestimmbar“.
 */
import type { Comparable, Listing, MarketValuation, PriceRating } from "../domain/schemas";
import { nowIso } from "../utils";

export interface ValuationConfig {
  minComparables: number;
  /** Abweichung vom Median → Bewertung (obere Grenzen, als Anteil) */
  thresholds: { veryGood: number; good: number; fair: number; ratherExpensive: number };
  soldPriceWeight: number;
  staleListingDays: number;
  staleListingWeight: number;
  regressionMinComparables: number;
}

export const DEFAULT_VALUATION_CONFIG: ValuationConfig = {
  minComparables: 5,
  thresholds: { veryGood: -0.15, good: -0.05, fair: 0.05, ratherExpensive: 0.15 },
  soldPriceWeight: 1.5,
  staleListingDays: 60,
  staleListingWeight: 0.8,
  regressionMinComparables: 8,
};

export const INSUFFICIENT_TEXT = "Marktwert derzeit nicht verlässlich bestimmbar";

interface Point {
  c: Comparable;
  price: number;
  weight: number;
}

export function weightedQuantile(values: { v: number; w: number }[], q: number): number {
  const sorted = [...values].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, x) => s + x.w, 0);
  if (sorted.length === 0 || total <= 0) return NaN;
  // Gewichtete Perzentile über Gewichtsmittelpunkte, linear interpoliert
  let acc = 0;
  const pos = sorted.map((x) => {
    const p = (acc + x.w / 2) / total;
    acc += x.w;
    return p;
  });
  if (q <= pos[0]) return sorted[0].v;
  for (let i = 1; i < sorted.length; i++) {
    if (q <= pos[i]) {
      const f = (q - pos[i - 1]) / (pos[i] - pos[i - 1]);
      return sorted[i - 1].v + (sorted[i].v - sorted[i - 1].v) * f;
    }
  }
  return sorted[sorted.length - 1].v;
}

function quantile(sortedAsc: number[], q: number): number {
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/** Entfernt Ausreißer nach der IQR-Regel (1,5 × IQR). */
export function removeOutliers(comps: Comparable[]): { kept: Comparable[]; excluded: Comparable[] } {
  if (comps.length < 4) return { kept: comps, excluded: [] };
  const prices = comps.map((c) => c.priceEur).sort((a, b) => a - b);
  const q1 = quantile(prices, 0.25);
  const q3 = quantile(prices, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const kept: Comparable[] = [];
  const excluded: Comparable[] = [];
  for (const c of comps) (c.priceEur < lo || c.priceEur > hi ? excluded : kept).push(c);
  return { kept, excluded };
}

/** Löst ein 3×3-Gleichungssystem (Gauß). */
function solve3(A: number[][], b: number[]): number[] | null {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-9) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k < 4; k++) M[r][k] -= f * M[col][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/**
 * Lineare Regression log(Preis) ~ Jahr + Laufleistung über die Vergleichsdaten.
 * Gibt Koeffizienten nur zurück, wenn sie plausibel sind
 * (neuer = teurer, mehr km = günstiger).
 */
export function fitVehicleRegression(comps: Comparable[]): { perYear: number; per10kKm: number } | null {
  const pts = comps.filter((c) => c.year != null && c.mileageKm != null);
  if (pts.length < DEFAULT_VALUATION_CONFIG.regressionMinComparables) return null;
  const X = pts.map((c) => [1, c.year as number, (c.mileageKm as number) / 10000]);
  const y = pts.map((c) => Math.log(c.priceEur));
  const XtX = [0, 1, 2].map((i) => [0, 1, 2].map((j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
  const Xty = [0, 1, 2].map((i) => X.reduce((s, r, k) => s + r[i] * y[k], 0));
  const beta = solve3(XtX, Xty);
  if (!beta) return null;
  const [, perYear, per10kKm] = beta;
  if (!(perYear >= 0 && per10kKm <= 0)) return null;
  // Begrenzung auf realistische Bandbreite der Datenpassung
  if (perYear > 0.5 || per10kKm < -0.3) return null;
  return { perYear, per10kKm };
}

export function rateDeviation(deviation: number, cfg = DEFAULT_VALUATION_CONFIG): PriceRating {
  const t = cfg.thresholds;
  if (deviation <= t.veryGood) return "very_good";
  if (deviation <= t.good) return "good";
  if (deviation <= t.fair) return "fair";
  if (deviation <= t.ratherExpensive) return "rather_expensive";
  return "well_above";
}

function similarityWeight(c: Comparable, listing: Listing): number {
  let w = 1;
  if (listing.year != null && c.year != null) {
    const dy = Math.abs(listing.year - c.year);
    w *= dy === 0 ? 1 : dy === 1 ? 0.85 : dy === 2 ? 0.6 : 0.35;
  }
  if (listing.mileageKm != null && c.mileageKm != null && listing.mileageKm > 0) {
    const rel = Math.abs(listing.mileageKm - c.mileageKm) / Math.max(listing.mileageKm, 20000);
    w *= rel <= 0.15 ? 1 : rel <= 0.35 ? 0.8 : rel <= 0.6 ? 0.55 : 0.3;
  }
  return w;
}

export function valuate(
  listing: Listing,
  comparables: Comparable[],
  cfg: ValuationConfig = DEFAULT_VALUATION_CONFIG,
): MarketValuation {
  const collectedAt = nowIso();
  const sources = Array.from(new Set(comparables.map((c) => c.source)));
  const valid = comparables.filter((c) => Number.isFinite(c.priceEur) && c.priceEur > 0);
  const { kept, excluded } = removeOutliers(valid);
  const listingPrices = kept.filter((c) => c.priceType === "listing").length;
  const soldPrices = kept.filter((c) => c.priceType === "sold").length;

  const base = {
    offerPriceEur: listing.priceEur,
    collectedAt,
    comparables: {
      used: kept.length,
      excluded: excluded.length + (comparables.length - valid.length),
      listingPrices,
      soldPrices,
      quality: "none" as const,
      sources,
    },
  };

  if (kept.length < cfg.minComparables) {
    return {
      ...base,
      status: "insufficient_data",
      rating: "insufficient_data",
      method: "Keine Bewertung – zu wenige belastbare Vergleichsdaten",
      explanation:
        kept.length === 0
          ? `${INSUFFICIENT_TEXT}. Es liegen keine Vergleichsangebote aus einer zulässigen Datenquelle vor. Du kannst selbst gefundene Vergleichsangebote hinzufügen.`
          : `${INSUFFICIENT_TEXT}. Es liegen nur ${kept.length} verwertbare Vergleichsangebote vor (mindestens ${cfg.minComparables} erforderlich).`,
      adjustments: [],
    };
  }

  const adjustments: string[] = [];
  let reg: ReturnType<typeof fitVehicleRegression> = null;
  if (listing.category === "vehicle" && listing.year != null && listing.mileageKm != null) {
    reg = fitVehicleRegression(kept);
    if (reg) {
      adjustments.push(
        `Vergleichswerte auf Baujahr ${listing.year} und ${Math.round(listing.mileageKm).toLocaleString("de-DE")} km angepasst ` +
          `(aus den Vergleichsdaten geschätzt: +${(reg.perYear * 100).toFixed(1)} % je Jahr jünger, ${(reg.per10kKm * 100).toFixed(1)} % je 10.000 km).`,
      );
    } else {
      adjustments.push("Keine rechnerische Anpassung an Baujahr/Laufleistung (zu wenige oder uneinheitliche Vergleichsdaten) – stattdessen Ähnlichkeitsgewichtung.");
    }
  }

  const points: Point[] = kept.map((c) => {
    let price = c.priceEur;
    if (reg && c.year != null && c.mileageKm != null && listing.year != null && listing.mileageKm != null) {
      price = c.priceEur * Math.exp(reg.perYear * (listing.year - c.year) + (reg.per10kKm * (listing.mileageKm - c.mileageKm)) / 10000);
    }
    let weight = similarityWeight(c, listing);
    if (c.priceType === "sold") weight *= cfg.soldPriceWeight;
    if (c.priceType === "listing" && (c.listingAgeDays ?? 0) > cfg.staleListingDays) weight *= cfg.staleListingWeight;
    return { c, price, weight };
  });
  if (soldPrices > 0) adjustments.push(`Tatsächliche Verkaufspreise (${soldPrices}) stärker gewichtet als Inseratspreise (${listingPrices}).`);
  if (points.some((p) => p.c.priceType === "listing" && (p.c.listingAgeDays ?? 0) > cfg.staleListingDays))
    adjustments.push(`Lange inserierte Angebote (> ${cfg.staleListingDays} Tage) geringer gewichtet.`);

  const wv = points.map((p) => ({ v: p.price, w: p.weight }));
  const low = Math.round(weightedQuantile(wv, 0.25) / 10) * 10;
  const median = Math.round(weightedQuantile(wv, 0.5) / 10) * 10;
  const high = Math.round(weightedQuantile(wv, 0.75) / 10) * 10;

  // Datenqualität der Vergleichsbasis
  const mean = points.reduce((s, p) => s + p.price, 0) / points.length;
  const sd = Math.sqrt(points.reduce((s, p) => s + (p.price - mean) ** 2, 0) / points.length);
  const cv = sd / mean;
  const avgWeight = points.reduce((s, p) => s + Math.min(1, p.weight), 0) / points.length;
  let quality: "high" | "medium" | "low" =
    kept.length >= 15 && cv < 0.2 && avgWeight > 0.6 ? "high" : kept.length >= 8 && cv < 0.3 ? "medium" : "low";
  if (soldPrices === 0 && quality === "high") quality = "medium"; // nur Inseratspreise → max. mittel

  const offer = listing.priceEur;
  if (offer == null) {
    return {
      ...base,
      comparables: { ...base.comparables, quality },
      status: "ok",
      range: { low, median, high },
      rating: "insufficient_data",
      method: "Gewichtete Quartile der Vergleichsangebote",
      explanation: "Marktspanne ermittelt, aber kein Angebotspreis angegeben – keine Preisbewertung möglich.",
      adjustments,
    };
  }

  const deviation = (offer - median) / median;
  const rating = rateDeviation(deviation, cfg);
  const pct = Math.round(deviation * 100);
  return {
    ...base,
    comparables: { ...base.comparables, quality },
    status: "ok",
    range: { low, median, high },
    rating,
    deviationPct: pct,
    method: "Gewichtete Quartile (25 %–75 %) der Vergleichsangebote nach Ausreißerbereinigung",
    explanation:
      `Der Angebotspreis liegt ${pct === 0 ? "auf Höhe des" : `${Math.abs(pct)} % ${pct > 0 ? "über" : "unter"} dem`} ` +
      `mittleren Vergleichswert. Grundlage: ${kept.length} Vergleichsangebote` +
      (soldPrices ? `, davon ${soldPrices} tatsächliche Verkaufspreise` : ", ausschließlich Inseratspreise (keine erzielten Verkaufspreise)") +
      ".",
    adjustments,
  };
}
