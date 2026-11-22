import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { getActiveAI, providerEnabled } from "../config/providers";
import type { AnalysisRequestSchema } from "../api/schemas";
import { env } from "../config/env";
import type { AnalysisReport } from "../domain/schemas";
import { LicensedHttpMarketProvider, userComparables } from "../market/providers";
import { getStore } from "../store";
import type { AnalysisRecord } from "../store/types";
import { toDataUrl, deleteUpload } from "../uploads/service";
import { nowIso } from "../utils";
import { getPricing, withTokenReservation } from "../wallet/service";
import { runAnalysisPipeline } from "./analyze";

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
export async function startFullAnalysis(userId: string, req: z.infer<typeof AnalysisRequestSchema>): Promise<{ id: string; report?: AnalysisReport }> {
  const store = getStore();
  const id = analysisIdFor(userId, req.requestId);
  const existing = await store.getAnalysis(id, userId);
  if (existing) return { id };

  const imageIds = [...req.listing.images.map((i) => i.ref), ...(req.seller?.imageIds ?? [])];
  await assertOwnedUploads(imageIds, userId);

  const pricing = await getPricing();
  const balance = await store.getBalance(userId);
  if (balance < pricing.fullCheckCost) throw new AnalysisError("insufficient_balance", "Für den vollständigen Kaufcheck benötigst du einen Token.");

  const ai = await getActiveAI();
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
  };
  await store.createAnalysis(record);

  try {
    const report = await withTokenReservation(userId, id, pricing.fullCheckCost, async (reservationId) => {
      await store.updateAnalysis(id, { reservationId });
      const marketProviders = (await providerEnabled("market_licensed")) ? [new LicensedHttpMarketProvider({ url: env.market.apiUrl, apiKey: env.market.apiKey })] : [];
      const { report, meter } = await runAnalysisPipeline(
        {
          id,
          listing: req.listing,
          userComparables: userComparables(req.comparables),
          seller: req.seller
            ? { method: req.seller.method, imageRefs: req.seller.imageIds, pastedText: req.seller.pastedText, platformTotalClaimed: req.seller.platformTotalClaimed }
            : undefined,
        },
        { ai, loadImage: (ref) => toDataUrl(ref, [userId]), marketProviders },
      );
      const total = meter.total;
      await store.updateAnalysis(id, {
        status: "completed",
        completedAt: nowIso(),
        report,
        aiCostUsd: total.costUsd,
        aiInputTokens: total.inputTokens,
        aiOutputTokens: total.outputTokens,
      });
      return report;
    });

    // Datenschutz: Bewertungs-Screenshots/Frames nach der Analyse sofort löschen
    for (const ref of req.seller?.imageIds ?? []) {
      const u = await store.getUpload(ref);
      if (u) await deleteUpload(u);
    }
    return { id, report };
  } catch (e) {
    const raw = (e as { code?: string }).code;
    const code = raw === "insufficient_balance" || raw === "invalid_upload" ? raw : "pipeline_failed";
    await store.updateAnalysis(id, { status: "failed", errorCode: code, completedAt: nowIso() });
    if (code === "insufficient_balance") throw new AnalysisError("insufficient_balance", "Nicht genügend Tokens.");
    console.error("[analysis] failed", id, (e as Error).message);
    throw new AnalysisError("pipeline_failed", "Die Analyse ist fehlgeschlagen. Dein Token wurde nicht verbraucht.");
  }
}
