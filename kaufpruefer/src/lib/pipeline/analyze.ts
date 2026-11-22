/**
 * Analyse-Pipeline
 *
 *  Inserat importieren → Daten extrahieren → Produkt identifizieren →
 *  Kategorie bestimmen → Daten validieren → Marktdaten abfragen →
 *  Schwachstellen recherchieren → Bilder analysieren → Verkäuferdaten
 *  auswerten → Risiken bewerten → Bericht erstellen
 *
 * Abhängigkeiten (KI, Bildquelle, Marktdaten) werden injiziert, sodass jeder
 * Schritt unabhängig testbar ist. Ohne KI läuft die Pipeline im Regelmodus.
 */
import type { AIProvider } from "../ai/provider";
import { UsageMeter } from "../ai/provider";
import { CATEGORY_PROFILES } from "../domain/category-profiles";
import { formatEur, PRICE_RATING_LABELS } from "../domain/labels";
import {
  AnalysisReportSchema,
  ListingSchema,
  type AnalysisReport,
  type Checklist,
  type Comparable,
  type Listing,
  type ProductAnalysis,
  type RiskFinding,
  type SellerAnalysis,
  type StepLog,
  type Weakness,
} from "../domain/schemas";
import { detectMissingInfo } from "../engine/missing-info";
import { buildNegotiation, templateSellerMessage } from "../engine/negotiation";
import { evaluateRisks } from "../engine/risk";
import { computeDataQuality, computeDealScore } from "../engine/scoring";
import { analyzeSeller, parsePastedReviews, type RawReview } from "../engine/seller";
import { valuate } from "../engine/valuation";
import { baseChecklist } from "../knowledge/checklists";
import { paymentAdvice } from "../knowledge/payment";
import { KNOWLEDGE_BASE, retrieveKnowledge, type KnowledgeEntry } from "../knowledge/weaknesses";
import type { MarketDataProvider } from "../market/providers";
import { queryFromListing } from "../market/providers";
import { sanitizeUntrustedText } from "../security/untrusted";
import { newId, nowIso } from "../utils";
import { aiAnalyzeProduct, aiCompose, aiReadReviews, type AIImage } from "./ai-steps";

export interface SellerInput {
  method: "screenshots" | "screen_recording" | "pasted_text";
  /** Upload-IDs von Screenshots bzw. extrahierten Video-Frames */
  imageRefs?: string[];
  pastedText?: string;
  platformTotalClaimed?: number;
}

export interface PipelineDeps {
  ai: AIProvider | null;
  loadImage: (ref: string) => Promise<string>; // → data URL
  marketProviders: MarketDataProvider[];
  knowledge?: KnowledgeEntry[];
  now?: () => Date;
}

export interface PipelineInput {
  id?: string;
  listing: Listing;
  userComparables: Comparable[];
  seller?: SellerInput;
  importLog?: StepLog[];
}

export const DISCLAIMER =
  "Dieser Bericht ist eine automatisierte Orientierungshilfe auf Basis der verfügbaren Daten. Er ist keine Garantie für Zustand, Echtheit, Seriosität des Verkäufers oder Betrugsfreiheit und ersetzt keine Besichtigung, Probefahrt, Fachprüfung oder Rechtsberatung.";

async function step<T>(log: StepLog[], id: string, label: string, fn: () => Promise<T> | T, opts: { optional?: boolean } = {}): Promise<T | undefined> {
  const t0 = Date.now();
  try {
    const r = await fn();
    log.push({ step: id, label, status: "ok", durationMs: Date.now() - t0 });
    return r;
  } catch (e) {
    log.push({ step: id, label, status: "failed", durationMs: Date.now() - t0, note: (e as Error).message.slice(0, 200) });
    if (!opts.optional) throw e;
    return undefined;
  }
}

function dedupeStrings(list: string[], max = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const k = s.toLowerCase().replace(/[^a-zäöüß0-9]/g, "").slice(0, 60);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, max);
}

