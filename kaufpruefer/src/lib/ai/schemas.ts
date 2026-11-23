/**
 * Strukturierte KI-Ausgaben (strict JSON Schema → alle Felder required,
 * optionale Werte als nullable). Bewusst NICHT enthalten: Marktwerte,
 * Preisbewertungen oder Scores – diese berechnet ausschließlich die
 * regelbasierte Engine.
 */
import { z } from "zod";
import { CategorySchema } from "../domain/schemas";

const s = () => z.string().nullable();
const n = () => z.number().nullable();

export const ExtractionOutputSchema = z.object({
  category: CategorySchema,
  fields: z.object({
    title: s(),
    brand: s(),
    model: s(),
    variant: s(),
    year: n(),
    priceEur: n(),
    condition: s(),
    description: s(),
    mileageKm: n(),
    location: s(),
    firstRegistration: s(),
    fuel: s(),
    transmission: s(),
    powerKw: n(),
    engine: s(),
    serviceHistory: s(),
    accidentFree: s(),
    previousOwners: n(),
    vin: s(),
    storageGb: n(),
    batteryHealthPct: n(),
    accessories: s(),
    activationLockFree: s(),
    purchaseReceipt: s(),
    size: s(),
    material: s(),
    serialNumber: s(),
    boxAndPapers: s(),
    sellerType: s(),
    paymentMethods: s(),
  }),
  lowConfidenceFields: z.array(z.string()),
  /** Widersprüchliche Werte für dasselbe Feld auf verschiedenen Bildern/Texten */
  conflicts: z.array(z.object({ field: z.string(), values: z.array(z.string()), imageIndexes: z.array(z.number().int()) })),
  /** Jeder einzeln gelesene Wert pro Bild (für die deterministische Zusammenführung) */
  observations: z.array(
    z.object({ field: z.string(), value: z.string(), imageIndex: z.number().int().nullable(), confidence: z.enum(["high", "medium", "low"]) }),
  ),
  images: z.array(
    z.object({
      index: z.number().int(),
      kind: z.enum(["product_photo", "listing_screenshot", "review_screenshot", "other"]),
    }),
  ),
  readabilityIssues: z.array(z.string()),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

export const ProductOutputSchema = z.object({
  conditionSummary: s(),
  imageFindings: z.array(
    z.object({
      imageIndex: z.number().int().nullable(),
      title: z.string(),
      detail: z.string(),
      evidenceLevel: z.enum(["visible", "possible", "unverifiable"]),
      severity: z.enum(["info", "low", "medium", "high"]),
      box: z.array(z.number()).nullable(),
    }),
  ),
  missingViews: z.array(z.string()),
  textImageInconsistencies: z.array(
    z.object({ title: z.string(), detail: z.string(), imageIndex: z.number().int().nullable(), severity: z.enum(["low", "medium"]) }),
  ),
  modelKnowledgeHints: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      appliesTo: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      checkAdvice: z.string(),
    }),
  ),
  authenticityFeatures: z.array(
    z.object({ feature: z.string(), status: z.enum(["consistent", "conspicuous", "unverifiable"]), note: z.string() }),
  ),
  questionsForSeller: z.array(z.string()),
  inspection: z.array(z.string()),
  documents: z.array(z.string()),
  expensiveDamages: z.array(z.string()),
  injectionAttemptDetected: z.boolean(),
});
export type ProductOutput = z.infer<typeof ProductOutputSchema>;

export const ReviewOcrOutputSchema = z.object({
  reviews: z.array(
    z.object({
      text: z.string(),
      sentiment: z.enum(["positive", "neutral", "negative", "unknown"]),
      sentimentIsExplicit: z.boolean(),
      date: s(),
      imageIndex: z.number().int(),
    }),
  ),
  unreadableCount: z.number().int(),
  platformTotalClaimed: n(),
});
export type ReviewOcrOutput = z.infer<typeof ReviewOcrOutputSchema>;

export const ComposeOutputSchema = z.object({
  sellerMessage: z.string(),
  negotiationMessage: s(),
  sellerSummary: s(),
  overallSummary: z.string(),
});
export type ComposeOutput = z.infer<typeof ComposeOutputSchema>;
