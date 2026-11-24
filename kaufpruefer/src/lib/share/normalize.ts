/**
 * Plattformerkennung und URL-Normalisierung für geteilte Inserate.
 * Läuft ohne Netzwerkzugriff (reine Funktionen, testbar).
 */
import { detectPlatform, parseListingUrl, type PlatformAdapter } from "../import/adapters";
import { cleanUrl } from "../import/share-text";

export interface NormalizedListingUrl {
  url: string;
  adapter: PlatformAdapter | null;
  externalId?: string;
}

/**
 * Bringt Inseratslinks in eine kanonische Form, damit derselbe Artikel aus
 * App, Mobilseite und Desktop als dasselbe Inserat erkannt wird.
 */
export function normalizeListingUrl(raw: string): NormalizedListingUrl | null {
  const parsed = parseListingUrl(cleanUrl(raw));
  if (!parsed) return null;
  if (!/^https?:$/.test(parsed.protocol)) return null;
  parsed.protocol = "https:";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^m\./, "www.");
  parsed.hash = "";
  const adapter = detectPlatform(parsed);
  if (!adapter) return { url: parsed.toString(), adapter: null };
  const id = adapter.extractId(parsed);
  let url = parsed.toString();
  switch (adapter.id) {
    case "ebay": {
      const tld = parsed.hostname.match(/ebay\.([a-z.]+)$/)?.[1] ?? "de";
      if (id) url = `https://www.ebay.${tld}/itm/${id}`;
      break;
    }
    case "vinted": {
      const tld = parsed.hostname.match(/vinted\.([a-z.]+)$/)?.[1] ?? "de";
      if (id) url = `https://www.vinted.${tld}/items/${id}`;
      break;
    }
    case "kleinanzeigen":
      parsed.hostname = "www.kleinanzeigen.de";
      parsed.search = "";
      url = parsed.toString();
      break;
    case "mobile_de":
      if (id) url = `https://suchen.mobile.de/fahrzeuge/details.html?id=${id}`;
      break;
    case "autoscout24":
      parsed.search = "";
      url = parsed.toString();
      break;
  }
  return { url: url.replace(/\/$/, ""), adapter, externalId: id };
}
