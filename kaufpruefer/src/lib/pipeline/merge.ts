import { LISTING_FIELDS, type FieldSource, type Listing } from "../domain/schemas";

const PRIORITY: Record<FieldSource, number> = { user: 5, platform_api: 4, page: 4, ai_extraction: 3, url: 2, demo: 1 };

/**
 * Führt Angaben aus mehreren Quellen zusammen. Höher priorisierte Quellen
 * gewinnen; die Herkunft jedes Felds wird in `provenance` vermerkt.
 */
export function mergeListing(base: Listing, patch: Partial<Listing>, source: FieldSource): Listing {
  const out: Listing = { ...base, provenance: { ...base.provenance } };
  for (const key of [...LISTING_FIELDS, "category"] as const) {
    const v = (patch as Record<string, unknown>)[key];
    if (v == null || v === "") continue;
    const existing = out.provenance[key] as FieldSource | undefined;
    if (existing && PRIORITY[existing] > PRIORITY[source]) continue;
    (out as Record<string, unknown>)[key] = v;
    out.provenance[key] = source;
  }
  if (patch.images?.length) out.images = [...out.images, ...patch.images.filter((i) => !out.images.some((x) => x.ref === i.ref))];
  return out;
}

export function emptyListing(partial: Partial<Listing> = {}): Listing {
  return { platform: "unknown", category: "other", images: [], provenance: {}, ...partial };
}
