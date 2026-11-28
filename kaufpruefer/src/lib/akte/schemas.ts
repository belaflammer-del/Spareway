import { z } from "zod";
import { RecommendationSchema } from "../domain/schemas";

/* ────────────────────────────────────────────────────────────
 * Verkäuferchat
 * ──────────────────────────────────────────────────────────── */

export const ChatSenderSchema = z.enum(["seller", "buyer", "unknown"]);
export const ChatMessageSchema = z.object({
  id: z.string(),
  sender: ChatSenderSchema,
  text: z.string(),
  time: z.string().optional(),
  source: z.enum(["screenshot", "video_frame", "pasted_text"]),
  /** Bildnummer (Screenshot/Frame), aus dem die Nachricht stammt */
  imageIndex: z.number().int().optional(),
  /** Personenbezogene Daten wurden geschwärzt */
  redacted: z.boolean(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const CHAT_CATEGORIES = ["payment", "communication", "contradiction", "shipping", "phishing", "personal_data", "missing_info"] as const;
export const ChatCategorySchema = z.enum(CHAT_CATEGORIES);
export type ChatCategory = z.infer<typeof ChatCategorySchema>;

export const SignalLevelSchema = z.enum(["hint", "warning", "high"]);
export const ChatSignalSchema = z.object({
  id: z.string(),
  category: ChatCategorySchema,
  level: SignalLevelSchema,
  title: z.string(),
  explanation: z.string(),
  evidence: z.array(z.object({ messageId: z.string().optional(), quote: z.string() })),
  basis: z.enum(["rule", "ai"]),
});
export type ChatSignal = z.infer<typeof ChatSignalSchema>;

export const ChatContradictionSchema = z.object({
  id: z.string(),
  field: z.string(),
  listingStatement: z.string(),
  chatStatement: z.string(),
  messageId: z.string().optional(),
  /** documented = beide Aussagen liegen wörtlich vor und schließen sich aus; possible = Deutung nötig */
  kind: z.enum(["documented", "possible"]),
  explanation: z.string(),
  basis: z.enum(["rule", "ai"]),
});
export type ChatContradiction = z.infer<typeof ChatContradictionSchema>;

export const CategoryLevelSchema = z.enum(["none", "hint", "warning", "high"]);
export const ChatCheckDataSchema = z.object({
  input: z.object({
    method: z.enum(["screenshots", "screen_recording", "pasted_text", "mixed"]),
    images: z.number().int(),
    textChars: z.number().int(),
    redaction: z.boolean(),
  }),
  messages: z.array(ChatMessageSchema),
  duplicatesRemoved: z.number().int(),
  unreadable: z.number().int(),
  categories: z.record(ChatCategorySchema, z.object({ level: CategoryLevelSchema, count: z.number().int() })),
  signals: z.array(ChatSignalSchema),
  contradictions: z.array(ChatContradictionSchema),
  recommendations: z.object({
    warnings: z.array(z.string()),
    safePayment: z.array(z.string()),
    questions: z.array(z.string()),
    replyDraft: z.string().optional(),
  }),
  updatedRecommendation: z.object({
    previous: RecommendationSchema,
    current: RecommendationSchema,
    reason: z.string(),
  }),
  aiUsed: z.boolean(),
  injectionAttemptDetected: z.boolean().default(false),
  collectedAt: z.string(),
  disclaimer: z.string(),
});
export type ChatCheckData = z.infer<typeof ChatCheckDataSchema>;

/* ────────────────────────────────────────────────────────────
 * Besichtigung
 * ──────────────────────────────────────────────────────────── */

export const InspectionStatusSchema = z.enum(["ok", "conspicuous", "unchecked", "na"]);
export type InspectionStatus = z.infer<typeof InspectionStatusSchema>;

export const InspectionPhotoSchema = z.object({
  uploadId: z.string(),
  takenAt: z.string(),
  analysis: z
    .object({
      findings: z.array(z.object({ title: z.string(), detail: z.string(), evidenceLevel: z.enum(["visible", "possible", "unverifiable"]) })),
      comparedWithListing: z.boolean(),
      listingComparison: z.string().optional(),
      note: z.string(),
    })
    .optional(),
});

export const InspectionItemSchema = z.object({
  id: z.string(),
  group: z.string(),
  title: z.string(),
  how: z.string().optional(),
  /** Warum dieser Punkt (Bezug auf Inserat, Befund, Schwachstelle, Chat …) */
  reason: z.string().optional(),
  origin: z.enum(["template", "listing", "finding", "weakness", "risk", "chat", "missing_info"]),
  priority: z.enum(["high", "normal"]),
  photoSuggested: z.boolean(),
  status: InspectionStatusSchema,
  note: z.string().max(2000).optional(),
  photos: z.array(InspectionPhotoSchema).default([]),
  updatedAt: z.string().optional(),
});
export type InspectionItem = z.infer<typeof InspectionItemSchema>;

export const InspectionDataSchema = z.object({
  state: z.enum(["in_progress", "finished"]),
  category: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  items: z.array(InspectionItemSchema),
  openQuestions: z.array(z.string()).default([]),
  generalNote: z.string().max(4000).optional(),
  report: z
    .object({
      checked: z.number().int(),
      ok: z.number().int(),
      conspicuous: z.number().int(),
      unchecked: z.number().int(),
      na: z.number().int(),
      highPriorityOpen: z.number().int(),
      risk: z.enum(["low", "medium", "high", "incomplete"]),
      riskText: z.string(),
      updatedRecommendation: RecommendationSchema,
    })
    .optional(),
  safetyNote: z.string(),
});
export type InspectionData = z.infer<typeof InspectionDataSchema>;

/* ────────────────────────────────────────────────────────────
 * Gesamtkosten
 * ──────────────────────────────────────────────────────────── */

export const CostLineSchema = z.object({
  id: z.string(),
  item: z.string(),
  label: z.string(),
  /** documented = belegt (Inserat, Beleg, Kostenvoranschlag); estimated = Richtwert aus Kostentabelle; risk = mögliches Risiko */
  kind: z.enum(["documented", "estimated", "risk"]),
  lowEur: z.number().nonnegative().optional(),
  highEur: z.number().nonnegative().optional(),
  /** Betrag unbekannt – wird NICHT erfunden */
  amountUnknown: z.boolean(),
  source: z.string(),
  sourceDate: z.string().optional(),
  reason: z.string(),
  optional: z.boolean().default(false),
});
export type CostLine = z.infer<typeof CostLineSchema>;

export const UserCostInputSchema = z.object({
  id: z.string(),
  item: z.string(),
  label: z.string().max(120),
  lowEur: z.number().nonnegative().max(1_000_000),
  highEur: z.number().nonnegative().max(1_000_000),
  kind: z.enum(["documented", "estimated"]),
  note: z.string().max(300).optional(),
});
export type UserCostInput = z.infer<typeof UserCostInputSchema>;

export const CostAnalysisDataSchema = z.object({
  offerPriceEur: z.number().optional(),
  lines: z.array(CostLineSchema),
  userInputs: z.array(UserCostInputSchema),
  totals: z.object({
    documentedLow: z.number(),
    documentedHigh: z.number(),
    estimatedLow: z.number(),
    estimatedHigh: z.number(),
    riskLow: z.number(),
    riskHigh: z.number(),
    /** Kaufpreis + belegt + geschätzt (ohne Risikoreserve) */
    expectedLow: z.number().optional(),
    expectedHigh: z.number().optional(),
    /** Szenario inkl. bezifferbarer Risiken */
    withRiskHigh: z.number().optional(),
    unknownCount: z.number().int(),
  }),
  dataQuality: z.object({ score: z.number().int(), label: z.string(), note: z.string() }),
  computedAt: z.string(),
  usesDemoTable: z.boolean(),
  disclaimer: z.string(),
});
export type CostAnalysisData = z.infer<typeof CostAnalysisDataSchema>;

/* ────────────────────────────────────────────────────────────
 * Bildabgleich
 * ──────────────────────────────────────────────────────────── */

export const MatchClassSchema = z.enum(["identical", "strong", "possible", "none"]);
export type MatchClass = z.infer<typeof MatchClassSchema>;

export const ImageMatchDataSchema = z.object({
  checkedImages: z.number().int(),
  scope: z.object({
    withinListing: z.boolean(),
    ownDatabase: z.boolean(),
    ownDatabaseSize: z.number().int().optional(),
    externalSearch: z.boolean(),
    externalProvider: z.string().optional(),
  }),
  withinListing: z.array(z.object({ a: z.number().int(), b: z.number().int(), class: MatchClassSchema, distance: z.number() })),
  matches: z.array(
    z.object({
      imageIndex: z.number().int(),
      class: MatchClassSchema,
      similarityPct: z.number(),
      source: z.string(),
      capturedAt: z.string(),
      listingUrl: z.string().optional(),
      /** Nur eigene Kaufakten: Verweis auf die andere Analyse */
      ownAnalysisId: z.string().optional(),
      samePlatform: z.boolean(),
    }),
  ),
  summary: z.enum(["identical", "strong", "possible", "none"]),
  transparency: z.string(),
  caveat: z.string(),
  checkedAt: z.string(),
});
export type ImageMatchData = z.infer<typeof ImageMatchDataSchema>;

/* ────────────────────────────────────────────────────────────
 * Inserats-Schnappschuss (Preisverlauf / Änderungen)
 * ──────────────────────────────────────────────────────────── */

export const SnapshotDataSchema = z.object({
  capturedAt: z.string(),
  source: z.enum(["initial_analysis", "platform_api", "manual_screenshot", "manual_text", "manual_price", "page_capture"]),
  priceEur: z.number().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  attributes: z.record(z.string(), z.string()).default({}),
  available: z.enum(["yes", "no", "unknown"]),
  changes: z
    .array(
      z.object({
        type: z.enum(["price", "attribute", "statement_removed", "statement_added", "text_changed", "availability"]),
        field: z.string().optional(),
        before: z.string().optional(),
        after: z.string().optional(),
        summary: z.string(),
        important: z.boolean(),
      }),
    )
    .default([]),
  /** Kurze Zusammenfassung der Änderungen mit Kaufeinschätzung */
  summary: z
    .object({ text: z.string(), assessment: z.string(), tone: z.enum(["positive", "neutral", "caution"]), basis: z.enum(["rules", "ai"]) })
    .optional(),
});
export type SnapshotData = z.infer<typeof SnapshotDataSchema>;

// ── Kaufausgang („Gespart“-Zähler) ─────────────────────────
/** Angaben des Nutzers, wie es ausgegangen ist. Ersparnis = Angebotspreis − bezahlter Preis. */
export const OutcomeInputSchema = z
  .object({
    status: z.enum(["bought", "not_bought"]),
    paidEur: z.number().positive().max(10_000_000).optional(),
  })
  .refine((x) => x.status === "not_bought" || x.paidEur != null, { message: "Bitte gib den bezahlten Preis an." });
export type OutcomeInput = z.infer<typeof OutcomeInputSchema>;

export const OutcomeDataSchema = z.object({
  status: z.enum(["bought", "not_bought"]),
  paidEur: z.number().positive().optional(),
  /** Angebotspreis laut Anzeige zum Zeitpunkt der Prüfung */
  askingEur: z.number().positive().optional(),
  /** Gesamtempfehlung zum Entscheidungszeitpunkt */
  recommendation: RecommendationSchema,
  decidedAt: z.string(),
});
export type OutcomeData = z.infer<typeof OutcomeDataSchema>;
