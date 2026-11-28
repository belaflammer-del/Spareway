import "server-only";
import { providerEnabled } from "../config/providers";
import { emailConfig, pushConfig } from "../notify/service";
import { autoWatchPossible } from "../watch/service";
import { getStore } from "../store";
import { akteLimits } from "./limits";
import type { Akte } from "./service";
import type { NextStep } from "./service";
import type { ChatCheckData, CostAnalysisData, ImageMatchData, InspectionData, OutcomeData, SnapshotData } from "./schemas";
import type { Category, Platform, Recommendation } from "../domain/schemas";
import type { WatchRecord } from "../store/akte-types";

/** Serialisierbare Sicht auf die Kaufakte für die Oberfläche. */
export interface AkteViewModel {
  analysisId: string;
  category: Category;
  platform: Platform;
  title: string;
  baseRecommendation: Recommendation;
  recommendation: { current: Recommendation; source: string };
  nextStep: NextStep;
  chats: { id: string; version: number; createdAt: string; expiresAt?: string; data: ChatCheckData }[];
  inspection: { id: string; version: number; data: InspectionData } | null;
  costs: CostAnalysisData | null;
  imageMatch: ImageMatchData | null;
  snapshots: { version: number; data: SnapshotData }[];
  outcome: OutcomeData | null;
  askingEur: number | null;
  watch: Pick<WatchRecord, "mode" | "intervalHours" | "active" | "lastCheckedAt" | "nextCheckAt" | "lastError" | "notify" | "paidUntil" | "periodsPaid"> | null;
  watchPricing: { tokenCost: number; periodDays: number; balance: number };
  autoWatchPossible: boolean;
  channels: { email: boolean; push: boolean; pushPublicKey: string | null };
  hasPhotos: boolean;
  aiAvailable: boolean;
  activeJobs: { id: string; type: string; progress: number; message?: string }[];
}

export async function toViewModel(akte: Akte): Promise<AkteViewModel> {
  const a = akte.analysis;
  const r = a.report!;
  const push = pushConfig();
  return {
    analysisId: a.id,
    category: r.listing.category,
    platform: r.listing.platform,
    title: a.title,
    baseRecommendation: r.score.recommendation,
    recommendation: { current: akte.recommendation.current, source: akte.recommendation.source },
    nextStep: akte.nextStep,
    chats: akte.chats.map((c) => ({ id: c.id, version: c.version, createdAt: c.createdAt, expiresAt: c.expiresAt, data: c.data })),
    inspection: akte.inspection ? { id: akte.inspection.id, version: akte.inspection.version, data: akte.inspection.data } : null,
    costs: akte.costs?.data ?? null,
    imageMatch: akte.imageMatch?.data ?? null,
    snapshots: akte.snapshots.map((s) => ({ version: s.version, data: s.data })),
    outcome: akte.outcome?.data ?? null,
    askingEur: r.listing.priceEur || null,
    watch: akte.watch
      ? { mode: akte.watch.mode, intervalHours: akte.watch.intervalHours, active: akte.watch.active, lastCheckedAt: akte.watch.lastCheckedAt, nextCheckAt: akte.watch.nextCheckAt, lastError: akte.watch.lastError, notify: akte.watch.notify, paidUntil: akte.watch.paidUntil, periodsPaid: akte.watch.periodsPaid }
      : null,
    watchPricing: await (async () => {
      const lim = akteLimits(await getStore().getConfig());
      return { tokenCost: lim.watchTokenCost, periodDays: lim.watchPeriodDays, balance: await getStore().getBalance(a.userId) };
    })(),
    autoWatchPossible: await autoWatchPossible(a),
    channels: { email: !!emailConfig(), push: !!push, pushPublicKey: push?.publicKey ?? null },
    hasPhotos: r.listing.images.some((i) => i.kind === "product_photo"),
    aiAvailable: await providerEnabled("ai"),
    activeJobs: akte.activeJobs.map((j) => ({ id: j.id, type: j.type, progress: j.progress, message: j.message })),
  };
}
