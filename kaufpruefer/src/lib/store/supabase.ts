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
    return { user: await this.getUser(userId), analyses: analyses.data, walletTransactions: tx.data, purchases: purchases.data };
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
}
