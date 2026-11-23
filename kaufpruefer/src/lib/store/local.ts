/**
 * Lokale Datei-Datenbank (JSON) für Entwicklung und Demo-Betrieb ohne Supabase.
 * NICHT für Produktion gedacht (keine horizontale Skalierung).
 * Alle Schreibvorgänge laufen über eine prozessweite Warteschlange (Mutex),
 * Wallet-Buchungen sind dadurch atomar und idempotent.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { newId, nowIso } from "../utils";
import {
  WalletError,
  type AdminStats,
  type AnalysisQuery,
  type AnalysisRecord,
  type AppConfig,
  type DataStore,
  type Purchase,
  type Reservation,
  type UploadRecord,
  type UserRecord,
  type WalletTx,
} from "./types";

export interface LocalSession {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}
export interface LocalToken {
  tokenHash: string;
  userId: string;
  purpose: "verify_email" | "reset_password";
  expiresAt: string;
}

interface DB {
  users: UserRecord[];
  sessions: LocalSession[];
  tokens: LocalToken[];
  analyses: AnalysisRecord[];
  tx: WalletTx[];
  reservations: Reservation[];
  purchases: Purchase[];
  uploads: UploadRecord[];
  rate: Record<string, { count: number; resetAt: string }>;
  config: AppConfig;
  counters: { quickChecks: number; [k: string]: number };
}

const empty = (): DB => ({
  users: [],
  sessions: [],
  tokens: [],
  analyses: [],
  tx: [],
  reservations: [],
  purchases: [],
  uploads: [],
  rate: {},
  config: {},
  counters: { quickChecks: 0 },
});

export class LocalStore implements DataStore {
  kind = "local" as const;
  private db: DB | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string = path.join(process.cwd(), ".data", "db.json")) {}

  private async load(): Promise<DB> {
    if (this.db) return this.db;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      this.db = { ...empty(), ...JSON.parse(raw) } as DB;
    } catch {
      this.db = empty();
    }
    return this.db;
  }

  private async persist() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.db), "utf8");
    await fs.rename(tmp, this.file);
  }

  /** Serialisiert Lese-/Schreibzugriffe. */
  private tx<T>(fn: (db: DB) => T | Promise<T>, write = true): Promise<T> {
    const run = this.queue.then(async () => {
      const db = await this.load();
      const result = await fn(db);
      if (write) await this.persist();
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  private read<T>(fn: (db: DB) => T): Promise<T> {
    return this.tx(fn, false);
  }

  // ── Sitzungen (nur Lokalmodus) ───────────────────────────
  createSession(s: LocalSession) {
    return this.tx((db) => {
      db.sessions = db.sessions.filter((x) => x.expiresAt > nowIso());
      db.sessions.push(s);
    });
  }
  getSession(tokenHash: string) {
    return this.read((db) => db.sessions.find((s) => s.tokenHash === tokenHash && s.expiresAt > nowIso()) ?? null);
  }
  deleteSession(tokenHash: string) {
    return this.tx((db) => {
      db.sessions = db.sessions.filter((s) => s.tokenHash !== tokenHash);
    });
  }
  createToken(t: LocalToken) {
    return this.tx((db) => {
      db.tokens = db.tokens.filter((x) => x.expiresAt > nowIso() && !(x.userId === t.userId && x.purpose === t.purpose));
      db.tokens.push(t);
    });
  }
  consumeToken(tokenHash: string, purpose: LocalToken["purpose"]) {
    return this.tx((db) => {
      const t = db.tokens.find((x) => x.tokenHash === tokenHash && x.purpose === purpose && x.expiresAt > nowIso());
      db.tokens = db.tokens.filter((x) => x !== t);
      return t ?? null;
    });
  }

  // ── Benutzer ─────────────────────────────────────────────
  getUser(id: string) {
    return this.read((db) => db.users.find((u) => u.id === id) ?? null);
  }
  findUserByEmail(email: string) {
    const e = email.toLowerCase();
    return this.read((db) => db.users.find((u) => u.email === e) ?? null);
  }
  createUser(u: UserRecord) {
    return this.tx((db) => {
      if (db.users.some((x) => x.email === u.email.toLowerCase())) throw new Error("email_exists");
      db.users.push({ ...u, email: u.email.toLowerCase() });
    });
  }
  updateUser(id: string, patch: Partial<UserRecord>) {
    return this.tx((db) => {
      const u = db.users.find((x) => x.id === id);
      if (u) Object.assign(u, patch);
    });
  }
  deleteUserData(userId: string) {
    return this.tx((db) => {
      db.users = db.users.filter((u) => u.id !== userId);
      db.sessions = db.sessions.filter((s) => s.userId !== userId);
      db.tokens = db.tokens.filter((s) => s.userId !== userId);
      db.analyses = db.analyses.filter((a) => a.userId !== userId);
      db.reservations = db.reservations.filter((r) => r.userId !== userId);
      db.uploads = db.uploads.filter((u) => u.ownerKey !== userId);
      // Zahlungs- und Buchungsdaten: gesetzliche Aufbewahrungspflichten (HGB/AO) –
      // pseudonymisieren statt löschen.
      for (const t of db.tx) if (t.userId === userId) t.userId = "deleted";
      for (const p of db.purchases) if (p.userId === userId) p.userId = "deleted";
    });
  }
  exportUserData(userId: string) {
    return this.read((db) => ({
      user: db.users.filter((u) => u.id === userId).map(({ passwordHash: _ph, ...u }) => u),
      analyses: db.analyses.filter((a) => a.userId === userId),
      walletTransactions: db.tx.filter((t) => t.userId === userId),
      purchases: db.purchases.filter((p) => p.userId === userId),
      uploads: db.uploads.filter((u) => u.ownerKey === userId).map(({ storagePath: _sp, ...u }) => u),
    }));
  }

  // ── Analysen ─────────────────────────────────────────────
  createAnalysis(a: AnalysisRecord) {
    return this.tx((db) => {
      db.analyses.push(a);
    });
  }
  updateAnalysis(id: string, patch: Partial<AnalysisRecord>) {
    return this.tx((db) => {
      const a = db.analyses.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
    });
  }
  getAnalysis(id: string, userId: string) {
    return this.read((db) => db.analyses.find((a) => a.id === id && a.userId === userId) ?? null);
  }
  listAnalyses(userId: string, limit = 50) {
    return this.read((db) =>
      db.analyses
        .filter((a) => a.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    );
  }
  deleteAnalysis(id: string, userId: string) {
    return this.tx((db) => {
      db.analyses = db.analyses.filter((a) => !(a.id === id && a.userId === userId));
    });
  }
  countQuickCheck() {
    return this.tx((db) => {
      db.counters.quickChecks++;
    });
  }
  countEvent(name: string, by = 1) {
    return this.tx((db) => {
      db.counters[name] = (db.counters[name] ?? 0) + by;
    });
  }
  getCounter(name: string) {
    return this.read((db) => db.counters[name] ?? 0);
  }
  findLatestByListingKey(userId: string, listingKey: string) {
    return this.read(
      (db) =>
        db.analyses
          .filter((a) => a.userId === userId && a.listingKey === listingKey && a.status === "completed")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    );
  }
  queryAnalyses(userId: string, q: AnalysisQuery) {
    return this.read((db) => {
      const term = q.q?.trim().toLowerCase();
      let list = db.analyses.filter(
        (a) =>
          a.userId === userId &&
          (!term || a.title.toLowerCase().includes(term)) &&
          (!q.category || a.category === q.category) &&
          (!q.platform || a.platform === q.platform) &&
          (!q.status || (q.status === "completed" ? a.status === "completed" : a.status !== "completed")) &&
          (!q.recommendation || (a.recommendation ?? a.report?.score.recommendation) === q.recommendation),
      );
      const price = (a: AnalysisRecord) => a.priceEur ?? a.report?.listing.priceEur ?? -1;
      const sorters: Record<string, (a: AnalysisRecord, b: AnalysisRecord) => number> = {
        date_desc: (a, b) => b.createdAt.localeCompare(a.createdAt),
        date_asc: (a, b) => a.createdAt.localeCompare(b.createdAt),
        price_desc: (a, b) => price(b) - price(a),
        price_asc: (a, b) => price(a) - price(b),
      };
      list = list.sort(sorters[q.sort ?? "date_desc"]);
      const size = Math.min(50, Math.max(1, q.pageSize ?? 20));
      const page = Math.max(1, q.page ?? 1);
      return { items: list.slice((page - 1) * size, page * size), total: list.length };
    });
  }
  findAnalysisByFingerprint(userId: string, fingerprint: string, since: string) {
    return this.read(
      (db) =>
        db.analyses
          .filter((a) => a.userId === userId && a.fingerprint === fingerprint && a.status === "completed" && a.createdAt >= since)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    );
  }

  // ── Wallet ───────────────────────────────────────────────
  private balanceOf(db: DB, userId: string) {
    return db.tx.filter((t) => t.userId === userId).reduce((s, t) => s + t.amount, 0);
  }
  private pushTx(db: DB, t: Omit<WalletTx, "id" | "balanceAfter" | "createdAt">) {
    const balanceAfter = this.balanceOf(db, t.userId) + t.amount;
    const rec: WalletTx = { ...t, id: newId("tx"), balanceAfter, createdAt: nowIso() };
    db.tx.push(rec);
    return rec;
  }
  getBalance(userId: string) {
    return this.read((db) => this.balanceOf(db, userId));
  }
  listTransactions(userId: string, limit = 100) {
    return this.read((db) =>
      db.tx
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    );
  }
  reserveTokens(userId: string, analysisId: string, amount: number, idempotencyKey: string) {
    return this.tx((db) => {
      const existing = db.tx.find((t) => t.idempotencyKey === idempotencyKey);
      if (existing) {
        const r = db.reservations.find((x) => x.id === existing.refId);
        if (r) return r;
      }
      if (this.balanceOf(db, userId) < amount) throw new WalletError("insufficient_balance", "Nicht genügend Tokens");
      const r: Reservation = { id: newId("res"), userId, analysisId, amount, status: "reserved", createdAt: nowIso(), updatedAt: nowIso() };
      db.reservations.push(r);
      this.pushTx(db, { userId, type: "reserve", amount: -amount, refId: r.id, idempotencyKey, note: `Analyse ${analysisId}` });
      return r;
    });
  }
  captureReservation(reservationId: string) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === reservationId);
      if (!r) throw new WalletError("not_found", "Reservierung nicht gefunden");
      if (r.status === "captured") return;
      if (r.status !== "reserved") throw new WalletError("invalid_state", "Reservierung bereits freigegeben");
      r.status = "captured";
      r.updatedAt = nowIso();
    });
  }
  releaseReservation(reservationId: string, note?: string) {
    return this.tx((db) => {
      const r = db.reservations.find((x) => x.id === reservationId);
      if (!r) throw new WalletError("not_found", "Reservierung nicht gefunden");
      if (r.status === "released") return;
      if (r.status === "captured") throw new WalletError("invalid_state", "Bereits verbrauchte Tokens können nicht freigegeben werden");
      r.status = "released";
      r.updatedAt = nowIso();
      this.pushTx(db, { userId: r.userId, type: "release", amount: r.amount, refId: r.id, idempotencyKey: `release:${r.id}`, note });
    });
  }
  creditTokens(userId: string, amount: number, type: "purchase" | "admin_adjust" | "test_credit", idempotencyKey: string, refId?: string, note?: string) {
    return this.tx((db) => {
      if (db.tx.some((t) => t.idempotencyKey === idempotencyKey)) return { applied: false };
      this.pushTx(db, { userId, type, amount, refId, idempotencyKey, note });
      return { applied: true };
    });
  }
  debitRefund(userId: string, amount: number, idempotencyKey: string, refId?: string) {
    return this.tx((db) => {
      if (db.tx.some((t) => t.idempotencyKey === idempotencyKey)) return { applied: false, debited: 0 };
      const debited = Math.min(amount, Math.max(0, this.balanceOf(db, userId)));
      this.pushTx(db, { userId, type: "purchase_refund", amount: -debited, refId, idempotencyKey, note: `Erstattung (${amount} Token, ${debited} abgebucht)` });
      return { applied: true, debited };
    });
  }

  // ── Käufe ────────────────────────────────────────────────
  createPurchase(p: Purchase) {
    return this.tx((db) => {
      db.purchases.push(p);
    });
  }
  updatePurchaseByRef(providerRef: string, patch: Partial<Purchase>) {
    return this.tx((db) => {
      const p = db.purchases.find((x) => x.providerRef === providerRef);
      if (!p) return null;
      Object.assign(p, patch);
      return { ...p };
    });
  }
  getPurchaseByRef(providerRef: string) {
    return this.read((db) => db.purchases.find((x) => x.providerRef === providerRef) ?? null);
  }
  getPurchaseByPaymentIntent(pi: string) {
    return this.read((db) => db.purchases.find((x) => x.paymentIntent === pi) ?? null);
  }
  listPurchases(userId: string) {
    return this.read((db) => db.purchases.filter((p) => p.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  // ── Uploads ──────────────────────────────────────────────
  createUpload(u: UploadRecord) {
    return this.tx((db) => {
      db.uploads.push(u);
    });
  }
  getUpload(id: string) {
    return this.read((db) => db.uploads.find((u) => u.id === id) ?? null);
  }
  deleteUpload(id: string) {
    return this.tx((db) => {
      db.uploads = db.uploads.filter((u) => u.id !== id);
    });
  }
  listExpiredUploads(now: string) {
    return this.read((db) => db.uploads.filter((u) => u.expiresAt <= now));
  }
  listUploadsByOwner(ownerKey: string) {
    return this.read((db) => db.uploads.filter((u) => u.ownerKey === ownerKey));
  }

  // ── Rate Limiting ────────────────────────────────────────
  hitRateLimit(key: string, windowSeconds: number, limit: number) {
    return this.tx((db) => {
      const now = Date.now();
      const cur = db.rate[key];
      if (!cur || new Date(cur.resetAt).getTime() <= now) {
        db.rate[key] = { count: 1, resetAt: new Date(now + windowSeconds * 1000).toISOString() };
      } else cur.count++;
      // Aufräumen
      for (const [k, v] of Object.entries(db.rate)) if (new Date(v.resetAt).getTime() <= now && k !== key) delete db.rate[k];
      const c = db.rate[key];
      return { allowed: c.count <= limit, remaining: Math.max(0, limit - c.count), resetAt: c.resetAt };
    });
  }

  // ── Konfiguration & Admin ────────────────────────────────
  getConfig() {
    return this.read((db) => structuredClone(db.config));
  }
  setConfig(patch: AppConfig) {
    return this.tx((db) => {
      db.config = { ...db.config, ...patch };
    });
  }
  adminStats(): Promise<AdminStats> {
    return this.read((db) => {
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
      const completed = db.analyses.filter((a) => a.status === "completed");
      const paid = db.purchases.filter((p) => p.status === "paid" || p.status === "refunded");
      const byCategory: Record<string, number> = {};
      const byMode: Record<string, number> = {};
      for (const a of db.analyses) {
        byCategory[a.category] = (byCategory[a.category] ?? 0) + 1;
        byMode[a.mode] = (byMode[a.mode] ?? 0) + 1;
      }
      const purchasesByPackage: Record<string, number> = {};
      for (const p of paid) purchasesByPackage[p.packageId] = (purchasesByPackage[p.packageId] ?? 0) + 1;
      const aiTotal = db.analyses.reduce((s, a) => s + (a.aiCostUsd ?? 0), 0);
      return {
        users: db.users.length,
        usersLast7d: db.users.filter((u) => u.createdAt >= weekAgo).length,
        analyses: db.analyses.length,
        analysesCompleted: completed.length,
        analysesFailed: db.analyses.filter((a) => a.status === "failed").length,
        quickChecks: db.counters.quickChecks,
        tokensSold: paid.reduce((s, p) => s + p.tokens, 0),
        revenueCents: paid.filter((p) => p.provider === "stripe").reduce((s, p) => s + p.amountCents, 0),
        refundsCents: db.purchases.filter((p) => p.status === "refunded").reduce((s, p) => s + p.amountCents, 0),
        aiCostUsdTotal: aiTotal,
        aiCostUsdAvg: completed.length ? aiTotal / completed.length : 0,
        byCategory,
        byMode,
        recentFailures: db.analyses
          .filter((a) => a.status === "failed")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 10)
          .map((a) => ({ id: a.id, createdAt: a.createdAt, category: a.category, errorCode: a.errorCode ?? "unknown" })),
        purchasesByPackage,
        activeUsers30d: new Set(db.analyses.filter((a) => a.createdAt >= new Date(Date.now() - 30 * 864e5).toISOString()).map((a) => a.userId)).size,
        sellerChecks: db.analyses.filter((a) => a.report?.seller).length,
        comparisons: db.counters.comparisons ?? 0,
        reusedAnalyses: db.counters.reused_analysis ?? 0,
        avgDurationMs: (() => {
          const d = completed.map((a) => a.durationMs ?? 0).filter((x) => x > 0);
          return d.length ? d.reduce((x, y) => x + y, 0) / d.length : 0;
        })(),
        topErrors: Object.entries(
          db.analyses.filter((a) => a.status === "failed").reduce<Record<string, number>>((acc, a) => ((acc[a.errorCode ?? "unknown"] = (acc[a.errorCode ?? "unknown"] ?? 0) + 1), acc), {}),
        )
          .map(([code, count]) => ({ code, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      };
    });
  }
}
