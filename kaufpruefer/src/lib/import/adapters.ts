/**
 * Modulare Import-Architektur – ein Adapter je Plattform.
 *
 * WICHTIG: Automatischer Import erfolgt ausschließlich über offizielle,
 * vertraglich bzw. per API-Zugang erlaubte Schnittstellen. Es werden keine
 * Captchas, Logins oder Zugriffsbeschränkungen umgangen und keine Seiten
 * gescrapt. Ohne Schnittstelle fällt die App auf Screenshots bzw. manuelle
 * Angaben zurück. Aus der URL selbst werden nur Plattform, Inserats-ID und
 * – falls vorhanden – Schlagwörter aus dem URL-Pfad abgeleitet.
 */
import type { Category, Listing, Platform } from "../domain/schemas";
import { getEbayToken } from "../market/ebay";
import { extractListingLink, resolveShortLink } from "./share-text";

export interface ImportContext {
  ebay?: { clientId?: string; clientSecret?: string; marketplaceId: string };
  fetchImpl?: typeof fetch;
  /** SSRF-geschützter fetch für die Kurzlink-Auflösung (nutzergelieferte URLs) */
  shortLinkFetch?: typeof fetch;
}

export interface ImportResult {
  listing: Partial<Listing>;
  method: "platform_api" | "url_only";
  notes: string[];
}

export interface PlatformAdapter {
  id: Platform;
  name: string;
  hosts: RegExp;
  /** Kurzbeschreibung des Importwegs für die Transparenzanzeige */
  importInfo: string;
  defaultCategory?: Category;
  extractId(url: URL): string | undefined;
  canAutoImport(ctx: ImportContext): boolean;
  autoImport?(url: URL, id: string, ctx: ImportContext): Promise<Partial<Listing>>;
}

/** Wandelt einen URL-Slug in einen lesbaren Titelvorschlag um. */
export function slugToTitle(slug: string): string | undefined {
  const clean = decodeURIComponent(slug)
    .replace(/\.html?$/i, "")
    .replace(/[-_+]+/g, " ")
    .replace(/\b\d{6,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 3 || !/[a-zäöü]/i.test(clean)) return undefined;
  return clean.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

const ebayAdapter: PlatformAdapter = {
  id: "ebay",
  name: "eBay",
  hosts: /(^|\.)ebay\.(de|com|at|ch|co\.uk|fr|it|es|nl)$/i,
  importInfo: "Offizielle eBay Browse API (wenn Zugangsdaten konfiguriert)",
  extractId(url) {
    return url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})/)?.[1] ?? url.searchParams.get("item") ?? undefined;
  },
  canAutoImport: (ctx) => !!(ctx.ebay?.clientId && ctx.ebay?.clientSecret),
  async autoImport(_url, id, ctx) {
    const f = ctx.fetchImpl ?? fetch;
    const access_token = await getEbayToken(ctx.ebay!, f);
    const itemRes = await f(`https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${access_token}`, "X-EBAY-C-MARKETPLACE-ID": ctx.ebay!.marketplaceId },
    });
    if (!itemRes.ok) throw new Error(`eBay-Artikel nicht abrufbar (${itemRes.status})`);
    const item = (await itemRes.json()) as {
      title?: string;
      price?: { value?: string; currency?: string };
      condition?: string;
      shortDescription?: string;
      brand?: string;
      mpn?: string;
      itemLocation?: { city?: string; postalCode?: string; country?: string };
      localizedAspects?: { name: string; value: string }[];
      seller?: { feedbackPercentage?: string; feedbackScore?: number };
    };
    const aspect = (n: RegExp) => item.localizedAspects?.find((a) => n.test(a.name))?.value;
    const price = item.price?.currency === "EUR" && item.price.value ? Number(item.price.value) : undefined;
    const yearStr = aspect(/baujahr|herstellungsjahr|year/i);
    return {
      title: item.title,
      priceEur: Number.isFinite(price) ? price : undefined,
      condition: item.condition,
      description: item.shortDescription,
      brand: item.brand ?? aspect(/^marke$|^brand$/i),
      model: aspect(/^modell$|^model$/i),
      year: yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : undefined,
      location: [item.itemLocation?.postalCode, item.itemLocation?.city].filter(Boolean).join(" ") || undefined,
    };
  },
};

