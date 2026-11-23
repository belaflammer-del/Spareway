import { z } from "zod";

/* ────────────────────────────────────────────────────────────
 * Grundtypen
 * ──────────────────────────────────────────────────────────── */

export const CategorySchema = z.enum([
  "vehicle",
  "electronics",
  "fashion",
  "watches_jewelry",
  "gaming_collectibles",
  "other",
]);
export type Category = z.infer<typeof CategorySchema>;

export const PlatformSchema = z.enum([
  "mobile_de",
  "autoscout24",
  "kleinanzeigen",
  "ebay",
  "vinted",
  "other",
  "unknown",
]);
export type Platform = z.infer<typeof PlatformSchema>;

/** Herkunft eines Datenfelds – wird im UI transparent angezeigt. */
export const FieldSourceSchema = z.enum([
  "url", // aus der URL selbst abgeleitet (Plattform, Slug)
  "platform_api", // über offizielle Plattform-Schnittstelle importiert
  "ai_extraction", // von der KI aus Screenshots/Text gelesen
  "user", // vom Nutzer angegeben bzw. bestätigt
  "demo", // fiktive Demo-Daten
]);
export type FieldSource = z.infer<typeof FieldSourceSchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Quelle einer Aussage im Bericht (Evidenzmodell). */
export const ClaimSourceTypeSchema = z.enum([
  "listing_text",
  "listing_image",
  "user_input",
  "platform_api",
  "knowledge_base",
  "market_data",
  "user_comparables",
  "seller_reviews",
  "rule_engine",
  "ai_model_knowledge", // Modellwissen der KI – NICHT verifiziert
  "demo",
]);
export type ClaimSourceType = z.infer<typeof ClaimSourceTypeSchema>;

export const ClaimSourceSchema = z.object({
  type: ClaimSourceTypeSchema,
  label: z.string(),
  url: z.string().url().optional(),
  ref: z.string().optional(),
});

/** Evidenzstufe für Beobachtungen (insb. Bildanalyse). */
export const EvidenceLevelSchema = z.enum(["visible", "possible", "unverifiable"]);
export type EvidenceLevel = z.infer<typeof EvidenceLevelSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  statement: z.string(),
  source: ClaimSourceSchema,
  evidence: z.string().optional(),
  evidenceLevel: EvidenceLevelSchema.optional(),
  /** Referenz auf ein Bild (Upload-ID oder Demo-Pfad) als Beleg */
  imageRef: z.string().optional(),
  confidence: ConfidenceSchema,
  verified: z.boolean(),
  collectedAt: z.string(),
});
export type Claim = z.infer<typeof ClaimSchema>;

/* ────────────────────────────────────────────────────────────
 * Inserat
 * ──────────────────────────────────────────────────────────── */

export const ListingImageSchema = z.object({
  ref: z.string(), // Upload-ID oder /demo/…-Pfad
  kind: z.enum(["product_photo", "listing_screenshot", "review_screenshot", "video_frame"]),
  label: z.string().optional(),
});
export type ListingImage = z.infer<typeof ListingImageSchema>;

export const LISTING_FIELDS = [
  "title",
  "brand",
  "model",
  "variant",
  "year",
  "priceEur",
  "condition",
  "description",
  "mileageKm",
  "location",
  "firstRegistration",
  "fuel",
  "transmission",
  "powerKw",
  "engine",
  "serviceHistory",
  "accidentFree",
  "previousOwners",
  "vin",
  "storageGb",
  "batteryHealthPct",
  "accessories",
  "activationLockFree",
  "purchaseReceipt",
  "size",
  "material",
  "serialNumber",
  "boxAndPapers",
  "sellerType",
  "paymentMethods",
] as const;
export type ListingFieldKey = (typeof LISTING_FIELDS)[number];

export const ListingSchema = z.object({
  platform: PlatformSchema,
  url: z.string().optional(),
  externalId: z.string().optional(),
  category: CategorySchema,
  title: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  variant: z.string().optional(),
  year: z.number().int().optional(),
  priceEur: z.number().nonnegative().optional(),
  condition: z.string().optional(),
  description: z.string().optional(),
  mileageKm: z.number().nonnegative().optional(),
  location: z.string().optional(),
  firstRegistration: z.string().optional(),
  fuel: z.string().optional(),
  transmission: z.string().optional(),
  powerKw: z.number().nonnegative().optional(),
  engine: z.string().optional(),
  serviceHistory: z.string().optional(),
  accidentFree: z.string().optional(),
  previousOwners: z.number().int().nonnegative().optional(),
  vin: z.string().optional(),
  storageGb: z.number().nonnegative().optional(),
  batteryHealthPct: z.number().min(0).max(100).optional(),
  accessories: z.string().optional(),
  activationLockFree: z.string().optional(),
  purchaseReceipt: z.string().optional(),
  size: z.string().optional(),
  material: z.string().optional(),
  serialNumber: z.string().optional(),
  boxAndPapers: z.string().optional(),
  sellerType: z.string().optional(),
  paymentMethods: z.string().optional(),
  images: z.array(ListingImageSchema).default([]),
  /** Herkunft je Feld */
  provenance: z.record(z.string(), FieldSourceSchema).default({}),
});
export type Listing = z.infer<typeof ListingSchema>;