export async function runAnalysisPipeline(input: PipelineInput, deps: PipelineDeps): Promise<{ report: AnalysisReport; meter: UsageMeter }> {
  const log: StepLog[] = [...(input.importLog ?? [])];
  const meter = new UsageMeter();
  const ai = deps.ai;
  const now = deps.now?.() ?? new Date();

  // ── Validieren ───────────────────────────────────────────
  const listing = (await step(log, "validate", "Daten validieren", () => {
    const l = ListingSchema.parse(input.listing);
    return { ...l, description: l.description ? sanitizeUntrustedText(l.description, 8000) : undefined, title: l.title ? sanitizeUntrustedText(l.title, 200) : undefined };
  })) as Listing;

  log.push({
    step: "identify",
    label: "Produkt identifizieren & Kategorie bestimmen",
    status: listing.brand && listing.model ? "ok" : "partial",
    durationMs: 0,
    note: listing.brand && listing.model ? `${listing.brand} ${listing.model}` : "Marke/Modell unvollständig",
  });

  // ── Marktdaten ───────────────────────────────────────────
  const comparables: Comparable[] = [...input.userComparables];
  for (const p of deps.marketProviders.filter((p) => p.isConfigured() && p.supports(listing.category))) {
    const got = await step(log, `market_${p.id}`, `Marktdaten: ${p.name}`, () => p.fetchComparables(queryFromListing(listing)), { optional: true });
    if (got) comparables.push(...got);
  }
  const market = (await step(log, "market", "Marktwert berechnen", () => valuate(listing, comparables)))!;

  // ── Schwachstellen (geprüfte Wissensdatenbank) ───────────
  const kb = retrieveKnowledge(listing, deps.knowledge ?? KNOWLEDGE_BASE);
  const at = nowIso();
  const kbWeaknesses: Weakness[] = kb.map((k) => ({
    id: k.id,
    title: k.title,
    detail: k.detail,
    appliesTo: k.appliesTo,
    severity: k.severity,
    checkAdvice: k.checkAdvice,
    repairCostHint: k.repairCostHint,
    claim: {
      id: newId("clm"),
      statement: k.title,
      source: { type: "knowledge_base", label: k.sourceLabel, url: k.sourceUrl },
      evidence: `Geprüft am ${k.reviewedAt}`,
      confidence: "high",
      verified: true,
      collectedAt: at,
    },
  }));
  log.push({ step: "weaknesses", label: "Schwachstellen recherchieren", status: "ok", durationMs: 0, note: `${kb.length} geprüfte Einträge` });

  // ── Bildanalyse (KI) ─────────────────────────────────────
  const checklist0 = baseChecklist(listing);
  const productImages = listing.images.filter((i) => i.kind === "product_photo" || i.kind === "listing_screenshot").slice(0, 10);
  let product: ProductAnalysis = { weaknesses: kbWeaknesses, imageFindings: [], missingViews: [], notes: [] };
  let aiRisks: RiskFinding[] = [];
  let checklistAdd: Checklist | undefined;
  let imagesAnalyzed = false;

  if (ai) {
    const res = await step(
      log,
      "images",
      "Bilder & Produkt analysieren (KI)",
      async () => {
        const imgs: AIImage[] = [];
        for (const im of productImages) imgs.push({ ref: im.ref, dataUrl: await deps.loadImage(im.ref) });
        return aiAnalyzeProduct(ai, meter, { listing, images: imgs, knowledge: kb, baseChecklist: checklist0 });
      },
      { optional: true },
    );
    if (res) {
      imagesAnalyzed = productImages.length > 0;
      product = {
        conditionSummary: res.conditionSummary,
        weaknesses: [...kbWeaknesses, ...res.hints],
        imageFindings: res.findings,
        missingViews: res.missingViews,
        authenticity:
          res.authenticity.length > 0 || CATEGORY_PROFILES[listing.category].authenticationThresholdEur != null
            ? {
                applicable: true,
                checkedFeatures: res.authenticity,
                recommendation: authenticationAdvice(listing),
              }
            : undefined,
        notes: res.injectionDetected ? ["Der Inseratstext enthielt Anweisungen an KI-Systeme. Diese wurden ignoriert."] : [],
      };
      aiRisks = res.inconsistencies;
      checklistAdd = res.checklistAdditions;
    }
  } else {
    log.push({ step: "images", label: "Bilder & Produkt analysieren (KI)", status: "skipped", durationMs: 0, note: "Kein KI-Provider konfiguriert – Regelmodus" });
    const profile = CATEGORY_PROFILES[listing.category];
    if (productImages.length < profile.minImages) product.missingViews = profile.recommendedViews;
    if (profile.authenticationThresholdEur != null)
      product.authenticity = { applicable: true, checkedFeatures: [], recommendation: authenticationAdvice(listing) };
  }

  // ── Verkäuferanalyse ─────────────────────────────────────
  let seller: SellerAnalysis | undefined;
  if (input.seller) {
    const s = input.seller;
    seller = await step(
      log,
      "seller",
      "Verkäuferbewertungen auswerten",
      async () => {
        let raw: RawReview[] = [];
        let unreadable = 0;
        let platformTotal = s.platformTotalClaimed;
        if (s.pastedText) raw.push(...parsePastedReviews(s.pastedText));
        if (s.imageRefs?.length) {
          if (!ai) throw new Error("Texterkennung aus Bildern benötigt einen KI-Provider – bitte Bewertungstexte einfügen");
          const imgs: AIImage[] = [];
          for (const ref of s.imageRefs.slice(0, 30)) imgs.push({ ref, dataUrl: await deps.loadImage(ref) });
          const r = await aiReadReviews(ai, meter, imgs);
          raw = [...raw, ...r.raw];
          unreadable = r.unreadable;
          platformTotal = platformTotal ?? r.platformTotal;
        }
        return analyzeSeller({
          raw,
          inputMethod: s.method === "pasted_text" ? "pasted_text" : s.method,
          unreadableSegments: unreadable,
          platformTotalClaimed: platformTotal,
        });
      },
      { optional: true },
    );
  } else {
    log.push({ step: "seller", label: "Verkäuferbewertungen auswerten", status: "skipped", durationMs: 0, note: "Nicht angefordert" });
  }

  // ── Risiken ──────────────────────────────────────────────
  const risks = (await step(log, "risk", "Risiken bewerten", () =>
    evaluateRisks({ listing, market, seller, externalFindings: aiRisks, currentYear: now.getFullYear() }),
  ))!;

  // ── Bericht ──────────────────────────────────────────────
  const dataQuality = computeDataQuality({ listing, market, seller, imagesAnalyzed });
  const score = computeDealScore({ listing, market, product, seller, risks, dataQuality, imagesAnalyzed });
  const payment = paymentAdvice(listing, risks);
  const missingInfo = detectMissingInfo(listing);

  const missingQuestions = missingInfo.filter((m) => m.importance !== "helpful").map((m) => m.question);
  const checklist: Checklist = {
    questionsForSeller: dedupeStrings([...missingQuestions, ...(checklistAdd?.questionsForSeller ?? []), ...checklist0.questionsForSeller], 10),
    inspection: dedupeStrings([...(checklistAdd?.inspection ?? []), ...checklist0.inspection, ...product.weaknesses.map((w) => w.checkAdvice).filter((x): x is string => !!x)], 12),
    documents: dedupeStrings([...checklist0.documents, ...(checklistAdd?.documents ?? [])], 8),
    expensiveDamages: dedupeStrings([...(checklistAdd?.expensiveDamages ?? []), ...checklist0.expensiveDamages], 8),
  };
  const negotiation = buildNegotiation({ listing, market, imageFindings: product.imageFindings, weaknesses: product.weaknesses });

  const facts = [
    market.status === "ok" && market.range
      ? `Marktspanne ${formatEur(market.range.low)}–${formatEur(market.range.high)}, Bewertung: ${PRICE_RATING_LABELS[market.rating]}`
      : "Marktwert nicht verlässlich bestimmbar",
    ...risks.filter((r) => r.severity !== "info").slice(0, 5).map((r) => `Risikohinweis: ${r.title}`),
    `Datenqualität: ${dataQuality.score}/100`,
    score.overall != null ? `Deal-Score: ${score.overall}/100` : "Kein Deal-Score (zu wenige Daten)",
  ];

  let sellerMessage = templateSellerMessage(listing, checklist.questionsForSeller);
  let summary = defaultSummary(score.overall, market, risks, dataQuality.level);
  if (ai) {
    const composed = await step(
      log,
      "compose",
      "Nachrichten & Zusammenfassung formulieren (KI)",
      () =>
        aiCompose(ai, meter, {
          listing,
          questions: checklist.questionsForSeller.slice(0, 5),
          negotiation,
          sellerStats: seller
            ? { positive: seller.positive, neutral: seller.neutral, negative: seller.negative, total: seller.visibleReviewCount, topComplaints: seller.complaints.slice(0, 3).map((c) => c.category) }
            : undefined,
          facts,
        }),
      { optional: true },
    );
    if (composed) {
      sellerMessage = sanitizeUntrustedText(composed.sellerMessage, 2000) || sellerMessage;
      if (composed.negotiationMessage && negotiation.possible) negotiation.message = sanitizeUntrustedText(composed.negotiationMessage, 2000);
      if (composed.sellerSummary && seller) seller.summary = sanitizeUntrustedText(composed.sellerSummary, 1000);
      summary = sanitizeUntrustedText(composed.overallSummary, 1200) || summary;
    }
  }
  if (!negotiation.message && negotiation.possible) {
    negotiation.message =
      `Hallo,\n\nvielen Dank für die Infos. Mir sind beim Vergleich folgende Punkte aufgefallen:\n\n${negotiation.arguments.map((a) => `– ${a.text}`).join("\n")}\n\n` +
      (negotiation.suggestedOpeningEur ? `Wären Sie mit ${formatEur(negotiation.suggestedOpeningEur)} einverstanden?\n\n` : "Wäre beim Preis noch etwas möglich?\n\n") +
      "Viele Grüße";
  }

  const report: AnalysisReport = {
    id: input.id ?? newId("an"),
    version: 1,
    mode: ai ? "live_ai" : "rules_only",
    isDemo: false,
    tier: "full",
    createdAt: nowIso(),
    listing,
    missingInfo,
    market,
    product,
    seller,
    risks,
    payment,
    checklist,
    sellerMessage,
    negotiation,
    vehicleHistory:
      listing.category === "vehicle"
        ? { status: "unavailable", provider: "–", note: "Fahrzeughistorien sind eine separate Zusatzleistung und derzeit nicht angebunden.", entries: [] }
        : undefined,
    score,
    dataQuality,
    summary,
    pipeline: log,
    disclaimer: DISCLAIMER,
  };
  return { report: AnalysisReportSchema.parse(report), meter };
}

