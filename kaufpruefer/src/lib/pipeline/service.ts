import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { categoryStatus, getActiveAI, providerEnabled } from "../config/providers";
import type { AnalysisRequestSchema } from "../api/schemas";
import { env } from "../config/env";
import type { AnalysisReport } from "../domain/schemas";
import { EbayMarketProvider } from "../market/ebay";
import { LicensedHttpMarketProvider, userComparables, type MarketDataProvider } from "../market/providers";
import { getStore } from "../store";
import type { AnalysisRecord } from "../store/types";
import { toDataUrl, deleteUpload } from "../uploads/service";
import { nowIso } from "../utils";
import { getPricing, withTokenReservation } from "../wallet/service";
import { applySellerToReport, runAnalysisPipeline, runSellerStep } from "./analyze";
import { UsageMeter } from "../ai/provider";
import { assertAiBudget, recordAiSpend } from "../ai/budget";

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
export function analysisFingerprint(req: z.infer<typeof AnalysisRequestSchema>): string {
  const { images: _i, provenance: _p, ...core } = req.listing;
  const norm = JSON.stringify({ core: Object.fromEntries(Object.entries(core).sort(([a], [b]) => a.localeCompare(b))), images: req.listing.images.length, comps: req.comparables, seller: !!req.seller });
  return createHash("sha256").update(norm).digest("hex").slice(0, 32);
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
  if ((await categoryStatus(req.listing.category)) !== "live")
    throw new AnalysisError("pipeline_failed", "Diese Kategorie ist noch in der Beta-Phase. Der kostenlose Schnellcheck ist verfügbar, der Komplettcheck folgt.");

  const imageIds = [...req.listing.images.map((i) => i.ref), ...(req.seller?.imageIds ?? [])];
  await assertOwnedUploads(imageIds, userId);

  const pricing = await getPricing();
  const balance = await store.getBalance(userId);
  if (balance < pricing.fullCheckCost) throw new AnalysisError("insufficient_balance", "Für den vollständigen Kaufcheck benötigst du einen Token.");

  const ai = await getActiveAI();
  await assertAiBudget(ai);
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
  };
  await store.createAnalysis(record);

  try {
    const report = await withTokenReservation(userId, id, pricing.fullCheckCost, async (reservationId) => {
      await store.updateAnalysis(id, { reservationId });
      const marketProviders: MarketDataProvider[] = [];
      if (await providerEnabled("market_licensed")) marketProviders.push(new LicensedHttpMarketProvider({ url: env.market.apiUrl, apiKey: env.market.apiKey }));
      if (await providerEnabled("ebay_api")) marketProviders.push(new EbayMarketProvider(env.ebay));
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
        durationMs: Date.now() - t0,
      });
      await recordAiSpend(total.costUsd);
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
    const code = raw === "insufficient_balance" || raw === "invalid_upload" || raw === "ai_budget" ? raw : "pipeline_failed";
    await store.updateAnalysis(id, { status: "failed", errorCode: code, completedAt: nowIso() });
    if (code === "insufficient_balance") throw new AnalysisError("insufficient_balance", "Nicht genügend Tokens.");
    if (code === "ai_budget") throw Object.assign(new Error((e as Error).message), { code });
    console.error("[analysis] failed", id, (e as Error).message);
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
  if (a.report.seller) throw new AnalysisError("pipeline_failed", "Für diese Analyse liegt bereits eine Verkäuferprüfung vor.");
  await assertOwnedUploads(input.imageIds, userId);
  const ai = await getActiveAI();
  await assertAiBudget(ai);
  const meter = new UsageMeter();
  const seller = await runSellerStep(
    { method: input.method, imageRefs: input.imageIds, pastedText: input.pastedText, platformTotalClaimed: input.platformTotalClaimed },
    { ai, loadImage: (ref) => toDataUrl(ref, [userId]) },
    meter,
  );
  if (seller.visibleReviewCount === 0) throw new AnalysisError("pipeline_failed", seller.coverageNote);
  const report = applySellerToReport(a.report, seller);
  const t = meter.total;
  await recordAiSpend(t.costUsd);
  await store.updateAnalysis(analysisId, {
    report,
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
