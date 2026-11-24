import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
import type {
  ImageHashRecord,
  JobRecord,
  JobType,
  ModuleKind,
  ModuleRecord,
  NotificationRecord,
  PushSubscriptionRecord,
  ShareInboxRecord,
  WatchRecord,
} from "./akte-types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message ?? "";
    if (msg.includes("insufficient_balance")) throw new WalletError("insufficient_balance", "Nicht genügend Tokens");
    if (msg.includes("not_found")) throw new WalletError("not_found", "Nicht gefunden");
    if (msg.includes("invalid_state")) throw new WalletError("invalid_state", "Ungültiger Status");
    throw new Error(`Datenbankfehler: ${msg}`);
  }
  return res.data;
}

const toAnalysis = (r: Row): AnalysisRecord => ({
  id: r.id,
  userId: r.user_id,
  status: r.status,
  tier: r.tier,
  category: r.category,
  platform: r.platform,
  title: r.title,
  createdAt: r.created_at,
  completedAt: r.completed_at ?? undefined,
  report: r.report ?? undefined,
  errorCode: r.error_code ?? undefined,
  reservationId: r.reservation_id ?? undefined,
  aiCostUsd: Number(r.ai_cost_usd ?? 0),
  aiInputTokens: r.ai_input_tokens ?? 0,
  aiOutputTokens: r.ai_output_tokens ?? 0,
  mode: r.mode,
  fingerprint: r.fingerprint ?? undefined,
  aiModel: r.ai_model ?? undefined,
  durationMs: r.duration_ms ?? undefined,
  listingKey: r.listing_key ?? undefined,
  previousId: r.previous_id ?? undefined,
  analysisVersion: r.analysis_version ?? undefined,
  priceEur: r.price_eur != null ? Number(r.price_eur) : undefined,
  recommendation: r.recommendation ?? undefined,
  priceRating: r.price_rating ?? undefined,
  thumbnail: r.thumbnail ?? undefined,
  chat: r.chat ?? undefined,
});
const fromAnalysis = (a: Partial<AnalysisRecord>): Row => {
  const m: Record<string, string> = {
    id: "id", userId: "user_id", status: "status", tier: "tier", category: "category", platform: "platform", title: "title",
    createdAt: "created_at", completedAt: "completed_at", report: "report", errorCode: "error_code", reservationId: "reservation_id",
    aiCostUsd: "ai_cost_usd", aiInputTokens: "ai_input_tokens", aiOutputTokens: "ai_output_tokens", mode: "mode",
    fingerprint: "fingerprint", aiModel: "ai_model", durationMs: "duration_ms",
    listingKey: "listing_key", previousId: "previous_id", analysisVersion: "analysis_version", priceEur: "price_eur",
    recommendation: "recommendation", priceRating: "price_rating", thumbnail: "thumbnail", chat: "chat",
  };
  return Object.fromEntries(Object.entries(a).filter(([k]) => m[k]).map(([k, v]) => [m[k], v]));
};
const toModule = (r: Row): ModuleRecord => ({
  id: r.id, analysisId: r.analysis_id, userId: r.user_id, kind: r.kind, version: r.version, createdAt: r.created_at,
  updatedAt: r.updated_at ?? undefined, inputHash: r.input_hash ?? undefined, expiresAt: r.expires_at ?? undefined, data: r.data,
});
const JOB_MAP: Record<string, string> = {
  id: "id", type: "type", userId: "user_id", analysisId: "analysis_id", idempotencyKey: "idempotency_key", status: "status",
  attempts: "attempts", maxAttempts: "max_attempts", runAfter: "run_after", leaseUntil: "lease_until", progress: "progress",
  message: "message", input: "input", result: "result", error: "error", cancelRequested: "cancel_requested", createdAt: "created_at", updatedAt: "updated_at",
};
const fromJob = (j: Partial<JobRecord>): Row => Object.fromEntries(Object.entries(j).filter(([k]) => JOB_MAP[k]).map(([k, v]) => [JOB_MAP[k], v ?? null]));
const toJob = (r: Row): JobRecord => ({
  id: r.id, type: r.type, userId: r.user_id ?? undefined, analysisId: r.analysis_id ?? undefined, idempotencyKey: r.idempotency_key, status: r.status,
  attempts: r.attempts, maxAttempts: r.max_attempts, runAfter: r.run_after, leaseUntil: r.lease_until ?? undefined, progress: r.progress,
  message: r.message ?? undefined, input: r.input ?? {}, result: r.result ?? undefined, error: r.error ?? undefined,
  cancelRequested: !!r.cancel_requested, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toWatch = (r: Row): WatchRecord => ({
  id: r.id, analysisId: r.analysis_id, userId: r.user_id, platform: r.platform, url: r.url ?? undefined, externalId: r.external_id ?? undefined,
  mode: r.mode, intervalHours: r.interval_hours, active: r.active, notify: r.notify, createdAt: r.created_at,
  lastCheckedAt: r.last_checked_at ?? undefined, nextCheckAt: r.next_check_at ?? undefined, lastError: r.last_error ?? undefined,
});
const fromWatch = (w: WatchRecord): Row => ({
  id: w.id, analysis_id: w.analysisId, user_id: w.userId, platform: w.platform, url: w.url ?? null, external_id: w.externalId ?? null, mode: w.mode,
  interval_hours: w.intervalHours, active: w.active, notify: w.notify, created_at: w.createdAt, last_checked_at: w.lastCheckedAt ?? null,
  next_check_at: w.nextCheckAt ?? null, last_error: w.lastError ?? null,
});
const toNotification = (r: Row): NotificationRecord => ({
  id: r.id, userId: r.user_id, kind: r.kind, title: r.title, body: r.body, link: r.link ?? undefined, createdAt: r.created_at, readAt: r.read_at ?? undefined,
});
const toImageHash = (r: Row): ImageHashRecord => ({
  id: r.id, analysisId: r.analysis_id, userId: r.user_id, listingKey: r.listing_key ?? undefined, platform: r.platform, listingUrl: r.listing_url ?? undefined,
  imageRef: r.image_ref ?? undefined, dhash: r.dhash, phash: r.phash, bands: [r.band0, r.band1, r.band2, r.band3], sha256: r.sha256,
  width: r.width, height: r.height, capturedAt: r.captured_at, expiresAt: r.expires_at,
});
const toInbox = (r: Row): ShareInboxRecord => ({
  id: r.id, createdAt: r.created_at, expiresAt: r.expires_at, title: r.title ?? undefined, text: r.text ?? undefined, url: r.url ?? undefined,
  uploadIds: r.upload_ids ?? [], claimedBy: r.claimed_by ?? undefined,
});
const toTx = (r: Row): WalletTx => ({
  id: r.id, userId: r.user_id, type: r.type, amount: r.amount, balanceAfter: r.balance_after, refId: r.ref_id ?? undefined,
  idempotencyKey: r.idempotency_key, note: r.note ?? undefined, createdAt: r.created_at,
});
const toPurchase = (r: Row): Purchase => ({
  id: r.id, userId: r.user_id, packageId: r.package_id, tokens: r.tokens, amountCents: r.amount_cents, currency: r.currency,
  status: r.status, provider: r.provider, providerRef: r.provider_ref ?? undefined, paymentIntent: r.payment_intent ?? undefined,
  createdAt: r.created_at, paidAt: r.paid_at ?? undefined,
});
const fromPurchase = (p: Partial<Purchase>): Row => {
  const m: Record<string, string> = {
    id: "id", userId: "user_id", packageId: "package_id", tokens: "tokens", amountCents: "amount_cents", currency: "currency",
    status: "status", provider: "provider", providerRef: "provider_ref", paymentIntent: "payment_intent", createdAt: "created_at", paidAt: "paid_at",
  };
  return Object.fromEntries(Object.entries(p).filter(([k]) => m[k]).map(([k, v]) => [m[k], v]));
};
const toUpload = (r: Row): UploadRecord => ({
  id: r.id, ownerKey: r.owner_key, kind: r.kind, mime: r.mime, size: r.size, storagePath: r.storage_path, createdAt: r.created_at, expiresAt: r.expires_at,
});
const toReservation = (r: Row): Reservation => ({
  id: r.id, userId: r.user_id, analysisId: r.analysis_id, amount: r.amount, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
});

export class SupabaseStore implements DataStore {
  kind = "supabase" as const;
  readonly db: SupabaseClient;
  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const { data } = await this.db.auth.admin.getUserById(id);
    const u = data?.user;
    return u ? { id: u.id, email: u.email ?? "", emailVerified: !!u.email_confirmed_at, createdAt: u.created_at } : null;
  }
  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const r = check(await this.db.from("profiles").select("id").eq("email", email.toLowerCase()).maybeSingle());
    return r ? this.getUser((r as Row).id) : null;
  }
  async createUser(): Promise<void> {
    throw new Error("Benutzer werden über Supabase Auth angelegt");
  }
  async updateUser(): Promise<void> {
    /* über Supabase Auth */
  }
  async deleteUserData(userId: string) {
    const uploads = check(await this.db.from("uploads").select("storage_path").eq("owner_key", userId)) as Row[];
    if (uploads.length) await this.db.storage.from("uploads").remove(uploads.map((u) => u.storage_path));
    check(await this.db.from("uploads").delete().eq("owner_key", userId));
    // Buchungsdaten bleiben pseudonymisiert erhalten (user_id → null via on delete set null)
    const { error } = await this.db.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
  }
  async exportUserData(userId: string) {
    const [analyses, tx, purchases] = await Promise.all([
      this.db.from("analyses").select("*").eq("user_id", userId),
      this.db.from("wallet_transactions").select("*").eq("user_id", userId),
      this.db.from("purchases").select("*").eq("user_id", userId),
    ]);
    const [modules, watches, notifications] = await Promise.all([
      this.db.from("kaufakte_modules").select("*").eq("user_id", userId),
      this.db.from("watches").select("*").eq("user_id", userId),
      this.db.from("notifications").select("*").eq("user_id", userId),
    ]);
    return {
      user: await this.getUser(userId),
      analyses: analyses.data,
      walletTransactions: tx.data,
      purchases: purchases.data,
      kaufakteModule: modules.data,
      beobachtungen: watches.data,
      benachrichtigungen: notifications.data,
    };
  }

  async createAnalysis(a: AnalysisRecord) {
    check(await this.db.from("analyses").insert(fromAnalysis(a)));
  }
  async updateAnalysis(id: string, patch: Partial<AnalysisRecord>) {
    check(await this.db.from("analyses").update(fromAnalysis(patch)).eq("id", id));
  }
  async getAnalysis(id: string, userId: string) {
    const r = check(await this.db.from("analyses").select("*").eq("id", id).eq("user_id", userId).maybeSingle());
    return r ? toAnalysis(r as Row) : null;
  }
  async listAnalyses(userId: string, limit = 50) {
    const r = check(
      await this.db
        .from("analyses")
        .select("id,user_id,status,tier,category,platform,title,created_at,completed_at,error_code,mode,ai_cost_usd,ai_input_tokens,ai_output_tokens,report->score")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit),
    ) as Row[];
    return r.map((x) => ({ ...toAnalysis(x), report: x.score ? ({ score: x.score } as never) : undefined }));
  }
  async deleteAnalysis(id: string, userId: string) {
    check(await this.db.from("analyses").delete().eq("id", id).eq("user_id", userId));
  }
  async countQuickCheck() {
    await this.db.rpc("counter_inc", { p_name: "quick_checks" });
  }
  async countEvent(name: string, by = 1) {
    await this.db.rpc("counter_add", { p_name: name, p_by: Math.round(by) });
  }
  async getCounter(name: string) {
    const r = check(await this.db.from("counters").select("value").eq("name", name).maybeSingle()) as Row | null;
    return Number(r?.value ?? 0);
  }
  async findLatestByListingKey(userId: string, listingKey: string) {
    const r = check(
      await this.db.from("analyses").select("*").eq("user_id", userId).eq("listing_key", listingKey).eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    );
    return r ? toAnalysis(r as Row) : null;
  }
  async queryAnalyses(userId: string, q: AnalysisQuery) {
    const size = Math.min(50, Math.max(1, q.pageSize ?? 20));
    const page = Math.max(1, q.page ?? 1);
    let query = this.db
      .from("analyses")
      .select("id,user_id,status,tier,category,platform,title,created_at,completed_at,error_code,mode,ai_cost_usd,ai_input_tokens,ai_output_tokens,price_eur,recommendation,price_rating,thumbnail,listing_key,report->score", { count: "exact" })
      .eq("user_id", userId);
    if (q.q?.trim()) query = query.ilike("title", `%${q.q.trim().replace(/[%_]/g, "")}%`);
    if (q.category) query = query.eq("category", q.category);
    if (q.platform) query = query.eq("platform", q.platform);
    if (q.status === "completed") query = query.eq("status", "completed");
    if (q.status === "incomplete") query = query.neq("status", "completed");
    if (q.recommendation) query = query.eq("recommendation", q.recommendation);
    const sort = q.sort ?? "date_desc";
    query = sort.startsWith("price")
      ? query.order("price_eur", { ascending: sort === "price_asc", nullsFirst: false })
      : query.order("created_at", { ascending: sort === "date_asc" });
    const res = await query.range((page - 1) * size, page * size - 1);
    const rows = check(res) as Row[];
    return { items: rows.map((x) => ({ ...toAnalysis(x), report: x.score ? ({ score: x.score } as never) : undefined })), total: res.count ?? rows.length };
  }
  async findAnalysisByFingerprint(userId: string, fingerprint: string, since: string) {
    const r = check(
      await this.db.from("analyses").select("*").eq("user_id", userId).eq("fingerprint", fingerprint).eq("status", "completed").gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    );
    return r ? toAnalysis(r as Row) : null;
  }

  async getBalance(userId: string) {
    const r = check(await this.db.from("wallets").select("balance").eq("user_id", userId).maybeSingle()) as Row | null;
    return r?.balance ?? 0;
  }
  async listTransactions(userId: string, limit = 100) {
    const r = check(await this.db.from("wallet_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit)) as Row[];
    return r.map(toTx);
  }
  async reserveTokens(userId: string, analysisId: string, amount: number, idempotencyKey: string) {
    const r = check(await this.db.rpc("wallet_reserve", { p_user: userId, p_analysis: analysisId, p_amount: amount, p_key: idempotencyKey })) as Row;
    return toReservation(r);
  }
  async captureReservation(reservationId: string) {
    check(await this.db.rpc("wallet_capture", { p_reservation: reservationId }));
  }
  async releaseReservation(reservationId: string, note?: string) {
    check(await this.db.rpc("wallet_release", { p_reservation: reservationId, p_note: note ?? null }));
  }
  async creditTokens(userId: string, amount: number, type: "purchase" | "admin_adjust" | "test_credit", idempotencyKey: string, refId?: string, note?: string) {
    const applied = check(
      await this.db.rpc("wallet_credit", { p_user: userId, p_amount: amount, p_type: type, p_key: idempotencyKey, p_ref: refId ?? null, p_note: note ?? null }),
    ) as boolean;
    return { applied };
  }
  async debitRefund(userId: string, amount: number, idempotencyKey: string, refId?: string) {
    const v = check(await this.db.rpc("wallet_refund_debit", { p_user: userId, p_amount: amount, p_key: idempotencyKey, p_ref: refId ?? null })) as number;
    return v < 0 ? { applied: false, debited: 0 } : { applied: true, debited: v };
  }

  async createPurchase(p: Purchase) {
    check(await this.db.from("purchases").insert(fromPurchase(p)));
  }
  async updatePurchaseByRef(providerRef: string, patch: Partial<Purchase>) {
    const r = check(await this.db.from("purchases").update(fromPurchase(patch)).eq("provider_ref", providerRef).select("*").maybeSingle());
    return r ? toPurchase(r as Row) : null;
  }
  async getPurchaseByRef(providerRef: string) {
    const r = check(await this.db.from("purchases").select("*").eq("provider_ref", providerRef).maybeSingle());
    return r ? toPurchase(r as Row) : null;
  }
  async getPurchaseByPaymentIntent(pi: string) {
    const r = check(await this.db.from("purchases").select("*").eq("payment_intent", pi).maybeSingle());
    return r ? toPurchase(r as Row) : null;
  }
  async listPurchases(userId: string) {
    const r = check(await this.db.from("purchases").select("*").eq("user_id", userId).order("created_at", { ascending: false })) as Row[];
    return r.map(toPurchase);
  }

  async createUpload(u: UploadRecord) {
    check(
      await this.db.from("uploads").insert({
        id: u.id, owner_key: u.ownerKey, kind: u.kind, mime: u.mime, size: u.size, storage_path: u.storagePath, created_at: u.createdAt, expires_at: u.expiresAt,
      }),
    );
  }
  async getUpload(id: string) {
    const r = check(await this.db.from("uploads").select("*").eq("id", id).maybeSingle());
    return r ? toUpload(r as Row) : null;
  }
  async deleteUpload(id: string) {
    check(await this.db.from("uploads").delete().eq("id", id));
  }
  async listExpiredUploads(now: string) {
    const r = check(await this.db.from("uploads").select("*").lte("expires_at", now).limit(500)) as Row[];
    return r.map(toUpload);
  }
  async listUploadsByOwner(ownerKey: string) {
    const r = check(await this.db.from("uploads").select("*").eq("owner_key", ownerKey)) as Row[];
    return r.map(toUpload);
  }

  async hitRateLimit(key: string, windowSeconds: number, limit: number) {
    const r = check(await this.db.rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds, p_limit: limit })) as Row[];
    const row = r[0];
    return { allowed: !!row?.allowed, remaining: row?.remaining ?? 0, resetAt: row?.reset_at ?? new Date().toISOString() };
  }

  async getConfig(): Promise<AppConfig> {
    const r = check(await this.db.from("app_config").select("config").eq("id", 1).maybeSingle()) as Row | null;
    return (r?.config as AppConfig) ?? {};
  }
  async setConfig(patch: AppConfig) {
    const cur = await this.getConfig();
    check(await this.db.from("app_config").upsert({ id: 1, config: { ...cur, ...patch }, updated_at: new Date().toISOString() }));
  }

  async adminStats(): Promise<AdminStats> {
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const [users, users7, analyses, purchases, counters, failures] = await Promise.all([
      this.db.from("profiles").select("id", { count: "exact", head: true }),
      this.db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      this.db.from("analyses").select("status,category,mode,ai_cost_usd,user_id,created_at,duration_ms,error_code,report->seller->visibleReviewCount").limit(10000),
      this.db.from("purchases").select("package_id,tokens,amount_cents,status,provider").in("status", ["paid", "refunded"]).limit(10000),
      this.db.from("counters").select("name,value"),
      this.db.from("analyses").select("id,created_at,category,error_code").eq("status", "failed").order("created_at", { ascending: false }).limit(10),
    ]);
    const a = (analyses.data ?? []) as Row[];
    const p = (purchases.data ?? []) as Row[];
    const byCategory: Record<string, number> = {};
    const byMode: Record<string, number> = {};
    for (const x of a) {
      byCategory[x.category] = (byCategory[x.category] ?? 0) + 1;
      byMode[x.mode] = (byMode[x.mode] ?? 0) + 1;
    }
    const purchasesByPackage: Record<string, number> = {};
    for (const x of p) purchasesByPackage[x.package_id] = (purchasesByPackage[x.package_id] ?? 0) + 1;
    const completed = a.filter((x) => x.status === "completed").length;
    const aiTotal = a.reduce((s, x) => s + Number(x.ai_cost_usd ?? 0), 0);
    return {
      users: users.count ?? 0,
      usersLast7d: users7.count ?? 0,
      analyses: a.length,
      analysesCompleted: completed,
      analysesFailed: a.filter((x) => x.status === "failed").length,
      quickChecks: Number(((counters.data ?? []) as Row[]).find((c) => c.name === "quick_checks")?.value ?? 0),
      tokensSold: p.reduce((s, x) => s + x.tokens, 0),
      revenueCents: p.filter((x) => x.provider === "stripe").reduce((s, x) => s + x.amount_cents, 0),
      refundsCents: p.filter((x) => x.status === "refunded").reduce((s, x) => s + x.amount_cents, 0),
      aiCostUsdTotal: aiTotal,
      aiCostUsdAvg: completed ? aiTotal / completed : 0,
      byCategory,
      byMode,
      recentFailures: ((failures.data ?? []) as Row[]).map((f) => ({ id: f.id, createdAt: f.created_at, category: f.category, errorCode: f.error_code ?? "unknown" })),
      purchasesByPackage,
      activeUsers30d: new Set(a.filter((x) => x.created_at >= new Date(Date.now() - 30 * 864e5).toISOString()).map((x) => x.user_id)).size,
      sellerChecks: a.filter((x) => x.visibleReviewCount != null).length,
      comparisons: Number(((counters.data ?? []) as Row[]).find((c) => c.name === "comparisons")?.value ?? 0),
      reusedAnalyses: Number(((counters.data ?? []) as Row[]).find((c) => c.name === "reused_analysis")?.value ?? 0),
      v4: (() => {
        const c = (n: string) => Number(((counters.data ?? []) as Row[]).find((x) => x.name === n)?.value ?? 0);
        return { chatChecks: c("chat_check"), inspections: c("inspection_finished"), imageMatches: c("image_match"), watches: c("watch_started") };
      })(),
      avgDurationMs: (() => {
        const d = a.map((x) => Number(x.duration_ms ?? 0)).filter((x) => x > 0);
        return d.length ? d.reduce((x, y) => x + y, 0) / d.length : 0;
      })(),
      topErrors: Object.entries(a.filter((x) => x.status === "failed").reduce<Record<string, number>>((acc, x) => ((acc[x.error_code ?? "unknown"] = (acc[x.error_code ?? "unknown"] ?? 0) + 1), acc), {}))
        .map(([code, count]) => ({ code, count }))
        .sort((x, y) => y.count - x.count)
        .slice(0, 5),
    };
  }

  // ── Kaufakte-Module ──────────────────────────────────────
  async addModule<T>(m: Omit<ModuleRecord<T>, "version">): Promise<ModuleRecord<T>> {
    const version = check(
      await this.db.rpc("kaufakte_add_module", {
        p_id: m.id, p_analysis: m.analysisId, p_user: m.userId, p_kind: m.kind, p_created: m.createdAt,
        p_input_hash: m.inputHash ?? null, p_expires: m.expiresAt ?? null, p_data: m.data,
      }),
    ) as number;
    return { ...m, version } as ModuleRecord<T>;
  }
  async updateModule<T>(id: string, userId: string, patch: { data: T; updatedAt: string }) {
    check(await this.db.from("kaufakte_modules").update({ data: patch.data, updated_at: patch.updatedAt }).eq("id", id).eq("user_id", userId));
  }
  async listModules(analysisId: string, userId: string, kind?: ModuleKind) {
    let q = this.db.from("kaufakte_modules").select("*").eq("analysis_id", analysisId).eq("user_id", userId);
    if (kind) q = q.eq("kind", kind);
    const rows = check(await q.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("version", { ascending: true })) as Row[];
    return rows.map(toModule);
  }
  async deleteModule(id: string, userId: string) {
    check(await this.db.from("kaufakte_modules").delete().eq("id", id).eq("user_id", userId));
  }
  async deleteExpiredModules(now: string) {
    const rows = check(await this.db.from("kaufakte_modules").delete().lt("expires_at", now).select("id")) as Row[];
    return rows.length;
  }

  // ── Jobs ─────────────────────────────────────────────────
  async enqueueJob(j: JobRecord) {
    const existing = check(
      await this.db.from("jobs").select("*").eq("idempotency_key", j.idempotencyKey).in("status", ["queued", "running", "done"]).maybeSingle(),
    ) as Row | null;
    if (existing) return { job: toJob(existing), created: false };
    const res = await this.db.from("jobs").insert(fromJob(j));
    if (res.error?.code === "23505") {
      const again = check(await this.db.from("jobs").select("*").eq("idempotency_key", j.idempotencyKey).in("status", ["queued", "running", "done"]).maybeSingle()) as Row;
      return { job: toJob(again), created: false };
    }
    check(res);
    return { job: j, created: true };
  }
  async claimJob(now: string, leaseSeconds: number, types?: JobType[]) {
    const rows = check(await this.db.rpc("jobs_claim", { p_now: now, p_lease_seconds: leaseSeconds, p_types: types ?? null })) as Row[];
    return rows?.[0] ? toJob(rows[0]) : null;
  }
  async updateJob(id: string, patch: Partial<JobRecord>) {
    check(await this.db.from("jobs").update({ ...fromJob(patch), updated_at: new Date().toISOString() }).eq("id", id));
  }
  async getJob(id: string) {
    const r = check(await this.db.from("jobs").select("*").eq("id", id).maybeSingle()) as Row | null;
    return r ? toJob(r) : null;
  }
  async listJobs(f: { userId?: string; analysisId?: string; type?: JobType; limit?: number }) {
    let q = this.db.from("jobs").select("*");
    if (f.userId) q = q.eq("user_id", f.userId);
    if (f.analysisId) q = q.eq("analysis_id", f.analysisId);
    if (f.type) q = q.eq("type", f.type);
    const rows = check(await q.order("created_at", { ascending: false }).limit(f.limit ?? 20)) as Row[];
    return rows.map(toJob);
  }

  // ── Beobachtungen ────────────────────────────────────────
  async upsertWatch(w: WatchRecord) {
    check(await this.db.from("watches").upsert(fromWatch(w), { onConflict: "id" }));
  }
  async getWatchByAnalysis(analysisId: string, userId: string) {
    const r = check(await this.db.from("watches").select("*").eq("analysis_id", analysisId).eq("user_id", userId).maybeSingle()) as Row | null;
    return r ? toWatch(r) : null;
  }
  async getWatch(id: string) {
    const r = check(await this.db.from("watches").select("*").eq("id", id).maybeSingle()) as Row | null;
    return r ? toWatch(r) : null;
  }
  async listWatches(userId: string) {
    return (check(await this.db.from("watches").select("*").eq("user_id", userId).order("created_at", { ascending: false })) as Row[]).map(toWatch);
  }
  async listDueWatches(now: string, limit: number) {
    return (check(await this.db.from("watches").select("*").eq("active", true).eq("mode", "auto").lte("next_check_at", now).limit(limit)) as Row[]).map(toWatch);
  }
  async deleteWatch(id: string, userId: string) {
    check(await this.db.from("watches").delete().eq("id", id).eq("user_id", userId));
  }

  // ── Benachrichtigungen ───────────────────────────────────
  async addNotification(n: NotificationRecord) {
    check(await this.db.from("notifications").insert({ id: n.id, user_id: n.userId, kind: n.kind, title: n.title, body: n.body, link: n.link ?? null, created_at: n.createdAt }));
  }
  async listNotifications(userId: string, limit = 50) {
    return (check(await this.db.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit)) as Row[]).map(toNotification);
  }
  async markNotificationsRead(userId: string, ids?: string[]) {
    let q = this.db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (ids) q = q.in("id", ids);
    check(await q);
  }
  async countNotificationsSince(userId: string, since: string) {
    const { count, error } = await this.db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }
  async savePushSubscription(s: PushSubscriptionRecord) {
    check(await this.db.from("push_subscriptions").upsert({ endpoint: s.endpoint, user_id: s.userId, keys: s.keys, created_at: s.createdAt }, { onConflict: "endpoint" }));
  }
  async listPushSubscriptions(userId: string) {
    const rows = check(await this.db.from("push_subscriptions").select("*").eq("user_id", userId)) as Row[];
    return rows.map((r) => ({ endpoint: r.endpoint, userId: r.user_id, keys: r.keys, createdAt: r.created_at }));
  }
  async deletePushSubscription(endpoint: string) {
    check(await this.db.from("push_subscriptions").delete().eq("endpoint", endpoint));
  }

  // ── Bild-Hashes ──────────────────────────────────────────
  async addImageHashes(rows: ImageHashRecord[]) {
    if (!rows.length) return;
    check(
      await this.db.from("image_hashes").upsert(
        rows.map((h) => ({
          id: h.id, analysis_id: h.analysisId, user_id: h.userId, listing_key: h.listingKey ?? null, platform: h.platform, listing_url: h.listingUrl ?? null,
          image_ref: h.imageRef ?? null, dhash: h.dhash, phash: h.phash, band0: h.bands[0], band1: h.bands[1], band2: h.bands[2], band3: h.bands[3],
          sha256: h.sha256, width: h.width, height: h.height, captured_at: h.capturedAt, expires_at: h.expiresAt,
        })),
        { onConflict: "id" },
      ),
    );
  }
  async findImageHashCandidates(bands: string[], limit: number) {
    const safe = bands.map((b) => b.replace(/[^0-9a-f]/gi, ""));
    const rows = check(
      await this.db
        .from("image_hashes")
        .select("*")
        .gt("expires_at", new Date().toISOString())
        .or(safe.map((b, i) => `band${i}.eq.${b}`).join(","))
        .limit(limit),
    ) as Row[];
    return rows.map(toImageHash);
  }
  async listImageHashes(analysisId: string, userId: string) {
    return (check(await this.db.from("image_hashes").select("*").eq("analysis_id", analysisId).eq("user_id", userId)) as Row[]).map(toImageHash);
  }
  async deleteExpiredImageHashes(now: string) {
    return (check(await this.db.from("image_hashes").delete().lt("expires_at", now).select("id")) as Row[]).length;
  }

  // ── Teilen-Eingang ───────────────────────────────────────
  async putShareInbox(s: ShareInboxRecord) {
    await this.db.from("share_inbox").delete().lt("expires_at", new Date().toISOString());
    check(
      await this.db.from("share_inbox").insert({
        id: s.id, created_at: s.createdAt, expires_at: s.expiresAt, title: s.title ?? null, text: s.text ?? null, url: s.url ?? null, upload_ids: s.uploadIds,
      }),
    );
  }
  async takeShareInbox(id: string, userId: string, now: string) {
    const rows = check(await this.db.rpc("share_inbox_take", { p_id: id, p_user: userId, p_now: now })) as Row[];
    return rows?.[0] ? toInbox(rows[0]) : null;
  }
  async setUploadExpiry(id: string, ownerKey: string, expiresAt: string) {
    check(await this.db.from("uploads").update({ expires_at: expiresAt }).eq("id", id).eq("owner_key", ownerKey));
  }
  async reassignUpload(id: string, fromOwner: string, toOwner: string) {
    check(await this.db.from("uploads").update({ owner_key: toOwner }).eq("id", id).eq("owner_key", fromOwner));
  }
}
