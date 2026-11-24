/**
 * Kostentabelle für die Gesamtkostenanalyse.
 *
 * WICHTIG: DEAL-NIVO liefert bewusst KEINE eingebauten Euro-Beträge aus.
 * Beträge stammen ausschließlich aus
 *   1. vom Betreiber gepflegten, belegten Einträgen (Admin → Kostentabelle,
 *      jeweils mit Quelle und Prüfdatum),
 *   2. Angaben im Inserat bzw. Belegen (z. B. „Inspektion fällig, KVA 480 €“),
 *   3. ausdrücklich gekennzeichneten Nutzereingaben (z. B. Werkstatt-Kostenvoranschlag).
 * Ohne Quelle wird ein Kostenpunkt nur als „Betrag unbekannt“ geführt.
 */
import type { Category } from "../domain/schemas";

export const COST_ITEMS = {
  inspection_service: "Inspektion / Wartung",
  tires: "Reifen",
  brakes: "Bremsen",
  registration: "Zulassung",
  transfer: "Überführung / Transport",
  hu_au: "Hauptuntersuchung (HU/AU)",
  insurance: "Versicherung (Jahresbeitrag)",
  vehicle_tax: "Kfz-Steuer (Jahresbetrag)",
  battery_replacement: "Akkutausch",
  screen_repair: "Displayreparatur",
  accessories: "Zubehör (Ladegerät, Hülle …)",
  controller: "Controller / Zubehör",
  console_repair: "Reparatur (Konsole)",
  watch_service: "Uhren-Revision",
  authentication: "Echtheitsprüfung / Authentifizierung",
  documents: "Fehlende Dokumentation beschaffen",
  repair_other: "Sonstige Reparatur",
  other: "Sonstiges",
} as const;
export type CostItemKey = keyof typeof COST_ITEMS;

export interface CostTableEntry {
  id: string;
  category: Category;
  item: CostItemKey;
  /** Optional: gilt nur für Marke/Modell (Teilstring, Groß-/Kleinschreibung egal) */
  brand?: string;
  model?: string;
  lowEur: number;
  highEur: number;
  /** Pflicht: woher stammt der Wert (z. B. „Werkstattpreise Region X, 3 Angebote“) */
  source: string;
  sourceUrl?: string;
  /** Datum der letzten Prüfung (ISO) */
  reviewedAt: string;
}

/** Nur gültige, vollständig belegte Einträge werden verwendet. */
export function validCostEntries(entries: CostTableEntry[] | undefined): CostTableEntry[] {
  return (entries ?? []).filter(
    (e) =>
      e &&
      e.item in COST_ITEMS &&
      Number.isFinite(e.lowEur) &&
      Number.isFinite(e.highEur) &&
      e.lowEur >= 0 &&
      e.highEur >= e.lowEur &&
      typeof e.source === "string" &&
      e.source.trim().length >= 3 &&
      !Number.isNaN(Date.parse(e.reviewedAt)),
  );
}

/** Spezifischster passender Eintrag (Modell > Marke > Kategorie). */
export function findCostEntry(
  entries: CostTableEntry[],
  category: Category,
  item: CostItemKey,
  brand?: string,
  model?: string,
): CostTableEntry | undefined {
  const b = brand?.toLowerCase() ?? "";
  const m = model?.toLowerCase() ?? "";
  const matches = entries.filter(
    (e) =>
      e.category === category &&
      e.item === item &&
      (!e.brand || b.includes(e.brand.toLowerCase())) &&
      (!e.model || m.includes(e.model.toLowerCase()) || b.includes(e.model.toLowerCase())),
  );
  return matches.sort((x, y) => Number(!!y.model) - Number(!!x.model) || Number(!!y.brand) - Number(!!x.brand))[0];
}

/**
 * Fiktive Werte NUR für die Demo-Berichte (deutlich gekennzeichnet).
 * Werden niemals für echte Analysen verwendet.
 */
export const DEMO_COST_TABLE: CostTableEntry[] = [
  { id: "demo-insp", category: "vehicle", item: "inspection_service", lowEur: 400, highEur: 650, source: "Demo-Richtwert (fiktiv)", reviewedAt: "2026-11-01" },
  { id: "demo-tires", category: "vehicle", item: "tires", lowEur: 500, highEur: 900, source: "Demo-Richtwert (fiktiv)", reviewedAt: "2026-11-01" },
  { id: "demo-reg", category: "vehicle", item: "registration", lowEur: 40, highEur: 90, source: "Demo-Richtwert (fiktiv)", reviewedAt: "2026-11-01" },
  { id: "demo-batt", category: "electronics", item: "battery_replacement", lowEur: 90, highEur: 130, source: "Demo-Richtwert (fiktiv)", reviewedAt: "2026-11-01" },
];
