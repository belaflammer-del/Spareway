/**
 * eBay Browse API – offizielle Schnittstelle (developer.ebay.com).
 *  - OAuth Client Credentials (Token wird bis kurz vor Ablauf zwischengespeichert)
 *  - Suche nach vergleichbaren AKTIVEN Angeboten als Marktdaten-Provider.
 *    Das sind Angebotspreise, keine erzielten Verkaufspreise – so gekennzeichnet.
 */
import type { Comparable } from "../domain/schemas";
import { newId, nowIso } from "../utils";
import type { MarketDataProvider, MarketQuery } from "./providers";

export interface EbayCredentials {
  clientId?: string;
  clientSecret?: string;
  marketplaceId: string;
}

let cachedToken: { token: string; expiresAt: number; key: string } | null = null;

export async function getEbayToken(creds: EbayCredentials, f: typeof fetch = fetch): Promise<string> {
  const key = creds.clientId ?? "";
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await f("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`eBay OAuth fehlgeschlagen (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 7200) * 1000, key };
  return j.access_token;
}

/** Begriffe, die auf Zubehör, Defekte oder Teile hindeuten – nicht vergleichbar. */
const EXCLUDE = /\b(defekt|bastler|ersatzteil|teile|hülle|case|cover|schutzglas|panzerglas|karton|ovp leer|nur box|attrappe|dummy|tausch|suche|ankauf|motor\s*schaden|unfall)\b/i;

interface EbayItemSummary {
  itemId: string;
  title: string;
  price?: { value?: string; currency?: string };
  condition?: string;
  itemWebUrl?: string;
  itemLocation?: { postalCode?: string; country?: string };
  itemCreationDate?: string;
}

export function buildEbayQuery(q: MarketQuery): string | null {
  const parts = [q.brand, q.model, q.variant].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return parts.length >= 3 ? parts.slice(0, 100) : null;
}

/** Filtert Suchergebnisse auf wirklich vergleichbare Angebote. */
export function filterEbayResults(items: EbayItemSummary[], q: MarketQuery): Comparable[] {
  const modelTokens = (q.model ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const at = nowIso();
  const out: Comparable[] = [];
  for (const it of items) {
    if (it.price?.currency !== "EUR" || !it.price.value) continue;
    const price = Number(it.price.value);
    if (!Number.isFinite(price) || price <= 0) continue;
    const title = it.title ?? "";
    if (EXCLUDE.test(title)) continue;
    const lt = title.toLowerCase();
    if (modelTokens.length && !modelTokens.every((t) => lt.includes(t))) continue;
    const created = it.itemCreationDate ? Date.parse(it.itemCreationDate) : NaN;
    out.push({
      id: newId("cmp"),
      title: title.slice(0, 160),
      priceEur: price,
      priceType: "listing",
      url: it.itemWebUrl,
      region: it.itemLocation?.postalCode ? `PLZ ${it.itemLocation.postalCode.slice(0, 2)}xxx` : undefined,
      listingAgeDays: Number.isFinite(created) ? Math.max(0, Math.round((Date.now() - created) / 864e5)) : undefined,
      source: "eBay (aktive Angebote, Browse API)",
      collectedAt: at,
    });
  }
  return out;
}

export class EbayMarketProvider implements MarketDataProvider {
  id = "ebay_browse";
  name = "eBay Browse API";
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
    const j = (await res.json()) as { itemSummaries?: EbayItemSummary[] };
    return filterEbayResults(j.itemSummaries ?? [], q);
  }
}