export const MissingInfoSchema = z.object({
  field: z.string(),
  label: z.string(),
  question: z.string(),
  importance: z.enum(["critical", "important", "helpful"]),
});
export type MissingInfo = z.infer<typeof MissingInfoSchema>;

/* ────────────────────────────────────────────────────────────
 * Marktwert
 * ──────────────────────────────────────────────────────────── */

export const PriceRatingSchema = z.enum([
  "very_good",
  "good",
  "fair",
  "rather_expensive",
  "well_above",
  "insufficient_data",
]);
export type PriceRating = z.infer<typeof PriceRatingSchema>;

export const ComparableSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  priceEur: z.number().positive(),
  priceType: z.enum(["listing", "sold"]),
  year: z.number().int().optional(),
  mileageKm: z.number().nonnegative().optional(),
  condition: z.enum(["new", "like_new", "good", "fair", "poor"]).optional(),
  region: z.string().optional(),
  listingAgeDays: z.number().nonnegative().optional(),
  url: z.string().optional(),
  source: z.string(),
  collectedAt: z.string(),
});
export type Comparable = z.infer<typeof ComparableSchema>;

export const MarketValuationSchema = z.object({
  status: z.enum(["ok", "insufficient_data"]),
  offerPriceEur: z.number().optional(),
  range: z.object({ low: z.number(), median: z.number(), high: z.number() }).optional(),
  rating: PriceRatingSchema,
  deviationPct: z.number().optional(),
  comparables: z.object({
    used: z.number().int(),
    excluded: z.number().int(),
    listingPrices: z.number().int(),
    soldPrices: z.number().int(),
    quality: z.enum(["high", "medium", "low", "none"]),
    sources: z.array(z.string()),
  }),
  method: z.string(),
  explanation: z.string(),
  adjustments: z.array(z.string()).default([]),
  /** Die relevantesten Vergleichsangebote (max. 10) – nur echte Daten bzw. gekennzeichnete Demo-Daten */
  samples: z.array(ComparableSchema.extend({ similarity: z.number().optional() })).default([]),
  collectedAt: z.string(),
});
export type MarketValuation = z.infer<typeof MarketValuationSchema>;

/* ────────────────────────────────────────────────────────────
 * Produkt, Bilder, Schwachstellen
 * ──────────────────────────────────────────────────────────── */

export const WeaknessSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  appliesTo: z.string(), // konkrete Variante/Generation, auf die sich die Aussage bezieht
  severity: z.enum(["low", "medium", "high"]),
  repairCostHint: z.string().optional(),
  checkAdvice: z.string().optional(),
  claim: ClaimSchema,
});
export type Weakness = z.infer<typeof WeaknessSchema>;

export const ImageFindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  evidenceLevel: EvidenceLevelSchema,
  imageRef: z.string().optional(),
  /** normierte Box 0..1 (x,y,w,h) – optional */
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  severity: z.enum(["info", "low", "medium", "high"]),
  claim: ClaimSchema,
});
export type ImageFinding = z.infer<typeof ImageFindingSchema>;

export const ProductAnalysisSchema = z.object({
  conditionSummary: z.string().optional(),
  weaknesses: z.array(WeaknessSchema),
  imageFindings: z.array(ImageFindingSchema),
  missingViews: z.array(z.string()),
  authenticity: z
    .object({
      applicable: z.boolean(),
      checkedFeatures: z.array(
        z.object({ feature: z.string(), status: z.enum(["consistent", "conspicuous", "unverifiable"]), note: z.string() }),
      ),
      recommendation: z.string(),
    })
    .optional(),
  notes: z.array(z.string()).default([]),
});
export type ProductAnalysis = z.infer<typeof ProductAnalysisSchema>;

/* ────────────────────────────────────────────────────────────
 * Verkäufer
 * ──────────────────────────────────────────────────────────── */

export const ComplaintCategorySchema = z.enum([
  "not_received",
  "not_as_described",
  "counterfeit_suspicion",
  "payment_issues",
  "communication",
  "shipping",
  "other",
]);
export type ComplaintCategory = z.infer<typeof ComplaintCategorySchema>;

export const ReviewSchema = z.object({
  id: z.string(),
  text: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative", "unknown"]),
  sentimentSource: z.enum(["explicit", "inferred"]),
  date: z.string().optional(),
  complaintCategories: z.array(ComplaintCategorySchema),
  evidenceRef: z.string().optional(), // Screenshot/Frame
});
export type Review = z.infer<typeof ReviewSchema>;

