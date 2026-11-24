"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "../auth/session";
import { DEFAULT_CATEGORY_STATUS, PROVIDER_INFO, type ProviderKey } from "../config/providers";
import { DEMO_DEFINITIONS } from "../demo/definitions";
import { getStore } from "../store";
import type { FormState } from "../auth/actions";

const PricingForm = z.object({
  fullCheckCost: z.coerce.number().int().min(1).max(10),
  vehicleHistoryPriceCents: z.coerce.number().int().min(0).max(100000),
  packages: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,20}$/), label: z.string().min(1).max(40), tokens: z.coerce.number().int().min(1).max(500), priceCents: z.coerce.number().int().min(50).max(1_000_000) }))
    .min(1)
    .max(6),
});

export async function savePricingAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const packages = [0, 1, 2, 3, 4, 5]
    .map((i) => ({ id: fd.get(`p${i}_id`), label: fd.get(`p${i}_label`), tokens: fd.get(`p${i}_tokens`), priceCents: Math.round(Number(String(fd.get(`p${i}_price`) ?? "").replace(",", ".")) * 100) }))
    .filter((p) => p.id);
  const parsed = PricingForm.safeParse({ fullCheckCost: fd.get("fullCheckCost"), vehicleHistoryPriceCents: Math.round(Number(String(fd.get("vehicleHistoryPrice") ?? "0").replace(",", ".")) * 100), packages });
  if (!parsed.success) return { error: `Ungültige Eingabe: ${parsed.error.issues[0].path.join(".")} – ${parsed.error.issues[0].message}` };
  await getStore().setConfig({ pricing: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true, message: "Preise gespeichert. Neue Käufe verwenden die neuen Preise." };
}

export async function toggleDemoAction(fd: FormData) {
  await requireAdmin();
  const slug = String(fd.get("slug"));
  if (!DEMO_DEFINITIONS.some((d) => d.slug === slug)) return;
  const cfg = await getStore().getConfig();
  const vis = { ...(cfg.demoVisibility ?? {}) };
  vis[slug] = vis[slug] === false;
  await getStore().setConfig({ demoVisibility: vis });
  revalidatePath("/admin");
}

export async function toggleProviderAction(fd: FormData) {
  await requireAdmin();
  const key = String(fd.get("key")) as ProviderKey;
  if (!(key in PROVIDER_INFO)) return;
  const cfg = await getStore().getConfig();
  const p = { ...(cfg.providers ?? {}) };
  p[key] = p[key] === false;
  await getStore().setConfig({ providers: p });
  revalidatePath("/admin");
}

const ModelName = z.string().trim().max(80).regex(/^[a-zA-Z0-9._:-]*$/, "Ungültiger Modellname");
const AiForm = z.object({
  model: ModelName,
  fastModel: ModelName,
  dailyBudgetUsd: z.coerce.number().min(0).max(10000),
  perAnalysisUsd: z.coerce.number().min(0).max(100),
  perUserDayUsd: z.coerce.number().min(0).max(1000),
  globalMonthUsd: z.coerce.number().min(0).max(100000),
  maxCallsPerAnalysis: z.coerce.number().int().min(1).max(100),
  maxImagesPerUpload: z.coerce.number().int().min(1).max(30),
  videoMaxSeconds: z.coerce.number().int().min(10).max(300),
  videoMaxMb: z.coerce.number().int().min(5).max(500),
  chatQuestionsPerAnalysis: z.coerce.number().int().min(0).max(50),
});

export async function saveAiConfigAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const raw = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v.replace(",", ".") : v]));
  const parsed = AiForm.safeParse({ model: "", fastModel: "", ...raw });
  if (!parsed.success) return { error: `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}` };
  const d = parsed.data;
  const prev = (await getStore().getConfig()).limits ?? {};
  await getStore().setConfig({
    ai: { model: d.model || undefined, fastModel: d.fastModel || undefined, dailyBudgetUsd: d.dailyBudgetUsd },
    limits: {
      ...prev,
      perAnalysisUsd: d.perAnalysisUsd,
      perUserDayUsd: d.perUserDayUsd,
      globalMonthUsd: d.globalMonthUsd,
      maxCallsPerAnalysis: d.maxCallsPerAnalysis,
      maxImagesPerUpload: d.maxImagesPerUpload,
      videoMaxSeconds: d.videoMaxSeconds,
      videoMaxMb: d.videoMaxMb,
      chatQuestionsPerAnalysis: d.chatQuestionsPerAnalysis,
    },
  });
  revalidatePath("/admin");
  return { ok: true, message: "KI-Einstellungen gespeichert." };
}

