import "server-only";
import { akteLimits, daysFromNow } from "../akte/limits";
import type { ImageMatchData, MatchClass } from "../akte/schemas";
import { PLATFORM_LABELS } from "../domain/labels";
import { AnalysisError } from "../pipeline/service";
import { getStore } from "../store";
import type { ImageHashRecord } from "../store/akte-types";
import type { AnalysisRecord } from "../store/types";
import { loadOwnedUpload } from "../uploads/service";
import { newId, nowIso } from "../utils";
import { classifyMatch, fingerprint } from "./hash";

/**
 * Bildabgleich:
 * 1. innerhalb desselben Inserats (doppelte Fotos)
 * 2. mit Hashes bereits analysierter Inserate in DEAL-NIVO (nur Hashes, keine Bilder;
 *    Speicherfrist begrenzt)
 * 3. externe Bildsuche – nur über einen zugelassenen Dienst (derzeit keiner angebunden)
 * Es findet KEINE Indexierung fremder Plattformen statt.
 */

/** Schnittstelle für einen künftigen, vertraglich zugelassenen Bildsuchdienst. */
export interface ExternalImageSearchProvider {
  id: string;
  name: string;
  search(imageDataUrl: string): Promise<{ url: string; similarityPct: number; capturedAt: string }[]>;
}
export function getExternalImageSearch(): ExternalImageSearchProvider | null {
  return null; // Kein Anbieter angebunden – siehe Abschlussbericht
}

const RANK: Record<MatchClass, number> = { none: 0, possible: 1, strong: 2, identical: 3 };

/** Berechnet und speichert die Hashes der Produktfotos einer Analyse (keine KI, keine Kosten). */
export async function hashListingImages(a: AnalysisRecord): Promise<ImageHashRecord[]> {
  const store = getStore();
  const existing = await store.listImageHashes(a.id, a.userId);
  if (existing.length) return existing;
  const lim = akteLimits(await store.getConfig());
  const imgs = (a.report?.listing.images ?? []).filter((i) => i.kind === "product_photo" && i.ref.startsWith("up_")).slice(0, 12);
  const rows: ImageHashRecord[] = [];
  for (const [idx, img] of imgs.entries()) {
    try {
      const { data } = await loadOwnedUpload(img.ref, [a.userId]);
      const fp = await fingerprint(data);
      rows.push({
        id: `ih_${a.id.slice(3)}_${idx}`,
        analysisId: a.id,
        userId: a.userId,
        listingKey: a.listingKey,
        platform: a.platform,
        listingUrl: a.report?.listing.url,
        imageRef: String(idx),
        ...fp,
        capturedAt: nowIso(),
        expiresAt: daysFromNow(lim.retention.imageHashDays),
      });
    } catch {
      /* Bild abgelaufen oder nicht lesbar */
    }
  }
  await store.addImageHashes(rows);
  return rows;
}

export function transparencyText(scope: ImageMatchData["scope"]): string {
  if (scope.externalSearch) return `Geprüft innerhalb des Inserats, mit bereits in DEAL-NIVO analysierten Angeboten und über ${scope.externalProvider}.`;
  return "Es wurde nur innerhalb der verfügbaren Bilder geprüft (dieses Inserat und bereits in DEAL-NIVO analysierte Angebote). Eine umfassende Internetsuche fand nicht statt.";
}

export const MATCH_CAVEAT =
  "Ein gleiches Bild ist kein Betrugsnachweis: Hersteller- und Katalogbilder oder ein erneut eingestelltes Inserat desselben Verkäufers sind häufige, harmlose Gründe. Ähnlichkeitswerte können auch bei verschiedenen Objekten auftreten.";

export async function runImageMatch(userId: string, analysisId: string, opts: { force?: boolean } = {}) {
  const store = getStore();
  const a = await store.getAnalysis(analysisId, userId);
  if (!a?.report || a.status !== "completed") throw new AnalysisError("pipeline_failed", "Kaufakte nicht gefunden.");
  const lim = akteLimits(await store.getConfig());
  const previous = await store.listModules(analysisId, userId, "image_match");
  if (!opts.force && previous.length) return previous.at(-1)!;
  if (previous.length >= lim.imageMatchPerAnalysis) throw new AnalysisError("pipeline_failed", `Pro Kaufakte sind ${lim.imageMatchPerAnalysis} Bildabgleiche enthalten.`);

  const own = await hashListingImages(a);
  if (own.length === 0) throw new AnalysisError("pipeline_failed", "Für diese Kaufakte liegen keine Produktfotos (mehr) vor. Bilder werden nach Ablauf der Löschfrist entfernt.");

  const withinListing: ImageMatchData["withinListing"] = [];
  for (let i = 0; i < own.length; i++)
    for (let j = i + 1; j < own.length; j++) {
      const c = classifyMatch(own[i], own[j]);
      if (c.class === "identical" || c.class === "strong") withinListing.push({ a: Number(own[i].imageRef), b: Number(own[j].imageRef), class: c.class, distance: c.distance });
    }

  const matches: ImageMatchData["matches"] = [];
  for (const h of own) {
    const cands = await store.findImageHashCandidates(h.bands, 200);
    const best = new Map<string, ImageMatchData["matches"][number]>();
    for (const c of cands) {
      if (c.analysisId === a.id) continue;
      if (a.listingKey && c.listingKey === a.listingKey) continue; // dasselbe Inserat (frühere Prüfung)
      const m = classifyMatch(h, c);
      if (m.class === "none") continue;
      const key = c.listingKey ?? c.analysisId;
      const isOwn = c.userId === userId;
      const entry = {
        imageIndex: Number(h.imageRef),
        class: m.class,
        similarityPct: m.similarityPct,
        source: `${PLATFORM_LABELS[c.platform] ?? "Andere Plattform"}-Angebot, in DEAL-NIVO geprüft`,
        capturedAt: c.capturedAt,
        listingUrl: c.listingUrl,
        ownAnalysisId: isOwn ? c.analysisId : undefined,
        samePlatform: c.platform === a.platform,
      };
      const prev = best.get(key);
      if (!prev || RANK[entry.class] > RANK[prev.class] || entry.similarityPct > prev.similarityPct) best.set(key, entry);
    }
    matches.push(...best.values());
  }
  matches.sort((x, y) => RANK[y.class] - RANK[x.class] || y.similarityPct - x.similarityPct);

  const ext = getExternalImageSearch();
  const scope: ImageMatchData["scope"] = { withinListing: true, ownDatabase: true, externalSearch: !!ext, externalProvider: ext?.name };
  const top = matches[0]?.class ?? "none";
  const data: ImageMatchData = {
    checkedImages: own.length,
    scope,
    withinListing,
    matches: matches.slice(0, 10),
    summary: top,
    transparency: transparencyText(scope),
    caveat: MATCH_CAVEAT,
    checkedAt: nowIso(),
  };
  await store.countEvent("image_match");
  return store.addModule<ImageMatchData>({ id: newId("mod"), analysisId, userId, kind: "image_match", createdAt: nowIso(), data });
}