export const SellerAnalysisSchema = z.object({
  inputMethod: z.enum(["platform_api", "screenshots", "screen_recording", "pasted_text", "demo"]),
  visibleReviewCount: z.number().int(),
  duplicatesRemoved: z.number().int(),
  unreadableSegments: z.number().int(),
  positive: z.number().int(),
  neutral: z.number().int(),
  negative: z.number().int(),
  unknown: z.number().int(),
  platformTotalClaimed: z.number().int().optional(),
  coverageNote: z.string(),
  complaints: z.array(
    z.object({
      category: ComplaintCategorySchema,
      count: z.number().int(),
      examples: z.array(z.object({ text: z.string(), evidenceRef: z.string().optional() })),
    }),
  ),
  patterns: z.array(z.object({ title: z.string(), detail: z.string(), severity: z.enum(["info", "low", "medium"]) })),
  trustSignals: z.array(z.string()),
  summary: z.string(),
  reviews: z.array(ReviewSchema),
  disclaimer: z.string(),
});
export type SellerAnalysis = z.infer<typeof SellerAnalysisSchema>;

/* ────────────────────────────────────────────────────────────
 * Risiken, Empfehlungen, Score
 * ──────────────────────────────────────────────────────────── */

export const RiskFindingSchema = z.object({
  id: z.string(),
  rule: z.string(),
  area: z.enum(["price", "plausibility", "payment", "seller", "information", "images", "security"]),
  severity: z.enum(["info", "low", "medium", "high"]),
  title: z.string(),
  explanation: z.string(),
  evidence: z.array(z.string()),
  /** Hinweis, warum dies kein Beweis ist (Fairness) */
  caveat: z.string().optional(),
  source: ClaimSourceTypeSchema,
});
export type RiskFinding = z.infer<typeof RiskFindingSchema>;

export const PaymentAdviceSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  kind: z.enum(["recommended", "caution", "avoid", "handover", "documents"]),
});
export type PaymentAdvice = z.infer<typeof PaymentAdviceSchema>;

export const ChecklistSchema = z.object({
  questionsForSeller: z.array(z.string()),
  inspection: z.array(z.string()),
  documents: z.array(z.string()),
  expensiveDamages: z.array(z.string()),
});
export type Checklist = z.infer<typeof ChecklistSchema>;

export const NegotiationSchema = z.object({
  possible: z.boolean(),
  arguments: z.array(z.object({ text: z.string(), basis: z.string() })),
  suggestedOpeningEur: z.number().optional(),
  message: z.string().optional(),
  note: z.string(),
});
export type Negotiation = z.infer<typeof NegotiationSchema>;

export const SubScoreSchema = z.object({
  score: z.number().min(0).max(100).nullable(),
  label: z.string(),
  reasons: z.array(z.string()),
});
export type SubScore = z.infer<typeof SubScoreSchema>;

export const RecommendationSchema = z.enum(["interesting", "inspect_further", "elevated_risk", "missing_info"]);
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const DealScoreSchema = z.object({
  overall: z.number().min(0).max(100).nullable(),
  recommendation: RecommendationSchema,
  price: SubScoreSchema,
  product: SubScoreSchema,
  seller: SubScoreSchema,
  plausibility: SubScoreSchema,
  caps: z.array(z.string()),
  explanation: z.string(),
});
export type DealScore = z.infer<typeof DealScoreSchema>;

export const DataQualitySchema = z.object({
  score: z.number().min(0).max(100),
  level: z.enum(["high", "medium", "low", "insufficient"]),
  completeness: z.number().min(0).max(1),
  gaps: z.array(z.string()),
  uncertainty: z.string(),
});
export type DataQuality = z.infer<typeof DataQualitySchema>;

export const StepLogSchema = z.object({
  step: z.string(),
  label: z.string(),
  status: z.enum(["ok", "skipped", "failed", "partial"]),
  durationMs: z.number(),
  note: z.string().optional(),
});
export type StepLog = z.infer<typeof StepLogSchema>;

export const AnalysisModeSchema = z.enum(["demo", "live_ai", "rules_only"]);
export type AnalysisMode = z.infer<typeof AnalysisModeSchema>;

export const VehicleHistorySchema = z.object({
  status: z.enum(["not_requested", "unavailable", "demo", "ok"]),
  provider: z.string(),
  note: z.string(),
  entries: z.array(z.object({ date: z.string(), event: z.string(), mileageKm: z.number().optional() })).default([]),
});

export const AnalysisReportSchema = z.object({
  id: z.string(),
  version: z.literal(1),
  mode: AnalysisModeSchema,
  isDemo: z.boolean(),
  tier: z.enum(["full", "quick"]),
  createdAt: z.string(),
  listing: ListingSchema,
  missingInfo: z.array(MissingInfoSchema),
  market: MarketValuationSchema,
  product: ProductAnalysisSchema,
  seller: SellerAnalysisSchema.optional(),
  risks: z.array(RiskFindingSchema),
  payment: z.array(PaymentAdviceSchema),
  checklist: ChecklistSchema,
  sellerMessage: z.string().optional(),
  negotiation: NegotiationSchema,
  vehicleHistory: VehicleHistorySchema.optional(),
  score: DealScoreSchema,
  dataQuality: DataQualitySchema,
  summary: z.string(),
  pipeline: z.array(StepLogSchema),
  disclaimer: z.string(),
});
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
