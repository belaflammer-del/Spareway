import type { AnalysisReport, Category, Platform } from "../domain/schemas";
import type { AkteStore } from "./akte-types";
import type { CostTableEntry } from "../costs/table";

export type * from "./akte-types";

export interface UserRecord {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  /** nur Lokalmodus */
  passwordHash?: string;
}

export interface AnalysisRecord {
  id: string;
  userId: string;
  status: "running" | "completed" | "failed";
  tier: "full" | "quick";
  category: Category;
  platform: Platform;
  title: string;
  createdAt: string;
  completedAt?: string;
  report?: AnalysisReport;
  errorCode?: string;
  reservationId?: string;
  aiCostUsd: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  mode: AnalysisReport["mode"];
  /** Fingerabdruck der Eingaben – identische Prüfungen werden wiederverwendet */
  fingerprint?: string;
  aiModel?: string;
  durationMs?: number;
  /** Normalisierte Inseratskennung (Plattform + ID bzw. bereinigte URL) */
  listingKey?: string;
  /** Vorherige Prüfung desselben Inserats (Versionierung) */
  previousId?: string;
  analysisVersion?: number;
  priceEur?: number;
  recommendation?: string;
  priceRating?: string;
  /** Kleines Vorschaubild (WebP-Data-URL, ohne Metadaten) */
  thumbnail?: string;
  /** Gespeicherte Rückfragen an den KI-Assistenten */
  chat?: { q: string; a: string; at: string; grounded: boolean }[];
}

export interface AnalysisQuery {
  q?: string;
  category?: string;
  platform?: string;
  status?: "completed" | "incomplete";
  recommendation?: string;
  sort?: "date_desc" | "date_asc" | "price_desc" | "price_asc";
  page?: number;
  pageSize?: number;
}

export type WalletTxType = "purchase" | "reserve" | "release" | "purchase_refund" | "admin_adjust" | "test_credit";

export interface WalletTx {
  id: string;
  userId: string;
  type: WalletTxType;
  amount: number; // positiv = Gutschrift, negativ = Belastung
  balanceAfter: number;
  refId?: string;
  idempotencyKey: string;
  note?: string;
  createdAt: string;
}

export interface Reservation {
  id: string;
  userId: string;
  analysisId: string;
  amount: number;
  status: "reserved" | "captured" | "released";
  createdAt: string;
  updatedAt: string;
}

export interface Purchase {
  id: string;
  userId: string;
  packageId: string;
  tokens: number;
  amountCents: number;
  currency: "eur";
  status: "pending" | "paid" | "refunded" | "failed";
  provider: "stripe" | "test";
  providerRef?: string; // Stripe Checkout Session ID
  paymentIntent?: string;
  createdAt: string;
  paidAt?: string;
}

export interface UploadRecord {
  id: string;
  ownerKey: string; // userId oder anonyme Sitzungs-ID
  kind: "image" | "video" | "frame";
  mime: string;
  size: number;
  storagePath: string;
  createdAt: string;
  expiresAt: string;
}

export interface AppConfig {
  pricing?: {
    packages: { id: string; tokens: number; priceCents: number; label: string }[];
    fullCheckCost: number;
    vehicleHistoryPriceCents: number;
  };
  demoVisibility?: Record<string, boolean>;
  providers?: Record<string, boolean>;
  ai?: { model?: string; fastModel?: string; dailyBudgetUsd?: number };
  limits?: {
    perAnalysisUsd?: number;
    perUserDayUsd?: number;
    globalMonthUsd?: number;
    maxCallsPerAnalysis?: number;
    maxImagesPerUpload?: number;
    videoMaxSeconds?: number;
    videoMaxMb?: number;
    chatQuestionsPerAnalysis?: number;
    /** V4: Verkäuferchat-Prüfungen je Kaufakte */
    chatChecksPerAnalysis?: number;
    chatScreenshotsMax?: number;
    /** V4: Besichtigung */
    inspectionPhotosMax?: number;
    inspectionPhotoAiMax?: number;
    /** V4: Bildabgleich-Läufe je Kaufakte */
    imageMatchPerAnalysis?: number;
    /** V4: Beobachtung */
    watchesPerUser?: number;
    watchMinIntervalHours?: number;
    watchManualUpdatesPerDay?: number;
    notificationsPerUserDay?: number;
  };
  /** V4: Löschfristen in Tagen */
  retention?: { chatDays?: number; inspectionDays?: number; imageHashDays?: number; snapshotDays?: number };
  /** V4: Gesamtkosten-Richtwerte – nur vom Betreiber gepflegte, belegte Einträge */
  costTable?: CostTableEntry[];
  /** V4: Guardian-Paket (Produktkonzept, standardmäßig deaktiviert, keine Zahlung) */
  guardian?: { enabled?: boolean; priceCents?: number; chatChecks?: number };
  /** Kategorie-Status: live = kostenpflichtiger Komplettcheck, beta = nur Schnellcheck */
  categories?: Record<string, "live" | "beta" | "off">;
}

