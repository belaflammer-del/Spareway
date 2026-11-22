/**
 * Baut Demo-Berichte mit den ECHTEN Engines (Marktwert, Risiko, Score),
 * aber ausschließlich mit fiktiven, klar als Demo gekennzeichneten Eingaben.
 * Demo-Berichte verbrauchen keine Tokens und werden nie gespeichert.
 */
import { CATEGORY_PROFILES } from "../domain/category-profiles";
import {
  AnalysisReportSchema,
  type AnalysisReport,
  type Comparable,
  type ImageFinding,
  type Listing,
  type ProductAnalysis,
  type Weakness,
} from "../domain/schemas";
import { detectMissingInfo } from "../engine/missing-info";
import { buildNegotiation, templateSellerMessage } from "../engine/negotiation";
import { evaluateRisks } from "../engine/risk";
import { computeDataQuality, computeDealScore } from "../engine/scoring";
import { analyzeSeller, type RawReview } from "../engine/seller";
import { valuate } from "../engine/valuation";
import { baseChecklist } from "../knowledge/checklists";
import { paymentAdvice } from "../knowledge/payment";
import { DISCLAIMER } from "../pipeline/analyze";

export interface DemoDefinition {
  slug: string;
  teaser: string;
  listing: Omit<Listing, "provenance">;
  comparables: { price: number; type?: "listing" | "sold"; year?: number; km?: number; ageDays?: number }[];
  findings: { title: string; detail: string; level: ImageFinding["evidenceLevel"]; severity: ImageFinding["severity"]; image?: string; box?: [number, number, number, number] }[];
  weaknesses?: { title: string; detail: string; appliesTo: string; severity: Weakness["severity"]; check: string }[];
  missingViews?: string[];
  authenticity?: NonNullable<ProductAnalysis["authenticity"]>["checkedFeatures"];
  reviews?: RawReview[];
  reviewsTotalClaimed?: number;
  conditionSummary?: string;
  summary: string;
}

const AT = "2026-11-01T10:00:00.000Z";

