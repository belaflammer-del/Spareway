/**
 * KI-gestützte Pipeline-Schritte. Jeder Schritt ist unabhängig testbar
 * (Provider per Parameter injizierbar) und liefert ausschließlich
 * schema-validierte, nachbearbeitete Ergebnisse.
 */
import { COMPOSE_PROMPT, EXTRACTION_PROMPT, PRODUCT_PROMPT, REVIEW_OCR_PROMPT } from "../ai/prompts";
import type { AIPart, AIProvider, UsageMeter } from "../ai/provider";
import {
  ComposeOutputSchema,
  ExtractionOutputSchema,
  ProductOutputSchema,
  ReviewOcrOutputSchema,
  type ExtractionOutput,
  type ProductOutput,
} from "../ai/schemas";
import { CATEGORY_LABELS } from "../domain/labels";
import { LISTING_FIELDS, type Checklist, type ImageFinding, type Listing, type ListingImage, type Negotiation, type RiskFinding, type Weakness } from "../domain/schemas";
import type { KnowledgeEntry } from "../knowledge/weaknesses";
import type { RawReview } from "../engine/seller";
import { sanitizeUntrustedText, wrapUntrusted } from "../security/untrusted";
import { newId, nowIso } from "../utils";

export interface DraftConflict {
  field: string;
  values: string[];
  images: string[];
}

export interface AIImage {
  ref: string;
  dataUrl: string;
}

function imageParts(images: AIImage[]): AIPart[] {
  return images.flatMap((img, i) => [
    { type: "text" as const, text: `Bild ${i}:` },
    { type: "image" as const, dataUrl: img.dataUrl, label: `Bild ${i}` },
  ]);
}

