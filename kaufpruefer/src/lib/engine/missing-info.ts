import { CATEGORY_PROFILES } from "../domain/category-profiles";
import { FIELD_LABELS } from "../domain/labels";
import type { Listing, MissingInfo } from "../domain/schemas";

export function hasValue(listing: Listing, field: string): boolean {
  const v = (listing as Record<string, unknown>)[field];
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

/** Ermittelt fehlende, für die Kategorie relevante Angaben und formuliert gezielte Nachfragen. */
export function detectMissingInfo(listing: Listing): MissingInfo[] {
  const profile = CATEGORY_PROFILES[listing.category];
  const order = { critical: 0, important: 1, helpful: 2 } as const;
  return profile.fields
    .filter((f) => !hasValue(listing, f.field))
    .map((f) => ({
      field: f.field,
      label: FIELD_LABELS[f.field],
      question: f.question,
      importance: f.importance,
    }))
    .sort((a, b) => order[a.importance] - order[b.importance]);
}
