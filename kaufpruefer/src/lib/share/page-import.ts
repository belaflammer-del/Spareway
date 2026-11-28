import "server-only";
import { assertAiBudget } from "../ai/budget";
import { guard } from "../ai/guard";
import { UsageMeter } from "../ai/provider";
import { getActiveAI } from "../config/providers";
import type { Listing } from "../domain/schemas";
import { detectMissingInfo } from "../engine/missing-info";
import { aiExtractListing } from "../pipeline/ai-steps";
import { emptyListing, mergeListing } from "../pipeline/merge";
import { listingKeyFor } from "../pipeline/service";
import { getStore } from "../store";
import { storeImage } from "../uploads/service";
import { IMAGE_CDN_HOSTS, parsePageCapture, type PageCapture } from "./page-capture";
import { makeSafeFetch } from "./safe-fetch";

/**
 * Verarbeitet eine vom Nutzer übergebene Inseratsseite („→ DEAL-NIVO“-Button).
 * - Angaben werden regelbasiert aus den übergebenen Seitendaten gelesen.
 * - Fehlen wesentliche Angaben und ist KI aktiv, liest die KI den übergebenen
 *   Text (nicht die Website) – günstig, nur Text.
 * - Bilder: nur die Galerie-Bilder, die der Nutzer gerade sieht, nur von den
 *   Bild-Servern der unterstützten Plattformen, SSRF-geschützt, max. 8 Stück.
 */
export async function importPageCapture(userId: string, capture: PageCapture, opts: { fetchImpl?: typeof fetch; resolver?: (host: string) => Promise<string[]>; maxImages?: number } = {}) {
  const parsed = parsePageCapture(capture);
  let listing: Listing = mergeListing(emptyListing({ platform: parsed.listing.platform ?? "other", url: parsed.listing.url, externalId: parsed.listing.externalId }), parsed.listing, "page");
  listing.platform = parsed.listing.platform ?? "other";
  listing.provenance = { ...listing.provenance, platform: "page" };
  const notes = ["Angaben direkt von der geöffneten Inseratsseite übernommen.", ...parsed.notes];
  let aiCostUsd = 0;

  // KI nur ergänzend, wenn wichtige Angaben fehlen (z. B. unbekannte Seitenstruktur)
  const textForAi = [capture.title, capture.price, capture.details.map(([k, v]) => `${k}: ${v}`).join("\n"), capture.description, capture.text].filter(Boolean).join("\n").slice(0, 12000);
  if (parsed.fieldsFound < 4 && textForAi.length > 40) {
    const raw = await getActiveAI("fast");
    if (raw) {
      try {
        await assertAiBudget(raw, userId);
        const meter = new UsageMeter();
        const r = await aiExtractListing(guard(raw, { userId, scope: "extract" })!, meter, { images: [], pastedText: textForAi, hint: listing });
        listing = mergeListing(listing, { ...r.patch, category: listing.category !== "other" ? undefined : r.patch.category }, "ai_extraction");
        aiCostUsd = meter.total.costUsd;
        notes.push("Fehlende Angaben hat die KI aus dem Seitentext ergänzt – bitte kurz prüfen.");
      } catch {
        notes.push("Einige Angaben konnten nicht automatisch erkannt werden – bitte ergänzen.");
      }
    }
  }

  // Bilder übernehmen (Galerie der Seite)
  const safeFetch = makeSafeFetch({ allowHosts: IMAGE_CDN_HOSTS, maxRedirects: 2, timeoutMs: 8000, fetchImpl: opts.fetchImpl, resolver: opts.resolver });
  const uploadIds: string[] = [];
  let skipped = 0;
  for (const src of parsed.imageUrls.slice(0, opts.maxImages ?? 8)) {
    try {
      const res = await safeFetch(src);
      const type = res.headers.get("content-type") ?? "";
      const len = Number(res.headers.get("content-length") ?? 0);
      if (!res.ok || !/^image\//.test(type) || len > 10 * 1024 * 1024) {
        skipped++;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      uploadIds.push((await storeImage(userId, buf)).id);
    } catch {
      skipped++;
    }
  }
  listing.images = uploadIds.map((ref) => ({ ref, kind: "product_photo" as const }));
  if (uploadIds.length) notes.push(`${uploadIds.length} Bild${uploadIds.length > 1 ? "er" : ""} aus der Galerie übernommen.`);
  else if (parsed.imageUrls.length) notes.push("Die Bilder konnten nicht übernommen werden – lade bei Bedarf Fotos oder Screenshots hoch.");
  if (skipped && uploadIds.length) notes.push(`${skipped} Bild(er) übersprungen.`);

  const listingKey = listingKeyFor(listing);
  const prev = listingKey ? await getStore().findLatestByListingKey(userId, listingKey) : null;
  return {
    draft: { listing, missingInfo: detectMissingInfo(listing), notes, lowConfidence: [], conflicts: [] },
    existing: prev ? { id: prev.id, createdAt: prev.createdAt, title: prev.title } : undefined,
    aiCostUsd,
  };
}
