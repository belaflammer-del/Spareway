import type { ChatCategory } from "./schemas";

export const CHAT_CATEGORY_LABELS: Record<ChatCategory, string> = {
  payment: "Zahlungsrisiko",
  communication: "Kommunikationsauffälligkeiten",
  contradiction: "Widersprüche",
  shipping: "Versandrisiko",
  phishing: "Phishingverdacht",
  personal_data: "Persönliche Daten",
  missing_info: "Fehlende Informationen",
};

export const LEVEL_LABELS = { none: "Unauffällig", hint: "Hinweis", warning: "Warnung", high: "Hoch" } as const;
export const LEVEL_TONE = { none: "good", hint: "info", warning: "warn", high: "bad" } as const;

export const INSPECTION_STATUS_LABELS = { ok: "In Ordnung", conspicuous: "Auffällig", unchecked: "Nicht geprüft", na: "Nicht anwendbar" } as const;

export const MATCH_LABELS = { identical: "Identisches Bild", strong: "Stark ähnliches Bild", possible: "Möglicherweise ähnlich", none: "Kein Treffer im geprüften Datenbestand" } as const;
