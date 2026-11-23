/**
 * Deterministische Zusammenführung von Einzelbeobachtungen aus mehreren
 * Screenshots. Widersprüchliche Werte werden NIE automatisch entschieden,
 * sondern als Konflikt an den Nutzer zurückgegeben.
 */
import { NUMERIC_FIELDS } from "../domain/labels";
import type { ListingFieldKey } from "../domain/schemas";

export interface Observation {
  field: string;
  value: string;
  /** Upload-ID des Screenshots bzw. "text" für eingefügten Text */
  source: string;
  confidence: "high" | "medium" | "low";
}

export interface FieldConflict {
  field: string;
  values: string[];
  images: string[];
}

/** Deutsche Zahlenschreibweise tolerant parsen („125.000 km“, „19.900 €“, „1,5“). */
export function parseGermanNumber(s: string): number | undefined {
  const t = s.replace(/[^\d.,-]/g, "");
  if (!t) return undefined;
  const normalized = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function normText(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Felder, für die Widersprüche relevant sind. */
export const CONFLICT_FIELDS: ListingFieldKey[] = [
  "priceEur", "mileageKm", "year", "firstRegistration", "model", "variant", "storageGb", "batteryHealthPct", "condition", "powerKw", "engine", "fuel", "transmission", "previousOwners",
];

export function mergeObservations(obs: Observation[]): { values: Record<string, string | number>; conflicts: FieldConflict[] } {
  const byField = new Map<string, Observation[]>();
  for (const o of obs) {
    if (!o.value?.trim() || !CONFLICT_FIELDS.includes(o.field as ListingFieldKey)) continue;
    byField.set(o.field, [...(byField.get(o.field) ?? []), o]);
  }
  const values: Record<string, string | number> = {};
  const conflicts: FieldConflict[] = [];
  for (const [field, list] of byField) {
    const numeric = NUMERIC_FIELDS.includes(field as ListingFieldKey);
    // Gruppen gleicher Werte bilden
    const groups: { key: string; display: string; parsed: string | number; sources: string[] }[] = [];
    for (const o of list) {
      const parsed = numeric ? parseGermanNumber(o.value) : o.value.trim();
      if (parsed === undefined) continue;
      const key = numeric ? String(parsed) : normText(String(parsed));
      // Freitext: „320d“ vs. „320d Touring“ ist kein Widerspruch (Teilmenge)
      const g = groups.find((x) => x.key === key || (!numeric && (x.key.includes(key) || key.includes(x.key))));
      if (g) {
        g.sources.push(o.source);
        if (!numeric && String(parsed).length > String(g.parsed).length) {
          g.parsed = parsed;
          g.display = o.value.trim();
          g.key = key;
        }
      } else groups.push({ key, display: o.value.trim(), parsed, sources: [o.source] });
    }
    if (groups.length === 1) values[field] = groups[0].parsed;
    else if (groups.length > 1)
      conflicts.push({ field, values: groups.map((g) => g.display).slice(0, 4), images: [...new Set(groups.flatMap((g) => g.sources))].filter((s) => s !== "text") });
  }
  return { values, conflicts };
}
