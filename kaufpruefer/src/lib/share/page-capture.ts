/**
 * „→ DEAL-NIVO“-Button: Übernahme der Inseratsseite, die der Nutzer gerade
 * selbst in seinem Browser geöffnet hat.
 *
 * Der Button (Lesezeichen) liest im Browser des Nutzers nur die sichtbare Seite
 * – vergleichbar mit Markieren und Kopieren – und übergibt sie an DEAL-NIVO.
 * Der DEAL-NIVO-Server ruft die Inseratsseite selbst NIE ab.
 *
 * Diese Datei ist rein funktional (Browser + Server), ohne Netzwerkzugriff.
 */
import { z } from "zod";
import type { Category, Listing } from "../domain/schemas";
import { detectPlatform, guessCategory, parseListingUrl } from "../import/adapters";
import { cleanUrl } from "../import/share-text";

export const PageCaptureSchema = z.object({
  v: z.literal(1),
  url: z.string().max(2000),
  title: z.string().max(500).optional().default(""),
  price: z.string().max(200).optional().default(""),
  description: z.string().max(12000).optional().default(""),
  location: z.string().max(300).optional().default(""),
  details: z.array(z.tuple([z.string().max(120), z.string().max(300)])).max(80).default([]),
  jsonLd: z.array(z.string().max(30000)).max(6).default([]),
  meta: z.record(z.string().max(80), z.string().max(3000)).default({}),
  images: z.array(z.string().max(1000)).max(30).default([]),
  text: z.string().max(20000).optional().default(""),
});
export type PageCapture = z.infer<typeof PageCaptureSchema>;

export function parseNumberDe(s: string): number | undefined {
  const t = s.replace(/[^\d.,-]/g, "");
  if (!t) return undefined;
  const normalized = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

/** Preis aus „5.800 € VB“, „VB 5.800 €“, „18.900,00 EUR“ – „Zu verschenken“ = 0. */
export function parsePrice(raw: string | undefined): { priceEur?: number; negotiable: boolean } {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  const negotiable = /\bVB\b|verhandlungsbasis/i.test(s);
  if (/zu verschenken/i.test(s)) return { priceEur: 0, negotiable: false };
  const m = s.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2})?\s*(?:€|eur)/i) ?? s.match(/(?:€|eur)\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2})?/i);
  const n = m ? parseNumberDe(m[0].replace(/\s(?=\d{3})/g, ".")) : undefined;
  return { priceEur: n != null && n >= 0 && n < 100_000_000 ? n : undefined, negotiable };
}

