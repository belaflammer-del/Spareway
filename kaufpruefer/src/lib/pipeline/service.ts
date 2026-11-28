import "server-only";
import { safeErr } from "../ai/errors";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { parseListingUrl } from "../import/adapters";
import { cleanUrl } from "../import/share-text";
import type { z } from "zod";
import { categoryStatus, getActiveAI, providerEnabled } from "../config/providers";
import type { AnalysisRequestSchema } from "../api/schemas";
import { env } from "../config/env";
import type { AnalysisReport } from "../domain/schemas";
import { EbayMarketProvider, EbaySoldPricesProvider } from "../market/ebay";
import { LicensedHttpMarketProvider, userComparables, type MarketDataProvider } from "../market/providers";
import { getStore } from "../store";
import type { AnalysisRecord } from "../store/types";
import { deleteUpload, loadOwnedUpload, toDataUrl } from "../uploads/service";
import { nowIso } from "../utils";
import { getPricing, withTokenReservation } from "../wallet/service";
import { applySellerToReport, runAnalysisPipeline, runSellerStep } from "./analyze";
import { UsageMeter } from "../ai/provider";
import { assertAiBudget } from "../ai/budget";
import { guard } from "../ai/guard";

export class AnalysisError extends Error {
  constructor(public code: "insufficient_balance" | "invalid_upload" | "pipeline_failed", message: string) {
    super(message);
  }
}

/** Prüft, dass alle referenzierten Uploads dem Nutzer gehören. */
export async function assertOwnedUploads(ids: string[], userId: string) {
  const store = getStore();
  for (const id of ids) {
    const u = await store.getUpload(id);
    if (!u || u.ownerKey !== userId) throw new AnalysisError("invalid_upload", "Eine hochgeladene Datei ist nicht mehr verfügbar. Bitte lade sie erneut hoch.");
  }
}

export function analysisIdFor(userId: string, requestId: string) {
  return `an_${createHash("sha256").update(`${userId}:${requestId}`).digest("hex").slice(0, 20)}`;
}

/**
 * Startet eine vollständige, kostenpflichtige Analyse.
 * Idempotent über requestId: Doppelte Absendungen führen nicht zu doppelter Abbuchung.
 */
/** Fingerabdruck der fachlich relevanten Eingaben (ohne Upload-IDs, die sich bei jedem Upload ändern). */
/** Version der Analyse-Logik – ändert sie sich, werden alte Ergebnisse nicht wiederverwendet. */
export const ANALYSIS_VERSION = 3;

export function analysisFingerprint(req: z.infer<typeof AnalysisRequestSchema>): string {
  const { images: _i, provenance: _p, ...core } = req.listing;
  const norm = JSON.stringify({
    v: ANALYSIS_VERSION,
    core: Object.fromEntries(Object.entries(core).sort(([a], [b]) => a.localeCompare(b))),
    images: req.listing.images.length,
    comps: req.comparables,
    seller: !!req.seller,
  });
  return createHash("sha256").update(norm).digest("hex").slice(0, 32);
}

/**
 * Normalisierte Inseratskennung: Plattform + Inserats-ID, sonst bereinigte URL.
 * Zwei verschiedene Inserate desselben Modells haben nie denselben Schlüssel.
 */
export function listingKeyFor(l: { platform: string; externalId?: string; url?: string }): string | undefined {
  if (l.externalId) return `${l.platform}:${l.externalId}`;
  if (l.url) {
    const u = parseListingUrl(cleanUrl(l.url));
    if (u) return `${l.platform}:${u.hostname.replace(/^(www|m)\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`;
  }
  return undefined;
}