const kleinanzeigenAdapter: PlatformAdapter = {
  id: "kleinanzeigen",
  name: "Kleinanzeigen",
  hosts: /(^|\.)(kleinanzeigen\.de|ebay-kleinanzeigen\.de)$/i,
  importInfo: "Keine öffentliche Schnittstelle – öffne das Inserat und tippe auf den „→ DEAL-NIVO“-Button (oder lade Screenshots hoch)",
  extractId(url) {
    return url.pathname.match(/\/s-anzeige\/[^/]+\/(\d+)/)?.[1] ?? url.pathname.match(/(\d{8,})/)?.[1];
  },
  canAutoImport: () => false,
};

const mobileDeAdapter: PlatformAdapter = {
  id: "mobile_de",
  name: "mobile.de",
  hosts: /(^|\.)mobile\.de$/i,
  importInfo: "Keine freigegebene Schnittstelle – öffne das Inserat und tippe auf den „→ DEAL-NIVO“-Button (oder lade Screenshots hoch)",
  defaultCategory: "vehicle",
  extractId(url) {
    return url.searchParams.get("id") ?? url.pathname.match(/(\d{7,})/)?.[1];
  },
  // Vorbereitet: Aktivierung erst nach vertraglicher Freigabe einer Schnittstelle.
  canAutoImport: () => false,
};

const autoscoutAdapter: PlatformAdapter = {
  id: "autoscout24",
  name: "AutoScout24",
  hosts: /(^|\.)autoscout24\.(de|at|ch|com|it|fr|nl|be|es)$/i,
  importInfo: "Keine freigegebene Schnittstelle – öffne das Inserat und tippe auf den „→ DEAL-NIVO“-Button (oder lade Screenshots hoch)",
  defaultCategory: "vehicle",
  extractId(url) {
    return url.pathname.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1];
  },
  canAutoImport: () => false,
};

const vintedAdapter: PlatformAdapter = {
  id: "vinted",
  name: "Vinted",
  hosts: /(^|\.)vinted\.(de|at|fr|com|it|es|nl|be|pl|cz|lt|co\.uk)$/i,
  importInfo: "Keine öffentliche Schnittstelle – öffne das Inserat und tippe auf den „→ DEAL-NIVO“-Button (oder lade Screenshots hoch)",
  defaultCategory: "fashion",
  extractId(url) {
    return url.pathname.match(/\/items\/(\d+)/)?.[1];
  },
  canAutoImport: () => false,
};

export const ADAPTERS: PlatformAdapter[] = [ebayAdapter, kleinanzeigenAdapter, mobileDeAdapter, autoscoutAdapter, vintedAdapter];