export function buildDemoReport(def: DemoDefinition): AnalysisReport {
  const provenance = Object.fromEntries(Object.keys(def.listing).map((k) => [k, "demo" as const]));
  const listing: Listing = { ...def.listing, provenance };

  const comparables: Comparable[] = def.comparables.map((c, i) => ({
    id: `demo_cmp_${i}`,
    priceEur: c.price,
    priceType: c.type ?? "listing",
    year: c.year,
    mileageKm: c.km,
    listingAgeDays: c.ageDays,
    source: "Demo-Vergleichsdaten (fiktiv)",
    collectedAt: AT,
  }));
  const market = { ...valuate(listing, comparables), collectedAt: AT };

  const imageFindings: ImageFinding[] = def.findings.map((f, i) => ({
    id: `demo_img_${i}`,
    title: f.title,
    detail: f.detail,
    evidenceLevel: f.level,
    imageRef: f.image,
    box: f.box,
    severity: f.severity,
    claim: {
      id: `demo_clm_img_${i}`,
      statement: f.title,
      source: { type: "demo", label: "Demo – fiktiver Befund" },
      evidence: f.detail,
      evidenceLevel: f.level,
      imageRef: f.image,
      confidence: f.level === "visible" ? "medium" : "low",
      verified: false,
      collectedAt: AT,
    },
  }));
  const weaknesses: Weakness[] = (def.weaknesses ?? []).map((w, i) => ({
    id: `demo_wk_${i}`,
    title: w.title,
    detail: w.detail,
    appliesTo: w.appliesTo,
    severity: w.severity,
    checkAdvice: w.check,
    claim: {
      id: `demo_clm_wk_${i}`,
      statement: w.title,
      source: { type: "demo", label: "Demo – fiktiver Wissenseintrag" },
      evidence: "In echten Berichten stammen solche Aussagen aus der geprüften Wissensdatenbank mit Quellenangabe oder werden als nicht verifizierter KI-Hinweis gekennzeichnet.",
      confidence: "low",
      verified: false,
      collectedAt: AT,
    },
  }));

  const product: ProductAnalysis = {
    conditionSummary: def.conditionSummary,
    weaknesses,
    imageFindings,
    missingViews: def.missingViews ?? [],
    authenticity:
      CATEGORY_PROFILES[listing.category].authenticationThresholdEur != null
        ? {
            applicable: true,
            checkedFeatures: def.authenticity ?? [],
            recommendation:
              "Fotos reichen für eine Echtheitsbestätigung nicht aus. Bei hochpreisigen Artikeln vor der Zahlung eine unabhängige Fachstelle hinzuziehen.",
          }
        : undefined,
    notes: [],
  };

  const seller = def.reviews
    ? analyzeSeller({ raw: def.reviews, inputMethod: "demo", platformTotalClaimed: def.reviewsTotalClaimed })
    : undefined;
  const risks = evaluateRisks({ listing, market, seller, currentYear: 2026 });
  const imagesAnalyzed = listing.images.length > 0;
  const dataQuality = computeDataQuality({ listing, market, seller, imagesAnalyzed });
  const score = computeDealScore({ listing, market, product, seller, risks, dataQuality, imagesAnalyzed });
  const checklist = baseChecklist(listing);
  const missingInfo = detectMissingInfo(listing);
  const negotiation = buildNegotiation({ listing, market, imageFindings, weaknesses });
  if (negotiation.possible)
    negotiation.message =
      `Hallo,\n\nvielen Dank für die Informationen. Mir sind beim Vergleich folgende Punkte aufgefallen:\n\n${negotiation.arguments.map((a) => `– ${a.text}`).join("\n")}\n\n` +
      (negotiation.suggestedOpeningEur
        ? `Wären Sie mit ${negotiation.suggestedOpeningEur.toLocaleString("de-DE")} € einverstanden?\n\n`
        : "Wäre beim Preis noch etwas möglich?\n\n") +
      "Viele Grüße";

  const report: AnalysisReport = {
    id: `demo_${def.slug}`,
    version: 1,
    mode: "demo",
    isDemo: true,
    tier: "full",
    createdAt: AT,
    listing,
    missingInfo,
    market,
    product,
    seller,
    risks,
    payment: paymentAdvice(listing, risks),
    checklist: {
      ...checklist,
      questionsForSeller: [...missingInfo.filter((m) => m.importance !== "helpful").map((m) => m.question), ...checklist.questionsForSeller].slice(0, 10),
    },
    sellerMessage: templateSellerMessage(listing, [...missingInfo.map((m) => m.question), ...checklist.questionsForSeller]),
    negotiation,
    vehicleHistory:
      listing.category === "vehicle"
        ? {
            status: "demo",
            provider: "Demo-Anbieter (fiktiv)",
            note: "Beispiel einer optionalen, separat berechneten Fahrzeughistorie. Echte Berichte nur mit kommerziellem Datenanbieter.",
            entries: [
              { date: "2019-05", event: "Hauptuntersuchung ohne Mängel (Demo)", mileageKm: Math.round((listing.mileageKm ?? 100000) * 0.45) },
              { date: "2023-06", event: "Inspektion (Demo)", mileageKm: Math.round((listing.mileageKm ?? 100000) * 0.8) },
            ],
          }
        : undefined,
    score,
    dataQuality,
    summary: def.summary,
    pipeline: [
      { step: "import", label: "Inserat importieren", status: "ok", durationMs: 0, note: "Demo-Daten" },
      { step: "market", label: "Marktwert berechnen", status: "ok", durationMs: 0, note: "Fiktive Vergleichsdaten" },
      { step: "images", label: "Bilder analysieren", status: "ok", durationMs: 0, note: "Fiktive Befunde" },
      { step: "risk", label: "Risiken bewerten", status: "ok", durationMs: 0, note: "Echte Regel-Engine" },
    ],
    disclaimer: `DEMO – alle Angaben, Preise, Bilder und Bewertungen sind fiktiv. ${DISCLAIMER}`,
  };
  return AnalysisReportSchema.parse(report);
}