function listingSummary(l: Listing): string {
  const entries = Object.entries(l)
    .filter(([k, v]) => !["images", "provenance", "description", "url"].includes(k) && v != null && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`);
  return entries.join("\n");
}

/* ── 1) Extraktion aus Screenshots/Text ─────────────────────── */
export async function aiExtractListing(
  ai: AIProvider,
  meter: UsageMeter,
  input: { images: AIImage[]; pastedText?: string; hint?: Partial<Listing> },
): Promise<{ patch: Partial<Listing>; imageKinds: Record<string, ListingImage["kind"]>; lowConfidence: string[]; issues: string[]; conflicts: DraftConflict[] }> {
  const parts: AIPart[] = [];
  if (input.hint) parts.push({ type: "text", text: `Bereits bekannt (aus Link): ${JSON.stringify({ platform: input.hint.platform, title: input.hint.title })}` });
  if (input.pastedText) parts.push({ type: "text", text: wrapUntrusted("inseratstext", input.pastedText) });
  parts.push(...imageParts(input.images));
  parts.push({ type: "text", text: "Extrahiere jetzt die Inseratsangaben." });

  const { data, usage } = await ai.generate<ExtractionOutput>({
    task: "extract_listing",
    system: EXTRACTION_PROMPT,
    parts,
    schema: ExtractionOutputSchema,
    schemaName: "listing_extraction",
    maxOutputTokens: 3000,
  });
  meter.add("extract_listing", ai.model, usage);

  const patch: Partial<Listing> = { category: data.category };
  for (const [k, v] of Object.entries(data.fields)) {
    if (v == null || v === "") continue;
    if (typeof v === "number" && (!Number.isFinite(v) || v < 0)) continue;
    (patch as Record<string, unknown>)[k] = typeof v === "string" ? sanitizeUntrustedText(v, k === "description" ? 8000 : 300) : v;
  }
  if (patch.batteryHealthPct != null && patch.batteryHealthPct > 100) delete patch.batteryHealthPct;
  if (patch.year != null && (patch.year < 1900 || patch.year > new Date().getFullYear() + 1)) delete patch.year;

  const imageKinds: Record<string, ListingImage["kind"]> = {};
  for (const im of data.images) {
    const ref = input.images[im.index]?.ref;
    if (ref) imageKinds[ref] = im.kind === "other" ? "product_photo" : im.kind;
  }
  const known = new Set<string>(LISTING_FIELDS);
  const conflicts: DraftConflict[] = data.conflicts
    .filter((c) => known.has(c.field) && c.values.length >= 2)
    .map((c) => ({ field: c.field, values: [...new Set(c.values.map((v) => sanitizeUntrustedText(v, 120)))].slice(0, 4), images: c.imageIndexes.map((i) => input.images[i]?.ref).filter((x): x is string => !!x) }))
    .filter((c) => c.values.length >= 2);
  for (const c of conflicts) delete (patch as Record<string, unknown>)[c.field];
  return { patch, imageKinds, lowConfidence: data.lowConfidenceFields, issues: data.readabilityIssues, conflicts };
}

/* ── 2) Produkt- und Bildanalyse ────────────────────────────── */
export async function aiAnalyzeProduct(
  ai: AIProvider,
  meter: UsageMeter,
  input: { listing: Listing; images: AIImage[]; knowledge: KnowledgeEntry[]; baseChecklist: Checklist },
): Promise<{
  findings: ImageFinding[];
  missingViews: string[];
  hints: Weakness[];
  inconsistencies: RiskFinding[];
  authenticity: ProductOutput["authenticityFeatures"];
  conditionSummary?: string;
  checklistAdditions: Checklist;
  injectionDetected: boolean;
}> {
  const { listing } = input;
  const parts: AIPart[] = [
    { type: "text", text: `Kategorie: ${CATEGORY_LABELS[listing.category]}` },
    { type: "text", text: wrapUntrusted("inseratsdaten", listingSummary(listing)) },
  ];
  if (listing.description) parts.push({ type: "text", text: wrapUntrusted("beschreibung", listing.description) });
  if (input.knowledge.length)
    parts.push({ type: "text", text: `Geprüfte Wissensdatenbank (nicht wiederholen):\n${input.knowledge.map((k) => `- ${k.title} (${k.appliesTo})`).join("\n")}` });
  parts.push({
    type: "text",
    text: `Standardlisten (nicht wiederholen):\n${[...input.baseChecklist.questionsForSeller, ...input.baseChecklist.inspection].map((s) => `- ${s}`).join("\n")}`,
  });
  parts.push(...imageParts(input.images));
  parts.push({ type: "text", text: input.images.length ? "Analysiere jetzt Angebot und Bilder." : "Es liegen keine Bilder vor. imageFindings leer lassen." });

  const { data, usage } = await ai.generate<ProductOutput>({
    task: "analyze_product",
    system: PRODUCT_PROMPT,
    parts,
    schema: ProductOutputSchema,
    schemaName: "product_analysis",
    maxOutputTokens: 6000,
  });
  meter.add("analyze_product", ai.model, usage);
  const at = nowIso();

  const findings: ImageFinding[] = data.imageFindings
    // Ohne Bildbezug keine „sichtbar belegte“ Aussage
    .map((f) => ({ ...f, evidenceLevel: f.imageIndex == null && f.evidenceLevel === "visible" ? ("possible" as const) : f.evidenceLevel }))
    .map((f) => {
      const ref = f.imageIndex != null ? input.images[f.imageIndex]?.ref : undefined;
      const box =
        f.box && f.box.length === 4 && f.box.every((x) => x >= 0 && x <= 1) ? (f.box as [number, number, number, number]) : undefined;
      return {
        id: newId("img"),
        title: sanitizeUntrustedText(f.title, 160),
        detail: sanitizeUntrustedText(f.detail, 600),
        evidenceLevel: ref ? f.evidenceLevel : f.evidenceLevel === "visible" ? "possible" : f.evidenceLevel,
        imageRef: ref,
        box: ref ? box : undefined,
        severity: f.severity,
        claim: {
          id: newId("clm"),
          statement: f.title,
          source: { type: "listing_image" as const, label: ref ? `Bild ${(f.imageIndex ?? 0) + 1}` : "Bilder" },
          evidence: f.detail,
          evidenceLevel: f.evidenceLevel,
          imageRef: ref,
          confidence: f.evidenceLevel === "visible" ? ("medium" as const) : ("low" as const),
          verified: false,
          collectedAt: at,
        },
      } satisfies ImageFinding;
    });

  const hints: Weakness[] = data.modelKnowledgeHints
    .filter((h) => h.appliesTo.trim().length > 3)
    .map((h) => ({
      id: newId("wk"),
      title: sanitizeUntrustedText(h.title, 160),
      detail: sanitizeUntrustedText(h.detail, 600),
      appliesTo: sanitizeUntrustedText(h.appliesTo, 160),
      severity: h.severity,
      checkAdvice: sanitizeUntrustedText(h.checkAdvice, 400),
      claim: {
        id: newId("clm"),
        statement: h.title,
        source: { type: "ai_model_knowledge" as const, label: "KI-Hinweis (nicht verifiziert)" },
        evidence: "Allgemeines Modellwissen der KI – vor dem Kauf unabhängig prüfen (z. B. Fachwerkstatt, Herstellerinformationen).",
        confidence: "low" as const,
        verified: false,
        collectedAt: at,
      },
    }));

  const inconsistencies: RiskFinding[] = data.textImageInconsistencies.map((x) => ({
    id: newId("risk"),
    rule: "ai.text_image_inconsistency",
    area: "plausibility",
    severity: x.severity,
    title: sanitizeUntrustedText(x.title, 160),
    explanation: sanitizeUntrustedText(x.detail, 600),
    evidence: x.imageIndex != null && input.images[x.imageIndex] ? [`Bild ${x.imageIndex + 1}`] : [],
    caveat: "Von der KI erkannt – bitte selbst am Bild bzw. beim Verkäufer prüfen.",
    source: "listing_image",
  }));

  return {
    findings,
    missingViews: data.missingViews.slice(0, 8),
    hints,
    inconsistencies,
    authenticity: data.authenticityFeatures,
    conditionSummary: data.conditionSummary ?? undefined,
    checklistAdditions: {
      questionsForSeller: data.questionsForSeller.slice(0, 6),
      inspection: data.inspection.slice(0, 6),
      documents: data.documents.slice(0, 6),
      expensiveDamages: data.expensiveDamages.slice(0, 6),
    },
    injectionDetected: data.injectionAttemptDetected,
  };
}

/* ── 3) Bewertungen per OCR aus Screenshots/Frames ──────────── */
export async function aiReadReviews(
  ai: AIProvider,
  meter: UsageMeter,
  images: AIImage[],
): Promise<{ raw: RawReview[]; unreadable: number; platformTotal?: number }> {
  const raw: RawReview[] = [];
  let unreadable = 0;
  let platformTotal: number | undefined;
  // In kleinen Stapeln verarbeiten (Kosten, Kontextlänge)
  for (let i = 0; i < images.length; i += 4) {
    const batch = images.slice(i, i + 4);
    const { data, usage } = await ai.generate({
      task: "review_ocr",
      system: REVIEW_OCR_PROMPT,
      parts: [...imageParts(batch), { type: "text", text: "Lies jetzt die Bewertungen." }],
      schema: ReviewOcrOutputSchema,
      schemaName: "review_ocr",
      maxOutputTokens: 4000,
    });
    meter.add("review_ocr", ai.model, usage);
    unreadable += data.unreadableCount;
    if (data.platformTotalClaimed != null) platformTotal = Math.max(platformTotal ?? 0, data.platformTotalClaimed);
    for (const r of data.reviews)
      raw.push({
        text: sanitizeUntrustedText(r.text, 2000),
        sentiment: r.sentimentIsExplicit ? r.sentiment : undefined,
        date: r.date ?? undefined,
        evidenceRef: batch[r.imageIndex]?.ref,
      });
  }
  return { raw, unreadable, platformTotal };
}

/* ── 4) Texte formulieren (Nachricht, Verhandlung, Zusammenfassung) ─ */
export async function aiCompose(
  ai: AIProvider,
  meter: UsageMeter,
  input: {
    listing: Listing;
    questions: string[];
    negotiation: Negotiation;
    sellerStats?: { positive: number; neutral: number; negative: number; total: number; topComplaints: string[] };
    facts: string[];
  },
) {
  const { data, usage } = await ai.generate({
    task: "compose",
    system: COMPOSE_PROMPT,
    parts: [
      { type: "text", text: `Artikel: ${input.listing.title ?? [input.listing.brand, input.listing.model].filter(Boolean).join(" ")}` },
      { type: "text", text: `Offene Fragen:\n${input.questions.map((q) => `- ${q}`).join("\n")}` },
      {
        type: "text",
        text: input.negotiation.possible ? `Verhandlungsargumente:\n${input.negotiation.arguments.map((a) => `- ${a.text}`).join("\n")}` : "Keine Verhandlungsargumente.",
      },
      { type: "text", text: input.sellerStats ? `Bewertungsstatistik: ${JSON.stringify(input.sellerStats)}` : "Keine Bewertungsstatistik." },
      { type: "text", text: `Geprüfte Berichtsfakten:\n${input.facts.map((f) => `- ${f}`).join("\n")}` },
    ],
    schema: ComposeOutputSchema,
    schemaName: "compose",
    maxOutputTokens: 1500,
  });
  meter.add("compose", ai.model, usage);
  return data;
}
