// Fachliche Konstanten und deutsche Bezeichnungen

export const VEHICLE_CLASSES = [
  "kleinwagen", "kompaktwagen", "limousine", "kombi", "suv", "gelaendewagen", "coupe", "cabrio",
  "sportwagen", "supersportwagen", "van", "transporter", "wohnmobil", "motorrad",
] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = {
  kleinwagen: "Kleinwagen", kompaktwagen: "Kompaktwagen", limousine: "Limousine", kombi: "Kombi",
  suv: "SUV", gelaendewagen: "Geländewagen", coupe: "Coupé", cabrio: "Cabrio", sportwagen: "Sportwagen",
  supersportwagen: "Supersportwagen", van: "Van", transporter: "Transporter", wohnmobil: "Wohnmobil", motorrad: "Motorrad",
};

export const SOILING_LEVELS = ["leicht", "normal", "stark", "extrem"] as const;
export type SoilingLevel = (typeof SOILING_LEVELS)[number];
export const SOILING_LABELS: Record<SoilingLevel, string> = { leicht: "Leicht", normal: "Normal", stark: "Stark", extrem: "Extrem" };

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Entwurf", sent: "Versendet", accepted: "Angenommen", rejected: "Abgelehnt", expired: "Abgelaufen",
};

export const ORDER_STATUSES = [
  "anfrage", "angebot_erstellt", "bestaetigt", "geplant", "fahrzeug_angenommen", "in_bearbeitung",
  "qualitaetskontrolle", "fertig", "abholbereit", "abgeschlossen", "storniert",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  anfrage: "Anfrage", angebot_erstellt: "Angebot erstellt", bestaetigt: "Bestätigt", geplant: "Geplant",
  fahrzeug_angenommen: "Fahrzeug angenommen", in_bearbeitung: "In Bearbeitung", qualitaetskontrolle: "Qualitätskontrolle",
  fertig: "Fertig", abholbereit: "Abholbereit", abgeschlossen: "Abgeschlossen", storniert: "Storniert",
};
/** Spalten der Kanban-Ansicht (abgeschlossen/storniert werden separat gezeigt) */
export const ORDER_BOARD_COLUMNS: OrderStatus[] = [
  "anfrage", "bestaetigt", "geplant", "fahrzeug_angenommen", "in_bearbeitung", "qualitaetskontrolle", "abholbereit",
];
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ["fahrzeug_angenommen", "in_bearbeitung", "qualitaetskontrolle", "fertig"];

export const ROLES = ["owner", "admin", "office", "staff"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  owner: "Inhaber", admin: "Administrator", office: "Büro / Verwaltung", staff: "Mitarbeiter",
};

export type PricingConfig = {
  hourlyRate: number;
  internalHourlyCost: number;
  vehicleClassFactors: Record<VehicleClass, number>;
  soilingFactors: Record<SoilingLevel, number>;
};

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  hourlyRate: 60,
  internalHourlyCost: 30,
  vehicleClassFactors: {
    kleinwagen: 0.9, kompaktwagen: 1, limousine: 1.1, kombi: 1.15, suv: 1.25, gelaendewagen: 1.3, coupe: 1.05,
    cabrio: 1.1, sportwagen: 1.2, supersportwagen: 1.5, van: 1.3, transporter: 1.4, wohnmobil: 2, motorrad: 0.7,
  },
  soilingFactors: { leicht: 0.9, normal: 1, stark: 1.3, extrem: 1.6 },
};

export function normalizePricingConfig(raw: unknown): PricingConfig {
  const r = (raw ?? {}) as Partial<PricingConfig>;
  return {
    hourlyRate: num(r.hourlyRate, DEFAULT_PRICING_CONFIG.hourlyRate),
    internalHourlyCost: num(r.internalHourlyCost, DEFAULT_PRICING_CONFIG.internalHourlyCost),
    vehicleClassFactors: { ...DEFAULT_PRICING_CONFIG.vehicleClassFactors, ...(r.vehicleClassFactors ?? {}) },
    soilingFactors: { ...DEFAULT_PRICING_CONFIG.soilingFactors, ...(r.soilingFactors ?? {}) },
  };
}
function num(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function customerDisplayName(c: { type?: string | null; company_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  if (c.company_name && (c.type === "business" || !c.last_name)) return c.company_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Unbenannt";
}

export function vehicleDisplayName(v: { make?: string | null; model?: string | null; variant?: string | null }) {
  return [v.make, v.model, v.variant].filter(Boolean).join(" ");
}

export const DAYS = [
  ["mo", "Montag"], ["di", "Dienstag"], ["mi", "Mittwoch"], ["do", "Donnerstag"], ["fr", "Freitag"], ["sa", "Samstag"], ["so", "Sonntag"],
] as const;

export const DEFAULT_OPENING_HOURS: Record<string, { open: boolean; from: string; to: string }> = Object.fromEntries(
  DAYS.map(([k]) => [k, { open: !["sa", "so"].includes(k), from: "08:00", to: "18:00" }]),
);

export const PHOTO_CATEGORIES = ["vorher", "waehrend", "nachher", "schaden", "verschmutzung", "endkontrolle"] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];
export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = {
  vorher: "Vorher", waehrend: "Währenddessen", nachher: "Nachher", schaden: "Schäden", verschmutzung: "Besondere Verschmutzung", endkontrolle: "Endkontrolle",
};
