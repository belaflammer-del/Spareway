import type {
  Category,
  ClaimSourceType,
  ComplaintCategory,
  EvidenceLevel,
  FieldSource,
  ListingFieldKey,
  Platform,
  PriceRating,
  Recommendation,
} from "./schemas";

export const CATEGORY_LABELS: Record<Category, string> = {
  vehicle: "Autos & Motorräder",
  electronics: "Smartphones & Elektronik",
  fashion: "Kleidung & Luxusmode",
  watches_jewelry: "Uhren & Schmuck",
  gaming_collectibles: "Gaming & Sammlerstücke",
  other: "Weitere Gebrauchtwaren",
};

/** Ausbaustufe je Kategorie – transparent im UI angezeigt. */
export const CATEGORY_SUPPORT: Record<Category, "full" | "basic"> = {
  vehicle: "full",
  electronics: "full",
  fashion: "basic",
  watches_jewelry: "basic",
  gaming_collectibles: "basic",
  other: "basic",
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  mobile_de: "mobile.de",
  autoscout24: "AutoScout24",
  kleinanzeigen: "Kleinanzeigen",
  ebay: "eBay",
  vinted: "Vinted",
  other: "Andere Plattform",
  unknown: "Unbekannt",
};

export const FIELD_SOURCE_LABELS: Record<FieldSource, string> = {
  url: "Aus Link erkannt",
  platform_api: "Plattform-Schnittstelle",
  ai_extraction: "KI aus Screenshot",
  page: "Von der Inseratsseite",
  user: "Von dir angegeben",
  demo: "Demo-Daten",
};

export const CLAIM_SOURCE_LABELS: Record<ClaimSourceType, string> = {
  listing_text: "Inseratstext",
  listing_image: "Inseratsbild",
  user_input: "Deine Angaben",
  platform_api: "Plattform-Schnittstelle",
  knowledge_base: "Geprüfte Wissensdatenbank",
  market_data: "Marktdaten",
  user_comparables: "Deine Vergleichsangebote",
  seller_reviews: "Verkäuferbewertungen",
  rule_engine: "Regelprüfung",
  ai_model_knowledge: "KI-Hinweis (nicht verifiziert)",
  demo: "Demo",
};

export const EVIDENCE_LABELS: Record<EvidenceLevel, string> = {
  visible: "Sichtbar belegt",
  possible: "Mögliche Auffälligkeit",
  unverifiable: "Nicht überprüfbar",
};

export const PRICE_RATING_LABELS: Record<PriceRating, string> = {
  very_good: "Sehr guter Preis",
  good: "Guter Preis",
  fair: "Fairer Preis",
  rather_expensive: "Eher teuer",
  well_above: "Deutlich über Marktwert",
  insufficient_data: "Nicht ausreichend Daten",
};

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  interesting: "Interessantes Angebot",
  inspect_further: "Besichtigung bzw. weitere Prüfung sinnvoll",
  elevated_risk: "Erhöhtes Risiko",
  missing_info: "Wesentliche Informationen fehlen",
};

export const COMPLAINT_LABELS: Record<ComplaintCategory, string> = {
  not_received: "Ware nicht erhalten",
  not_as_described: "Produkt weicht von Beschreibung ab",
  counterfeit_suspicion: "Verdacht auf Fälschung",
  payment_issues: "Zahlungsprobleme",
  communication: "Kommunikationsprobleme",
  shipping: "Versandprobleme",
  other: "Sonstige Beschwerden",
};

export const FIELD_LABELS: Record<ListingFieldKey, string> = {
  title: "Titel",
  brand: "Marke",
  model: "Modell",
  variant: "Variante / Ausführung",
  year: "Baujahr / Herstellungsjahr",
  priceEur: "Angebotspreis (€)",
  condition: "Zustand",
  description: "Beschreibung",
  mileageKm: "Kilometerstand",
  location: "Standort (PLZ/Ort)",
  firstRegistration: "Erstzulassung",
  fuel: "Kraftstoff",
  transmission: "Getriebe",
  powerKw: "Leistung (kW)",
  engine: "Motor (Bezeichnung/Hubraum)",
  serviceHistory: "Scheckheft / Wartungsnachweise",
  accidentFree: "Unfallfrei laut Verkäufer",
  previousOwners: "Vorbesitzer",
  vin: "FIN (Fahrgestellnummer)",
  storageGb: "Speicher (GB)",
  batteryHealthPct: "Akkuzustand (%)",
  accessories: "Zubehör / Lieferumfang",
  activationLockFree: "Aktivierungssperre entfernt",
  purchaseReceipt: "Kaufbeleg vorhanden",
  size: "Größe",
  material: "Material",
  serialNumber: "Seriennummer / Referenz",
  boxAndPapers: "Box & Papiere",
  sellerType: "Verkäufer (privat/gewerblich)",
  paymentMethods: "Gewünschte Zahlungsart",
};

export const NUMERIC_FIELDS: ListingFieldKey[] = [
  "year",
  "priceEur",
  "mileageKm",
  "powerKw",
  "previousOwners",
  "storageGb",
  "batteryHealthPct",
];

export function formatEur(n: number | undefined | null, opts: { compact?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: opts.compact || n >= 1000 ? 0 : 2,
  }).format(n);
}

export function formatNumber(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return new Intl.NumberFormat("de-DE").format(n);
}
