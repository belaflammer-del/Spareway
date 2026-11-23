import "server-only";

/**
 * Zentrale, serverseitige Umgebungskonfiguration.
 * Alle Integrationen sind optional – fehlende Schlüssel schalten
 * transparent in den Demo- bzw. Lokalmodus.
 */
function str(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}
function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const env = {
  // Öffentliche URL: explizit gesetzt, sonst von Render bzw. Vercel übernommen
  appUrl:
    str("NEXT_PUBLIC_APP_URL") ??
    str("RENDER_EXTERNAL_URL") ??
    (str("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${str("VERCEL_PROJECT_PRODUCTION_URL")}` : undefined) ??
    "http://localhost:3000",
  appSecret: str("APP_SECRET") ?? "dev-only-insecure-secret-change-me-please-0000",
  adminEmails: (str("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === "production",

  ai: {
    provider: str("AI_PROVIDER") ?? "openai",
    openaiKey: str("OPENAI_API_KEY"),
    openaiModel: str("OPENAI_MODEL") ?? "gpt-5",
    /** Günstigeres Modell für einfache Aufgaben (Extraktion, OCR, Texte). Leer = Hauptmodell */
    openaiFastModel: str("OPENAI_FAST_MODEL"),
    costInputPerMTok: num("OPENAI_COST_INPUT_PER_MTOK", 1.25),
    costOutputPerMTok: num("OPENAI_COST_OUTPUT_PER_MTOK", 10),
    /** Kostenbremse: maximale KI-Kosten pro Tag (USD) */
    dailyBudgetUsd: num("AI_DAILY_BUDGET_USD", 20),
  },

  supabase: {
    url: str("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: str("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: str("SUPABASE_SERVICE_ROLE_KEY"),
    bucket: str("SUPABASE_STORAGE_BUCKET") ?? "uploads",
  },

  stripe: {
    secretKey: str("STRIPE_SECRET_KEY"),
    webhookSecret: str("STRIPE_WEBHOOK_SECRET"),
    allowLive: str("STRIPE_ALLOW_LIVE") === "true",
  },
  allowTestCredits: str("ALLOW_TEST_CREDITS") === "true" || (process.env.NODE_ENV !== "production" && str("ALLOW_TEST_CREDITS") !== "false"),

  ebay: {
    clientId: str("EBAY_CLIENT_ID"),
    clientSecret: str("EBAY_CLIENT_SECRET"),
    marketplaceId: str("EBAY_MARKETPLACE_ID") ?? "EBAY_DE",
    /** Nur nach Freischaltung der Marketplace Insights API durch eBay */
    insightsEnabled: str("EBAY_INSIGHTS_ENABLED") === "true",
  },
  mobileDe: { user: str("MOBILE_DE_API_USER"), password: str("MOBILE_DE_API_PASSWORD") },
  autoscout24: { apiKey: str("AUTOSCOUT24_API_KEY") },

  market: { apiUrl: str("MARKET_DATA_API_URL"), apiKey: str("MARKET_DATA_API_KEY") },

  vehicleHistory: {
    provider: str("VEHICLE_HISTORY_PROVIDER") ?? "demo",
    apiUrl: str("VEHICLE_HISTORY_API_URL"),
    apiKey: str("VEHICLE_HISTORY_API_KEY"),
  },

  uploadRetentionHours: num("UPLOAD_RETENTION_HOURS", 24),
  cronSecret: str("CRON_SECRET"),
  quickcheckLimitPerIp: num("QUICKCHECK_LIMIT_PER_IP", 5),
  quickcheckLimitPerUser: num("QUICKCHECK_LIMIT_PER_USER", 10),
  videoMaxSeconds: num("VIDEO_MAX_SECONDS", 90),
  videoMaxMb: num("VIDEO_MAX_MB", 100),
};

export const features = {
  get ai() {
    return env.ai.provider === "openai" && !!env.ai.openaiKey;
  },
  get supabase() {
    return !!(env.supabase.url && env.supabase.anonKey && env.supabase.serviceRoleKey);
  },
  get stripe() {
    if (!env.stripe.secretKey) return false;
    if (env.stripe.secretKey.startsWith("sk_live_") && !env.stripe.allowLive) return false;
    return true;
  },
  get stripeTestMode() {
    return !!env.stripe.secretKey?.startsWith("sk_test_");
  },
  get ebayApi() {
    return !!(env.ebay.clientId && env.ebay.clientSecret);
  },
  get marketApi() {
    return !!(env.market.apiUrl && env.market.apiKey);
  },
};

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && env.adminEmails.includes(email.toLowerCase());
}