function authenticationAdvice(l: Listing): string {
  const t = CATEGORY_PROFILES[l.category].authenticationThresholdEur;
  const high = t != null && (l.priceEur ?? 0) >= t;
  return high
    ? "Fotos reichen für eine Echtheitsbestätigung nicht aus. Lass den Artikel vor der Zahlung von einer unabhängigen Fachstelle (z. B. Konzessionär, Juwelier, Authentifizierungsdienst) prüfen."
    : "Eine Echtheitsbestätigung anhand von Fotos ist nicht möglich. Achte auf Kaufbeleg und Detailfotos; bei Zweifeln eine Fachstelle hinzuziehen.";
}

function defaultSummary(overall: number | null, market: AnalysisReport["market"], risks: RiskFinding[], dq: string): string {
  const parts: string[] = [];
  parts.push(market.status === "ok" ? `Preisbewertung: ${PRICE_RATING_LABELS[market.rating]}.` : "Der Marktwert ist derzeit nicht verlässlich bestimmbar.");
  const serious = risks.filter((r) => r.severity === "high" || r.severity === "medium");
  parts.push(serious.length ? `${serious.length} relevante Risikohinweise – bitte die Details prüfen.` : "Die Regelprüfung ergab keine schwerwiegenden Risikohinweise.");
  if (overall == null) parts.push("Für einen Deal-Score fehlen noch wesentliche Informationen.");
  if (dq === "low" || dq === "insufficient") parts.push("Die Datenlage ist dünn; das Ergebnis ist nur eine grobe Orientierung.");
  return parts.join(" ");
}