const MONTHS: Record<string, string> = { januar: "01", februar: "02", märz: "03", maerz: "03", april: "04", mai: "05", juni: "06", juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12" };

/** „Oktober 1998“, „10/1998“, „1998“ → { year, firstRegistration } */
export function parseRegistration(raw: string): { year?: number; firstRegistration?: string } {
  const s = raw.trim().toLowerCase();
  const y = s.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  if (!y) return {};
  const year = Number(y[1]);
  const mNum = s.match(/\b(0?[1-9]|1[0-2])\s*[/.-]\s*(19|20)\d{2}\b/);
  const mWord = Object.keys(MONTHS).find((k) => s.includes(k));
  const month = mNum ? mNum[1].padStart(2, "0") : mWord ? MONTHS[mWord] : undefined;
  return { year, firstRegistration: month ? `${month}/${year}` : String(year) };
}

/** „24 PS“, „18 kW“, „110 kW (150 PS)“ → kW */
export function parsePowerKw(raw: string): number | undefined {
  const kw = raw.match(/(\d{1,4})\s*kw/i);
  if (kw) return Number(kw[1]);
  const ps = raw.match(/(\d{1,4})\s*ps/i);
  return ps ? Math.round(Number(ps[1]) * 0.7355) : undefined;
}

type FieldSetter = (l: Partial<Listing>, value: string) => void;
const DETAIL_MAP: { re: RegExp; set: FieldSetter }[] = [
  { re: /^(marke|hersteller|brand)$/i, set: (l, v) => (l.brand = v) },
  { re: /^(modell|model|modellreihe)$/i, set: (l, v) => (l.model = v) },
  { re: /^(variante|ausstattungslinie|version)$/i, set: (l, v) => (l.variant = v) },
  { re: /^(kilometerstand|km-stand|laufleistung|kilometer|mileage)$/i, set: (l, v) => { const n = parseNumberDe(v); if (n != null && n < 3_000_000) l.mileageKm = n; } },
  {
    re: /^(erstzulassung|ez|baujahr|first registration|herstellungsjahr)$/i,
    set: (l, v) => {
      const r = parseRegistration(v);
      if (r.year) l.year = r.year;
      if (r.firstRegistration) l.firstRegistration = r.firstRegistration;
    },
  },
  { re: /^(kraftstoff|kraftstoffart|treibstoff|fuel)$/i, set: (l, v) => (l.fuel = v) },
  { re: /^(getriebe|getriebeart|schaltung|transmission)$/i, set: (l, v) => (l.transmission = v) },
  { re: /^(leistung|motorleistung|power)$/i, set: (l, v) => { const k = parsePowerKw(v); if (k) l.powerKw = k; } },
  { re: /^(hubraum|motor|motorisierung)$/i, set: (l, v) => (l.engine = v) },
  { re: /^(fahrzeugzustand|zustand|condition|artikelzustand)$/i, set: (l, v) => (l.condition = v) },
  { re: /^(anzahl (der )?fahrzeughalter|fahrzeughalter|vorbesitzer|halter)$/i, set: (l, v) => { const n = parseNumberDe(v); if (n != null && n < 50) l.previousOwners = n; } },
  { re: /^(schäden|unfallfrei|unfall|unfallschaden)$/i, set: (l, v) => (l.accidentFree = v) },
  { re: /^(scheckheft|scheckheftgepflegt|wartung|serviceheft)$/i, set: (l, v) => (l.serviceHistory = v) },
  { re: /^(speicher|speicherkapazität|speichergröße|storage)$/i, set: (l, v) => { const n = parseNumberDe(v); if (n) l.storageGb = /tb/i.test(v) ? n * 1024 : n; } },
  { re: /^(akkukapazität|batteriezustand|akkuzustand)$/i, set: (l, v) => { const n = parseNumberDe(v); if (n != null && n <= 100) l.batteryHealthPct = n; } },
  { re: /^(größe|groesse|size|konfektionsgröße)$/i, set: (l, v) => (l.size = v) },
  { re: /^(material|obermaterial)$/i, set: (l, v) => (l.material = v) },
  { re: /^(versand|versandart)$/i, set: (l, v) => (l.paymentMethods = l.paymentMethods ? `${l.paymentMethods}; Versand: ${v}` : `Versand: ${v}`) },
  { re: /^(ort|standort|location)$/i, set: (l, v) => (l.location = v) },
  { re: /^(anbieter|verkäufer|händler|seller type)$/i, set: (l, v) => (l.sellerType = v) },
];

function walkJsonLd(node: unknown, out: Record<string, unknown>[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((n) => walkJsonLd(n, out));
  const o = node as Record<string, unknown>;
  if (o["@graph"]) walkJsonLd(o["@graph"], out);
  const t = String(o["@type"] ?? "");
  if (/product|car|vehicle|motorcycle|offer|individualproduct/i.test(t)) out.push(o);
}

const str = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number") return String(v).trim() || undefined;
  if (typeof v === "object" && "name" in (v as object)) return str((v as { name: unknown }).name);
  if (typeof v === "object" && "value" in (v as object)) return str((v as { value: unknown }).value);
  return undefined;
};

function fromJsonLd(blocks: string[]): Omit<Partial<Listing>, "images"> & { images?: string[] } {
  const items: Record<string, unknown>[] = [];
  for (const b of blocks) {
    try {
      walkJsonLd(JSON.parse(b), items);
    } catch {
      /* ungültiges JSON-LD ignorieren */
    }
  }
  const l: Omit<Partial<Listing>, "images"> & { images?: string[] } = {};
  for (const o of items) {
    l.title ??= str(o.name);
    l.description ??= str(o.description);
    l.brand ??= str(o.brand) ?? str(o.manufacturer);
    l.model ??= str(o.model);
    const offers = (Array.isArray(o.offers) ? o.offers[0] : o.offers) as Record<string, unknown> | undefined;
    const price = str(offers?.price ?? o.price);
    const cur = str(offers?.priceCurrency ?? o.priceCurrency);
    if (l.priceEur == null && price && (!cur || cur === "EUR")) {
      const n = Number(price);
      if (Number.isFinite(n) && n >= 0) l.priceEur = n;
    }
    const km = str(o.mileageFromOdometer);
    if (l.mileageKm == null && km) l.mileageKm = parseNumberDe(km);
    const reg = str(o.vehicleModelDate) ?? str(o.productionDate) ?? str(o.dateVehicleFirstRegistered);
    if (reg && l.year == null) Object.assign(l, parseRegistration(reg));
    l.fuel ??= str(o.fuelType);
    l.transmission ??= str(o.vehicleTransmission);
    const img = o.image;
    const imgs = (Array.isArray(img) ? img : img ? [img] : []).map((x) => (typeof x === "string" ? x : str((x as { url?: unknown }).url))).filter((x): x is string => !!x);
    if (imgs.length && !l.images) l.images = imgs;
  }
  return l;
}

const SITE_SUFFIX = /\s*[|–-]\s*(kleinanzeigen|ebay kleinanzeigen|ebay|mobile\.de|autoscout24|vinted)(\.de)?.*$/i;

export interface ParsedCapture {
  listing: Partial<Listing>;
  imageUrls: string[];
  notes: string[];
  /** Wie viele Felder direkt erkannt wurden (für die Entscheidung, ob KI nachhelfen soll) */
  fieldsFound: number;
}

/** Wandelt die übernommene Seite in Inseratsangaben um (ohne KI, ohne Netzwerk). */
export function parsePageCapture(c: PageCapture): ParsedCapture {
  const notes: string[] = [];
  const url = parseListingUrl(cleanUrl(c.url));
  const adapter = url ? detectPlatform(url) : null;
  const l: Partial<Listing> = {
    platform: adapter?.id ?? "other",
    url: url?.toString(),
    externalId: url && adapter ? adapter.extractId(url) : undefined,
  };

  // 1) Detailfelder der Seite (z. B. „Kilometerstand: 14.350 km“)
  for (const [k, v] of c.details) {
    const key = k.replace(/[:*]+$/, "").trim();
    const val = v.trim();
    if (!key || !val) continue;
    const rule = DETAIL_MAP.find((d) => d.re.test(key));
    if (rule) rule.set(l, val.slice(0, 200));
  }

  // 2) Titel, Preis, Beschreibung, Ort
  const title = (c.title || c.meta["og:title"] || "").replace(SITE_SUFFIX, "").trim();
  if (title) l.title = title.slice(0, 200);
  const p = parsePrice(c.price || c.meta["product:price:amount"] ? `${c.price} ${c.meta["product:price:amount"] ?? ""} €` : "");
  if (p.priceEur != null) l.priceEur = p.priceEur;
  if (p.negotiable) notes.push("Preis ist Verhandlungsbasis (VB).");
  const desc = c.description || c.meta["og:description"] || "";
  if (desc) l.description = desc.slice(0, 8000);
  if (c.location && !l.location) l.location = c.location.replace(/\s+/g, " ").slice(0, 120);

  // 3) Strukturierte Daten (JSON-LD) ergänzen nur, was noch fehlt
  const ld = fromJsonLd(c.jsonLd);
  for (const [k, v] of Object.entries(ld)) if (k !== "images" && v != null && (l as Record<string, unknown>)[k] == null) (l as Record<string, unknown>)[k] = v;

  // 4) Kategorie
  const hay = [l.title, l.brand, l.model, ...c.details.map((d) => d.join(" "))].filter(Boolean).join(" ");
  const vehicleHint = c.details.some(([k]) => /kilometerstand|erstzulassung|kraftstoff|getriebe/i.test(k));
  const cat: Category = vehicleHint ? "vehicle" : guessCategory(hay, adapter?.defaultCategory ?? "other");
  l.category = cat;

  // 5) Bilder: Galerie-Bilder der Seite, sonst JSON-LD/OG
  const imageUrls = [...new Set([...c.images, ...(ld.images ?? []), c.meta["og:image"]].filter((x): x is string => !!x && /^https:\/\//.test(x)))].slice(0, 12);

  const fieldsFound = ["title", "priceEur", "brand", "model", "mileageKm", "year", "description"].filter((k) => (l as Record<string, unknown>)[k] != null).length;
  return { listing: l, imageUrls, notes, fieldsFound };
}

/** Bild-CDNs der unterstützten Plattformen – nur von dort werden Bilder übernommen. */
export const IMAGE_CDN_HOSTS = /^(img\.kleinanzeigen\.de|i\.ebayimg\.com|img\.classistatic\.de|prod\.pictures\.autoscout24\.net|images\d*\.vinted\.net|[a-z0-9-]+\.vinted\.net)$/i;