export function parseListingUrl(raw: string): URL | null {
  try {
    const s = raw.trim();
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

export function detectPlatform(url: URL): PlatformAdapter | null {
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  return ADAPTERS.find((a) => a.hosts.test(host)) ?? null;
}

/** Schlagwortbasierte Kategorie-Erkennung (Fallback, ohne KI). */
export function guessCategory(text: string, fallback: Category = "other"): Category {
  const t = text.toLowerCase();
  const rules: [Category, RegExp][] = [
    ["vehicle", /\b(audi|bmw|mercedes|vw|volkswagen|opel|ford|skoda|seat|toyota|honda|hyundai|kia|renault|peugeot|fiat|porsche|tesla|volvo|mazda|nissan|motorrad|motorroller|roller|scooter|mofa|moped|vespa|piaggio|gilera|aprilia|kawasaki|yamaha|ducati|harley|auto|pkw|kombi|limousine|cabrio|\d{3}d\b|tdi|tsi|tfsi)\b/],
    ["electronics", /\b(iphone|ipad|macbook|samsung\s+galaxy|galaxy\s+s\d+|pixel\s?\d|smartphone|handy|laptop|notebook|airpods|apple\s+watch|kamera|camera|drohne|tablet|fernseher|tv)\b/],
    ["watches_jewelry", /\b(rolex|omega|breitling|tag\s+heuer|cartier|patek|audemars|tudor|seiko|uhr|armbanduhr|submariner|datejust|speedmaster|ring|kette|armband|schmuck|gold)\b/],
    ["gaming_collectibles", /\b(playstation|ps[345]|xbox|nintendo|switch|gameboy|game\s?boy|n64|snes|sega|pokemon|pokémon|sammelkarte|funko|lego|videospiel|spiel\s+ovp|ovp|cib|sealed)\b/],
    ["fashion", /\b(moncler|gucci|prada|louis\s+vuitton|lv|chanel|hermes|hermès|balenciaga|dior|canada\s+goose|stone\s+island|nike|adidas|jacke|mantel|sneaker|schuhe|tasche|handtasche|kleid|pullover|daunenjacke)\b/],
  ];
  for (const [cat, re] of rules) if (re.test(t)) return cat;
  return fallback;
}

export async function importFromUrl(raw: string, ctx: ImportContext): Promise<ImportResult & { platform: Platform; url: string } | { error: string }> {
  // Akzeptiert auch komplette Teilen-Texte aus den Marktplatz-Apps
  const extracted = extractListingLink(raw);
  if (!extracted.url) return { error: "Wir haben in deiner Eingabe keinen Link gefunden. Kopiere den Link über „Teilen“ in der App und füge ihn hier ein." };
  const resolved = extracted.shortLink ? await resolveShortLink(extracted.url, ctx.shortLinkFetch ?? ctx.fetchImpl) : extracted.url;
  const url = parseListingUrl(resolved);
  if (!url) return { error: "Das sieht nicht nach einem gültigen Link aus." };
  const adapter = detectPlatform(url);
  const notes: string[] = [];
  const GENERIC = /^(s-anzeige|angebote|fahrzeuge|items|itm|details(\.html)?|auto|de|lst|product|produkt)$/i;
  const slugPart = url.pathname
    .split("/")
    .filter((p) => p && !GENERIC.test(p) && /[a-z]{2}/i.test(p) && p.includes("-"))
    .sort((a, b) => b.replace(/[^a-z]/gi, "").length - a.replace(/[^a-z]/gi, "").length)[0];
  // Titel aus dem Teilen-Text ist genauer als der URL-Slug
  const slugTitle = extracted.titleHint ?? (slugPart ? slugToTitle(slugPart) : undefined);

  if (!adapter) {
    notes.push("Diese Plattform wird noch nicht automatisch unterstützt. Bitte lade Screenshots hoch oder ergänze die Angaben.");
    return {
      platform: "other",
      url: url.toString(),
      method: "url_only",
      notes,
      listing: { title: slugTitle, category: guessCategory(slugTitle ?? ""), provenance: slugTitle ? { title: "url", category: "url" } : {} },
    };
  }

  const id = adapter.extractId(url);
  const base: Partial<Listing> = {
    platform: adapter.id,
    url: url.toString(),
    externalId: id,
    title: slugTitle,
    category: guessCategory(slugTitle ?? "", adapter.defaultCategory ?? "other"),
    provenance: { platform: "url", ...(slugTitle ? { title: "url" } : {}), category: "url" },
  };

  if (id && adapter.canAutoImport(ctx) && adapter.autoImport) {
    try {
      const imported = await adapter.autoImport(url, id, ctx);
      const provenance: Record<string, "platform_api" | "url"> = { ...(base.provenance as Record<string, "url">) };
      for (const [k, v] of Object.entries(imported)) if (v != null && v !== "") provenance[k] = "platform_api";
      const text = [imported.title, imported.brand, imported.model].filter(Boolean).join(" ");
      return {
        platform: adapter.id,
        url: url.toString(),
        method: "platform_api",
        notes: [`Daten über ${adapter.importInfo.replace(/ \(.*\)$/, "")} importiert.`],
        listing: {
          ...base,
          ...Object.fromEntries(Object.entries(imported).filter(([, v]) => v != null && v !== "")),
          category: guessCategory(text, base.category),
          provenance,
        },
      };
    } catch (e) {
      notes.push(`Automatischer Import nicht möglich: ${(e as Error).message}. Bitte Screenshots hochladen.`);
    }
  } else {
    notes.push(adapter.importInfo);
  }
  return { platform: adapter.id, url: url.toString(), method: "url_only", notes, listing: base };
}
