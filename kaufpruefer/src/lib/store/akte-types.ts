/**
 * Datenmodelle der gemeinsamen Kaufakte (V4).
 *
 * Eine Kaufakte = eine Analyse (AnalysisRecord) + beliebig viele, unabhängig
 * versionierte Module (Verkäuferchat, Besichtigung, Gesamtkosten, Bildabgleich,
 * Inserats-Schnappschüsse). Module werden nie überschrieben, sondern als neue
 * Version angelegt – ältere Stände bleiben nachvollziehbar, solange ihre
 * Löschfrist nicht abgelaufen ist.
 */
import type { Platform } from "../domain/schemas";

export type ModuleKind = "chat_check" | "inspection" | "costs" | "image_match" | "snapshot";

export interface ModuleRecord<T = unknown> {
  id: string;
  analysisId: string;
  userId: string;
  kind: ModuleKind;
  /** Fortlaufend je (Analyse, Modul), beginnend bei 1 */
  version: number;
  createdAt: string;
  updatedAt?: string;
  /** Hash der Eingaben – gleiche Eingaben erzeugen keine neue Version */
  inputHash?: string;
  /** Löschfrist (z. B. Chatverläufe), danach automatische Löschung */
  expiresAt?: string;
  data: T;
}

// ── Hintergrundjobs ─────────────────────────────────────────
export type JobType = "chat_check" | "watch_check" | "video_frames" | "image_match";
export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface JobRecord {
  id: string;
  type: JobType;
  userId?: string;
  analysisId?: string;
  /** Doppelte Aufträge (z. B. Doppelklick) erzeugen keinen zweiten Job */
  idempotencyKey: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  /** Laufzeit-Lease: Ein abgestürzter Worker gibt den Job nach Ablauf frei */
  leaseUntil?: string;
  progress: number;
  message?: string;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  cancelRequested?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Angebotsbeobachtung ─────────────────────────────────────
export interface WatchRecord {
  id: string;
  analysisId: string;
  userId: string;
  platform: Platform;
  url?: string;
  externalId?: string;
  /**
   * auto   = automatische Abfrage über eine offiziell erlaubte Schnittstelle (z. B. eBay Browse API)
   * manual = keine erlaubte automatische Abfrage – Aktualisierung nur durch den Nutzer
   */
  mode: "auto" | "manual";
  intervalHours: number;
  active: boolean;
  notify: { inApp: boolean; email: boolean; push: boolean };
  createdAt: string;
  lastCheckedAt?: string;
  nextCheckAt?: string;
  lastError?: string;
  /** Bezahlte Laufzeit (Token je Zeitraum) */
  paidUntil?: string;
  periodsPaid?: number;
  /** Erinnerung zum Aktualisieren (Plattformen ohne erlaubte automatische Abfrage) */
  reminderDays?: number;
  lastReminderAt?: string;
  /** Hinweis „Beobachtung läuft ab/abgelaufen“ bereits verschickt */
  expiryNotifiedAt?: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  kind: "price_change" | "listing_change" | "listing_unavailable" | "job_done" | "info";
  title: string;
  body: string;
  link?: string;
  createdAt: string;
  readAt?: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  userId: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

// ── Bildabgleich ────────────────────────────────────────────
export interface ImageHashRecord {
  id: string;
  analysisId: string;
  userId: string;
  listingKey?: string;
  platform: Platform;
  /** Öffentliche Inserats-URL (keine Bilddaten gespeichert) */
  listingUrl?: string;
  imageRef?: string;
  /** 64-Bit-Differenz-Hash (hex) */
  dhash: string;
  /** 64-Bit-DCT-Hash (hex) */
  phash: string;
  /** Vier 16-Bit-Bänder des pHash für die Kandidatensuche */
  bands: string[];
  sha256: string;
  width: number;
  height: number;
  capturedAt: string;
  expiresAt: string;
}

// ── Teilen-Eingang ──────────────────────────────────────────
export interface ShareInboxRecord {
  id: string;
  createdAt: string;
  expiresAt: string;
  title?: string;
  text?: string;
  url?: string;
  uploadIds: string[];
  claimedBy?: string;
}

export interface AkteStore {
  // Module (versioniert)
  addModule<T>(m: Omit<ModuleRecord<T>, "version">): Promise<ModuleRecord<T>>;
  updateModule<T>(id: string, userId: string, patch: { data: T; updatedAt: string }): Promise<void>;
  listModules(analysisId: string, userId: string, kind?: ModuleKind): Promise<ModuleRecord[]>;
  deleteModule(id: string, userId: string): Promise<void>;
  deleteExpiredModules(now: string): Promise<number>;

  // Jobs
  enqueueJob(j: JobRecord): Promise<{ job: JobRecord; created: boolean }>;
  claimJob(now: string, leaseSeconds: number, types?: JobType[]): Promise<JobRecord | null>;
  updateJob(id: string, patch: Partial<JobRecord>): Promise<void>;
  getJob(id: string): Promise<JobRecord | null>;
  listJobs(filter: { userId?: string; analysisId?: string; type?: JobType; limit?: number }): Promise<JobRecord[]>;

  // Beobachtungen
  upsertWatch(w: WatchRecord): Promise<void>;
  getWatchByAnalysis(analysisId: string, userId: string): Promise<WatchRecord | null>;
  getWatch(id: string): Promise<WatchRecord | null>;
  listWatches(userId: string): Promise<WatchRecord[]>;
  listDueWatches(now: string, limit: number): Promise<WatchRecord[]>;
  /** Alle aktiven Beobachtungen (für Erinnerungen und Laufzeitende) */
  listActiveWatches(limit: number): Promise<WatchRecord[]>;
  deleteWatch(id: string, userId: string): Promise<void>;

  // Benachrichtigungen
  addNotification(n: NotificationRecord): Promise<void>;
  listNotifications(userId: string, limit?: number): Promise<NotificationRecord[]>;
  markNotificationsRead(userId: string, ids?: string[]): Promise<void>;
  countNotificationsSince(userId: string, since: string): Promise<number>;
  savePushSubscription(s: PushSubscriptionRecord): Promise<void>;
  listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]>;
  deletePushSubscription(endpoint: string): Promise<void>;

  // Bild-Hashes
  addImageHashes(rows: ImageHashRecord[]): Promise<void>;
  /** Kandidaten mit mindestens einem übereinstimmenden Band (LSH) */
  findImageHashCandidates(bands: string[], limit: number): Promise<ImageHashRecord[]>;
  listImageHashes(analysisId: string, userId: string): Promise<ImageHashRecord[]>;
  deleteExpiredImageHashes(now: string): Promise<number>;

  // Teilen-Eingang (einmalig abholbar)
  putShareInbox(s: ShareInboxRecord): Promise<void>;
  takeShareInbox(id: string, userId: string, now: string): Promise<ShareInboxRecord | null>;
  reassignUpload(id: string, fromOwner: string, toOwner: string): Promise<void>;
  /** Löschfrist eines eigenen Uploads ändern (z. B. Besichtigungsfotos länger aufbewahren) */
  setUploadExpiry(id: string, ownerKey: string, expiresAt: string): Promise<void>;
}