export interface AdminStats {
  users: number;
  usersLast7d: number;
  analyses: number;
  analysesCompleted: number;
  analysesFailed: number;
  quickChecks: number;
  tokensSold: number;
  revenueCents: number;
  refundsCents: number;
  aiCostUsdTotal: number;
  aiCostUsdAvg: number;
  byCategory: Record<string, number>;
  byMode: Record<string, number>;
  recentFailures: { id: string; createdAt: string; category: string; errorCode: string }[];
  purchasesByPackage: Record<string, number>;
  activeUsers30d: number;
  sellerChecks: number;
  comparisons: number;
  reusedAnalyses: number;
  avgDurationMs: number;
  topErrors: { code: string; count: number }[];
}

export class WalletError extends Error {
  constructor(
    public code: "insufficient_balance" | "not_found" | "invalid_state",
    message: string,
  ) {
    super(message);
  }
}

export interface DataStore extends AkteStore {
  kind: "local" | "supabase";

  // Benutzer
  getUser(id: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  createUser(u: UserRecord): Promise<void>;
  updateUser(id: string, patch: Partial<UserRecord>): Promise<void>;
  deleteUserData(userId: string): Promise<void>;
  exportUserData(userId: string): Promise<Record<string, unknown>>;

  // Analysen
  createAnalysis(a: AnalysisRecord): Promise<void>;
  updateAnalysis(id: string, patch: Partial<AnalysisRecord>): Promise<void>;
  getAnalysis(id: string, userId: string): Promise<AnalysisRecord | null>;
  listAnalyses(userId: string, limit?: number): Promise<AnalysisRecord[]>;
  findAnalysisByFingerprint(userId: string, fingerprint: string, since: string): Promise<AnalysisRecord | null>;
  findLatestByListingKey(userId: string, listingKey: string): Promise<AnalysisRecord | null>;
  queryAnalyses(userId: string, q: AnalysisQuery): Promise<{ items: AnalysisRecord[]; total: number }>;
  deleteAnalysis(id: string, userId: string): Promise<void>;
  countQuickCheck(): Promise<void>;
  /** Allgemeine Zähler (Nutzung von Funktionen, KI-Kosten pro Tag in Mikro-USD) */
  countEvent(name: string, by?: number): Promise<void>;
  getCounter(name: string): Promise<number>;

  // Wallet (atomar, idempotent)
  getBalance(userId: string): Promise<number>;
  listTransactions(userId: string, limit?: number): Promise<WalletTx[]>;
  reserveTokens(userId: string, analysisId: string, amount: number, idempotencyKey: string): Promise<Reservation>;
  captureReservation(reservationId: string): Promise<void>;
  releaseReservation(reservationId: string, note?: string): Promise<void>;
  /** Gutschrift nach bestätigter Zahlung – idempotent über idempotencyKey */
  creditTokens(userId: string, amount: number, type: "purchase" | "admin_adjust" | "test_credit", idempotencyKey: string, refId?: string, note?: string): Promise<{ applied: boolean }>;
  /** Rückbuchung bei Erstattung – nie unter 0 */
  debitRefund(userId: string, amount: number, idempotencyKey: string, refId?: string): Promise<{ applied: boolean; debited: number }>;

  // Käufe
  createPurchase(p: Purchase): Promise<void>;
  updatePurchaseByRef(providerRef: string, patch: Partial<Purchase>): Promise<Purchase | null>;
  getPurchaseByRef(providerRef: string): Promise<Purchase | null>;
  getPurchaseByPaymentIntent(pi: string): Promise<Purchase | null>;
  listPurchases(userId: string): Promise<Purchase[]>;

  // Uploads
  createUpload(u: UploadRecord): Promise<void>;
  getUpload(id: string): Promise<UploadRecord | null>;
  deleteUpload(id: string): Promise<void>;
  listExpiredUploads(now: string): Promise<UploadRecord[]>;
  listUploadsByOwner(ownerKey: string): Promise<UploadRecord[]>;

  // Rate Limiting (Fenster-Zähler)
  hitRateLimit(key: string, windowSeconds: number, limit: number): Promise<{ allowed: boolean; remaining: number; resetAt: string }>;

  // Konfiguration & Admin
  getConfig(): Promise<AppConfig>;
  setConfig(patch: AppConfig): Promise<void>;
  adminStats(): Promise<AdminStats>;
}