/** Kleines Vorschaubild für die Historie (ohne Metadaten). */
async function makeThumbnail(ref: string | undefined, userId: string): Promise<string | undefined> {
  if (!ref) return undefined;
  try {
    const { data } = await loadOwnedUpload(ref, [userId]);
    const buf = await sharp(data).resize(160, 160, { fit: "cover" }).webp({ quality: 60 }).toBuffer();
    return `data:image/webp;base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

const REUSE_DAYS = 7;

export async function startFullAnalysis(userId: string, req: z.infer<typeof AnalysisRequestSchema>): Promise<{ id: string; report?: AnalysisReport; reused?: boolean }> {
  const store = getStore();
  const id = analysisIdFor(userId, req.requestId);
  const existing = await store.getAnalysis(id, userId);
  if (existing) return { id };

  // Identische, noch aktuelle Analyse? Dann kein weiterer Token (nur ohne neue Bilder sinnvoll vergleichbar)
  const fingerprint = analysisFingerprint(req);
  if (req.listing.images.length === 0 && !req.seller?.imageIds.length) {
    const prev = await store.findAnalysisByFingerprint(userId, fingerprint, new Date(Date.now() - REUSE_DAYS * 864e5).toISOString());
    if (prev) {
      await store.countEvent("reused_analysis");
      return { id: prev.id, reused: true };
    }
  }
  // Versionierung: frühere Prüfung desselben Inserats (z. B. vor einer Preisänderung)
  const listingKey = listingKeyFor(req.listing);
  const previous = listingKey ? await store.findLatestByListingKey(userId, listingKey) : null;
  const catStatus = await categoryStatus(req.listing.category);
  if (catStatus === "off") throw new AnalysisError("pipeline_failed", "Diese Produktkategorie ist derzeit nicht verfügbar.");
  if (catStatus === "beta" && !req.acceptBeta)
    throw new AnalysisError("pipeline_failed", "Diese Produktkategorie befindet sich noch in der Entwicklung. Bitte bestätige die Einschränkungen vor dem Start.");

  const imageIds = [...req.listing.images.map((i) => i.ref), ...(req.seller?.imageIds ?? [])];
  await assertOwnedUploads(imageIds, userId);

  const pricing = await getPricing();
  const balance = await store.getBalance(userId);
  if (balance < pricing.fullCheckCost) throw new AnalysisError("insufficient_balance", "Für den vollständigen Kaufcheck benötigst du einen Token.");

  const rawAi = await getActiveAI("main");
  await assertAiBudget(rawAi, userId);
  const ai = guard(rawAi, { userId, scope: "analysis" });
  const aiFast = guard(await getActiveAI("fast"), { userId, scope: "analysis" });
  const t0 = Date.now();
  const record: AnalysisRecord = {
    id,
    userId,
    status: "running",
    tier: "full",
    category: req.listing.category,
    platform: req.listing.platform,
    title: (req.listing.title ?? [req.listing.brand, req.listing.model].filter(Boolean).join(" ")).slice(0, 200) || "Angebot",
    createdAt: nowIso(),
    aiCostUsd: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    mode: ai ? "live_ai" : "rules_only",
    fingerprint,
    aiModel: ai?.model,
    analysisVersion: ANALYSIS_VERSION,
    listingKey,
    previousId: previous?.id,
    priceEur: req.listing.priceEur,
  };
  await store.createAnalysis(record);

  try {
    const report = await withTokenReservation(userId, id, pricing.fullCheckCost, async (reservationId) => {
      await store.updateAnalysis(id, { reservationId });
      const marketProviders: MarketDataProvider[] = [];
      if (await providerEnabled("market_licensed")) marketProviders.push(new LicensedHttpMarketProvider({ url: env.market.apiUrl, apiKey: env.market.apiKey }));
      if (await providerEnabled("ebay_api")) marketProviders.push(new EbayMarketProvider(env.ebay), new EbaySoldPricesProvider(env.ebay));
      const { report, meter } = await runAnalysisPipeline(
        {
          id,
          listing: req.listing,
          userComparables: userComparables(req.comparables),
          seller: req.seller
            ? { method: req.seller.method, imageRefs: req.seller.imageIds, pastedText: req.seller.pastedText, platformTotalClaimed: req.seller.platformTotalClaimed }
            : undefined,
        },
        { ai, aiFast, loadImage: (ref) => toDataUrl(ref, [userId]), marketProviders },
      );
      const total = meter.total;
      await store.updateAnalysis(id, {
        status: "completed",
        completedAt: nowIso(),
        report,
        aiCostUsd: total.costUsd,
        aiInputTokens: total.inputTokens,
        aiOutputTokens: total.outputTokens,
        durationMs: Date.now() - t0,
        recommendation: report.score.recommendation,
        priceRating: report.market.rating,
        thumbnail: await makeThumbnail(req.listing.images.find((i) => i.kind === "product_photo")?.ref ?? req.listing.images[0]?.ref, userId),
      });
      return report;
    });

    // V4: Bildabgleich (nur Hashes, keine KI, keine Kosten) – Fehler blockieren die Analyse nicht
    if (req.listing.images.some((i) => i.kind === "product_photo")) {
      try {
        const { runImageMatch } = await import("../images/match");
        await runImageMatch(userId, id);
      } catch (e) {
        console.warn("[analysis] Bildabgleich übersprungen:", safeErr(e));
      }
    }
    // Datenschutz: Bewertungs-Screenshots/Frames nach der Analyse sofort löschen
    for (const ref of req.seller?.imageIds ?? []) {
      const u = await store.getUpload(ref);
      if (u) await deleteUpload(u);
    }
    return { id, report };
  } catch (e) {
    const raw = (e as { code?: string }).code;
    const code = raw === "insufficient_balance" || raw === "invalid_upload" || raw === "ai_budget" ? raw : "pipeline_failed";
    if (code === "ai_budget") await store.countEvent("ai_limit_hit").catch(() => undefined);
    await store.updateAnalysis(id, { status: "failed", errorCode: code, completedAt: nowIso() });
    if (code === "insufficient_balance") throw new AnalysisError("insufficient_balance", "Nicht genügend Tokens.");
    if (code === "ai_budget") throw Object.assign(new Error(safeErr(e)), { code });
    console.error("[analysis] failed", id, safeErr(e));
    throw new AnalysisError("pipeline_failed", "Die Analyse ist fehlgeschlagen. Dein Token wurde nicht verbraucht.");
  }
}

/**
 * Verkäuferprüfung zu einer bereits bezahlten Analyse hinzufügen.
 * Kostet keinen weiteren Token.
 */
export async function addSellerToAnalysis(
  userId: string,
  analysisId: string,
  input: { method: "screenshots" | "screen_recording" | "pasted_text"; imageIds: string[]; pastedText?: string; platformTotalClaimed?: number },
) {
  const store = getStore();
  const a = await store.getAnalysis(analysisId, userId);
  if (!a?.report || a.status !== "completed") throw new AnalysisError("pipeline_failed", "Analyse nicht gefunden.");
  await assertOwnedUploads(input.imageIds, userId);
  const ai = await getActiveAI("fast");
  await assertAiBudget(ai, userId);
  const meter = new UsageMeter();
  const { seller, submitted } = await runSellerStep(
    { method: input.method, imageRefs: input.imageIds, pastedText: input.pastedText, platformTotalClaimed: input.platformTotalClaimed },
    { ai: guard(ai, { userId, scope: "seller" }), loadImage: (ref) => toDataUrl(ref, [userId]) },
    meter,
    a.report.seller,
  );
  if (submitted === 0) throw new AnalysisError("pipeline_failed", "Es konnten keine Bewertungen erkannt werden. Bitte lade besser lesbare Screenshots hoch oder scrolle in der Aufnahme langsamer.");
  const report = applySellerToReport(a.report, seller, new Date(), { method: input.method, submitted });
  const t = meter.total;
  await store.updateAnalysis(analysisId, {
    report,
    recommendation: report.score.recommendation,
    aiCostUsd: a.aiCostUsd + t.costUsd,
    aiInputTokens: a.aiInputTokens + t.inputTokens,
    aiOutputTokens: a.aiOutputTokens + t.outputTokens,
  });
  await store.countEvent("seller_addon");
  for (const ref of input.imageIds) {
    const u = await store.getUpload(ref);
    if (u) await deleteUpload(u);
  }
  return report;
}
