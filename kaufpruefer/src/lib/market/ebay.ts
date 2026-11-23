/**
 * eBay – nur offizielle Schnittstellen (developer.ebay.com).
 *
 *  1. Browse API (item_summary/search): AKTIVE Angebote. Für jede registrierte
 *     App mit Produktions-Schlüssel nutzbar. → EbayMarketProvider
 *  2. Marketplace Insights API (item_sales/search): VERKAUFTE Artikel der letzten
 *     90 Tage. Eingeschränkter Zugang – nur nach Freischaltung durch eBay.
 *     → EbaySoldPricesProvider, standardmäßig NICHT aktiviert
 *     (EBAY_INSIGHTS_ENABLED=true erst nach Freigabe).
 *
 * Es wird nicht angenommen, dass Verkaufspreise automatisch verfügbar sind.
 */
import type { Comparable } from "../domain/schemas";
import { newId, nowIso } from "../utils";
import type { MarketDataProvider, MarketQuery } from "./providers";

export interface EbayCredentials {
  clientId?: string;
  clientSecret?: string;
  marketplaceId: string;
}

const BASE_SCOPE = "https://api.ebay.com/oauth/api_scope";
const INSIGHTS_SCOPE = "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights";
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getEbayToken(creds: EbayCredentials, f: typeof fetch = fetch, scope = BASE_SCOPE): Promise<string> {
  const key = `${creds.clientId}:${scope}`;
  const c = tokenCache.get(key);
  if (c && c.expiresAt > Date.now() + 60_000) return c.token;
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await f("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`eBay OAuth fehlgeschlagen (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache.set(key, { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 7200) * 1000 });
  return j.access_token;
}

/** Begriffe, die auf Zubehör, Defekte oder Teile hindeuten – nicht vergleichbar. */
const EXCLUDE = /\b(defekt|bastler|ersatzteil|teile|hülle|case|cover|schutzglas|panzerglas|karton|ovp leer|nur box|attrappe|dummy|tausch|suche|ankauf|motor\s*schaden|unfall|for parts)\b/i;

interface EbayItem {
  itemId?: string;
  title: string;
  price?: { value?: string; currency?: string };
  lastSoldPrice?: { value?: string; currency?: string };
  lastSoldDate?: string;
  condition?: string;
  itemWebUrl?: string;
  image?: { imageUrl?: string };
  thumbnailImages?: { imageUrl?: string }[];
  itemLocation?: { postalCode?: string; country?: string };
  itemCreationDate?: string;
}

export function buildEbayQuery(q: MarketQuery): string | null {
  const parts = [q.brand, q.model, q.variant, q.storageGb ? `${q.storageGb}GB` : undefined].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return parts.length >= 3 ? parts.slice(0, 100) : null;
}

/** Speichergröße aus einem Titel lesen (z. B. „256GB“, „1 TB“). */
export function parseStorageGb(title: string): number | undefined {
  const m = title.match(/\b(\d{2,4})\s?(gb|tb)\b/i);
  if (!m) return undefined;
  return m[2].toLowerCase() === "tb" ? Number(m[1]) * 1024 : Number(m[1]);
}

function safeHttps(u?: string) {
  return u && /^https:\/\//.test(u) ? u : undefined;
}

/** Filtert Ergebnisse auf wirklich vergleichbare Artikel (Modell, Variante, keine Teile/Zubehör). */
export function filterEbayResults(items: EbayItem[], q: MarketQuery, kind: "listing" | "sold" = "listing"): Comparable[] {
  const modelTokens = (q.model ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const at = nowIso();
  const out: Comparable[] = [];
  for (const it of items) {
    const p = kind === "sold" ? it.lastSoldPrice : it.price;
    if (p?.currency !== "EUR" || !p.value) continue;
    const price = Number(p.value);
    if (!Number.isFinite(price) || price <= 0) continue;
    const title = it.title ?? "";
    if (EXCLUDE.test(title)) continue;
    const lt = title.toLowerCase();
    if (modelTokens.length && !modelTokens.every((t) => lt.includes(t))) continue;
    // Modellvariante: abweichende Speichergröße ist kein Vergleich
    const storage = parseStorageGb(title);
    if (q.storageGb && storage && storage !== q.storageGb) continue;
    const created = it.itemCreationDate ? Date.parse(it.itemCreationDate) : NaN;
    const attributes: Record<string, string> = {};
    if (storage) attributes["Speicher"] = storage >= 1024 ? `${storage / 1024} TB` : `${storage} GB`;
    out.push({
      id: newId("cmp"),
      title: title.slice(0, 160),
      priceEur: price,
      priceType: kind,
      url: safeHttps(it.itemWebUrl),
      imageUrl: safeHttps(it.image?.imageUrl ?? it.thumbnailImages?.[0]?.imageUrl),
      conditionText: it.condition,
      platform: "eBay",
      attributes: Object.keys(attributes).length ? attributes : undefined,
      region: it.itemLocation?.postalCode ? `PLZ ${it.itemLocation.postalCode.slice(0, 2)}xxx` : undefined,
      listingAgeDays: Number.isFinite(created) ? Math.max(0, Math.round((Date.now() - created) / 864e5)) : undefined,
      source: kind === "sold" ? "eBay (verkaufte Artikel, Marketplace Insights API)" : "eBay (aktive Angebote, Browse API)",
      collectedAt: kind === "sold" && it.lastSoldDate ? new Date(it.lastSoldDate).toISOString() : at,
    });
  }
  return out;
}

/** Aktive Angebote über die Browse API. */
export class EbayMarketProvider implements MarketDataProvider {
  id = "ebay_browse";
  name = "eBay Browse API (aktive Angebote)";
  constructor(
    private creds: EbayCredentials,
    private f: typeof fetch = fetch,
  ) {}
  isConfigured() {
    return !!(this.creds.clientId && this.creds.clientSecret);
  }
  supports() {
    return true;
  }
  async fetchComparables(q: MarketQuery): Promise<Comparable[]> {
    const query = buildEbayQuery(q);
    if (!query) return [];
    const token = await getEbayToken(this.creds, this.f);
    const params = new URLSearchParams({ q: query, limit: "50", filter: "priceCurrency:EUR,buyingOptions:{FIXED_PRICE|BEST_OFFER},conditions:{USED}" });
    const res = await this.f(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": this.creds.marketplaceId },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`eBay-Suche fehlgeschlagen (${res.status})`);
    const j = (await res.json()) as { itemSummaries?: EbayItem[] };
    return filterEbayResults(j.itemSummaries ?? [], q, "listing");
  }
}

/** Verkaufte Artikel über die Marketplace Insights API – nur mit Freischaltung durch eBay. */
export class EbaySoldPricesProvider implements MarketDataProvider {
  id = "ebay_insights";
  name = "eBay Marketplace Insights (verkaufte Artikel)";
  constructor(
    private creds: EbayCredentials & { insightsEnabled?: boolean },
    private f: typeof fetch = fetch,
  ) {}
  isConfigured() {
    return !!(this.creds.clientId && this.creds.clientSecret && this.creds.insightsEnabled);
  }
  supports() {
    return true;
  }
  async fetchComparables(q: MarketQuery): Promise<Comparable[]> {
    const query = buildEbayQuery(q);
    if (!query || !this.isConfigured()) return [];
    const token = await getEbayToken(this.creds, this.f, INSIGHTS_SCOPE);
    const params = new URLSearchParams({ q: query, limit: "50", filter: "conditions:{USED}" });
    const res = await this.f(`https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search?${params}`, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": this.creds.marketplaceId },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 403) throw new Error("eBay Marketplace Insights: keine Freischaltung für diese App");
    if (!res.ok) throw new Error(`eBay Insights fehlgeschlagen (${res.status})`);
    const j = (await res.json()) as { itemSales?: EbayItem[] };
    return filterEbayResults(j.itemSales ?? [], q, "sold");
  }
}