export async function toggleCategoryAction(fd: FormData) {
  await requireAdmin();
  const key = String(fd.get("category"));
  const cfg = await getStore().getConfig();
  const current = cfg.categories?.[key] ?? DEFAULT_CATEGORY_STATUS[key] ?? "beta";
  const next = current === "live" ? "beta" : current === "beta" ? "off" : "live";
  await getStore().setConfig({ categories: { ...(cfg.categories ?? {}), [key]: next } });
  revalidatePath("/admin");
}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const AkteForm = z.object({
  chatChecksPerAnalysis: int(0, 20),
  chatScreenshotsMax: int(1, 30),
  inspectionPhotosMax: int(0, 100),
  inspectionPhotoAiMax: int(0, 50),
  imageMatchPerAnalysis: int(0, 50),
  watchesPerUser: int(0, 100),
  watchMinIntervalHours: int(1, 168),
  watchManualUpdatesPerDay: int(0, 50),
  notificationsPerUserDay: int(0, 200),
  chatDays: int(1, 365),
  inspectionDays: int(1, 730),
  imageHashDays: int(1, 730),
  snapshotDays: int(1, 730),
  costTable: z.string().max(50_000),
  guardianEnabled: z.enum(["on", "off"]).default("off"),
  guardianPrice: z.coerce.number().min(0).max(1000),
  guardianChatChecks: int(0, 20),
});

/** V4: Limits, Löschfristen, Kostentabelle und Guardian-Konzept (ohne Zahlungsaktivierung). */
export async function saveAkteConfigAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const raw = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === "string" && k !== "costTable" ? v.replace(",", ".") : v]));
  const parsed = AkteForm.safeParse({ guardianEnabled: fd.get("guardianEnabled") ? "on" : "off", ...raw });
  if (!parsed.success) return { error: `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}` };
  const d = parsed.data;
  let costTable: unknown = [];
  try {
    costTable = d.costTable.trim() ? JSON.parse(d.costTable) : [];
  } catch {
    return { error: "Kostentabelle: ungültiges JSON." };
  }
  const { validCostEntries } = await import("../costs/table");
  if (!Array.isArray(costTable)) return { error: "Kostentabelle muss eine Liste sein." };
  const valid = validCostEntries(costTable as never);
  if (valid.length !== costTable.length) return { error: `Kostentabelle: ${costTable.length - valid.length} Eintrag/Einträge ohne gültige Quelle, Datum oder Betrag. Es werden nur belegte Einträge gespeichert.` };
  const cfg = await getStore().getConfig();
  await getStore().setConfig({
    limits: {
      ...(cfg.limits ?? {}),
      chatChecksPerAnalysis: d.chatChecksPerAnalysis,
      chatScreenshotsMax: d.chatScreenshotsMax,
      inspectionPhotosMax: d.inspectionPhotosMax,
      inspectionPhotoAiMax: d.inspectionPhotoAiMax,
      imageMatchPerAnalysis: d.imageMatchPerAnalysis,
      watchesPerUser: d.watchesPerUser,
      watchMinIntervalHours: d.watchMinIntervalHours,
      watchManualUpdatesPerDay: d.watchManualUpdatesPerDay,
      notificationsPerUserDay: d.notificationsPerUserDay,
    },
    retention: { chatDays: d.chatDays, inspectionDays: d.inspectionDays, imageHashDays: d.imageHashDays, snapshotDays: d.snapshotDays },
    costTable: valid,
    // Guardian ist ein Produktkonzept: Die Anzeige lässt sich schalten, eine Zahlung wird NICHT aktiviert.
    guardian: { enabled: d.guardianEnabled === "on", priceCents: Math.round(d.guardianPrice * 100), chatChecks: d.guardianChatChecks },
  });
  revalidatePath("/admin");
  return { ok: true, message: "Kaufakte-Einstellungen gespeichert." };
}
