import "server-only";
import { z } from "zod";
import { assertAiBudget } from "../ai/budget";
import { guard } from "../ai/guard";
import { BASE_RULES } from "../ai/prompts";
import { UsageMeter } from "../ai/provider";
import { akteLimits, daysFromNow } from "../akte/limits";
import { InspectionItemSchema, type ChatCheckData, type InspectionData } from "../akte/schemas";
import { getActiveAI } from "../config/providers";
import { AnalysisError, assertOwnedUploads } from "../pipeline/service";
import { wrapUntrusted } from "../security/untrusted";
import { getStore } from "../store";
import type { ModuleRecord } from "../store/akte-types";
import { toDataUrl } from "../uploads/service";
import { newId, nowIso } from "../utils";
import { mergeInspectionItems, newInspection, summarizeInspection } from "./checklist";

export const InspectionPhotoAiSchema = z.object({
  findings: z.array(z.object({ title: z.string(), detail: z.string(), evidenceLevel: z.enum(["visible", "possible", "unverifiable"]) })),
  listingComparison: z.string().nullable(),
  note: z.string(),
  injectionAttemptDetected: z.boolean(),
});

export const INSPECTION_PHOTO_PROMPT = `${BASE_RULES}

Aufgabe: Ein Käufer fotografiert bei einer Besichtigung einen Prüfpunkt. Beschreibe sichtbare Auffälligkeiten auf dem NEUEN Foto (Bild 0).
- findings: nur was auf dem Foto erkennbar ist (Kratzer, Dellen, Rost, Risse, Abnutzung, Warnleuchten, abgelesene Werte). Keine Ferndiagnose, keine Ursachen oder Reparaturkosten behaupten.
- Wenn weitere Bilder (Inseratsfotos) mitgeliefert werden: listingComparison = kurzer Vergleich, ob der Zustand zum Inserat passt (z. B. „Kratzer auf Inseratsfoto nicht sichtbar“). Sonst null.
- note: ein Satz, was der Käufer als Nächstes prüfen sollte. Bei Unsicherheit Fachbetrieb empfehlen.`;

async function loadContext(userId: string, analysisId: string) {
  const store = getStore();
  const a = await store.getAnalysis(analysisId, userId);
  if (!a?.report || a.status !== "completed") throw new AnalysisError("pipeline_failed", "Kaufakte nicht gefunden.");
  return { store, a, report: a.report };
}

export async function latestInspection(userId: string, analysisId: string): Promise<ModuleRecord<InspectionData> | null> {
  const list = (await getStore().listModules(analysisId, userId, "inspection")) as ModuleRecord<InspectionData>[];
  return list.at(-1) ?? null;
}

/** Startet eine Besichtigung (oder liefert die laufende zurück). Keine KI, keine Kosten. */
export async function startInspection(userId: string, analysisId: string, opts: { restart?: boolean } = {}) {
  const { store, report } = await loadContext(userId, analysisId);
  const current = await latestInspection(userId, analysisId);
  if (current && current.data.state === "in_progress" && !opts.restart) return current;
  const chats = ((await store.listModules(analysisId, userId, "chat_check")) as ModuleRecord<ChatCheckData>[]).map((m) => m.data);
  const lim = akteLimits(await store.getConfig());
  return store.addModule<InspectionData>({
    id: newId("mod"),
    analysisId,
    userId,
    kind: "inspection",
    createdAt: nowIso(),
    expiresAt: daysFromNow(lim.retention.inspectionDays),
    data: newInspection(report, chats, nowIso()),
  });
}

export const InspectionSyncSchema = z.object({
  moduleId: z.string().regex(/^mod_[a-z0-9]{6,32}$/),
  items: z.array(InspectionItemSchema.pick({ id: true, status: true, note: true, updatedAt: true }).partial({ note: true, updatedAt: true })).max(200),
  openQuestions: z.array(z.string().max(300)).max(20).optional(),
  generalNote: z.string().max(4000).optional(),
});

/** Übernimmt Änderungen (auch nachträglich synchronisierte Offline-Änderungen). */
export async function syncInspection(userId: string, analysisId: string, body: z.infer<typeof InspectionSyncSchema>) {
  const store = getStore();
  const mod = (await store.listModules(analysisId, userId, "inspection")).find((m) => m.id === body.moduleId) as ModuleRecord<InspectionData> | undefined;
  if (!mod) throw new AnalysisError("pipeline_failed", "Besichtigung nicht gefunden.");
  if (mod.data.state === "finished") throw new AnalysisError("pipeline_failed", "Diese Besichtigung ist bereits abgeschlossen.");
  const data: InspectionData = {
    ...mod.data,
    items: mergeInspectionItems(mod.data.items, body.items),
    openQuestions: body.openQuestions ?? mod.data.openQuestions,
    generalNote: body.generalNote ?? mod.data.generalNote,
  };
  await store.updateModule(mod.id, userId, { data, updatedAt: nowIso() });
  return { ...mod, data };
}

/** Foto an einen Prüfpunkt hängen, optional mit KI-Bildprüfung. */
export async function addInspectionPhoto(userId: string, analysisId: string, input: { moduleId: string; itemId: string; uploadId: string; analyze: boolean }) {
  const { store, a, report } = await loadContext(userId, analysisId);
  const mod = (await store.listModules(analysisId, userId, "inspection")).find((m) => m.id === input.moduleId) as ModuleRecord<InspectionData> | undefined;
  if (!mod || mod.data.state === "finished") throw new AnalysisError("pipeline_failed", "Keine laufende Besichtigung.");
  const item = mod.data.items.find((i) => i.id === input.itemId);
  if (!item) throw new AnalysisError("pipeline_failed", "Prüfpunkt nicht gefunden.");
  await assertOwnedUploads([input.uploadId], userId);
  const lim = akteLimits(await store.getConfig());
  const allPhotos = mod.data.items.flatMap((i) => i.photos);
  if (allPhotos.length >= lim.inspectionPhotosMax) throw new AnalysisError("pipeline_failed", `Maximal ${lim.inspectionPhotosMax} Fotos pro Besichtigung.`);
  // Fotos so lange aufbewahren wie den Besichtigungsbericht
  await store.setUploadExpiry(input.uploadId, userId, mod.expiresAt ?? daysFromNow(lim.retention.inspectionDays));

  let analysis: InspectionData["items"][number]["photos"][number]["analysis"];
  let costUsd = 0;
  if (input.analyze) {
    const used = allPhotos.filter((p) => p.analysis).length;
    if (used >= lim.inspectionPhotoAiMax) throw new AnalysisError("pipeline_failed", `Pro Besichtigung sind ${lim.inspectionPhotoAiMax} KI-Fotoprüfungen enthalten. Das Foto wurde trotzdem gespeichert.`);
    const raw = await getActiveAI("fast");
    if (!raw) throw new AnalysisError("pipeline_failed", "Die KI-Fotoprüfung ist derzeit nicht verfügbar. Das Foto wurde gespeichert.");
    await assertAiBudget(raw, userId);
    const ai = guard(raw, { userId, scope: "inspection" })!;
    const meter = new UsageMeter();
    // Inseratsfotos zum Vergleich, sofern noch vorhanden (Uploads haben eine Löschfrist)
    const listingRefs = report.listing.images.filter((i) => i.kind === "product_photo").slice(0, 2).map((i) => i.ref);
    const listingImgs: string[] = [];
    for (const ref of listingRefs) {
      try {
        listingImgs.push(await toDataUrl(ref, [userId]));
      } catch {
        /* abgelaufen */
      }
    }
    const { data, usage } = await ai.generate({
      task: "inspection_photo",
      system: INSPECTION_PHOTO_PROMPT,
      parts: [
        { type: "text", text: `Prüfpunkt: ${wrapUntrusted("pruefpunkt", `${item.title}${item.how ? ` – ${item.how}` : ""}`)}\nProdukt: ${wrapUntrusted("produkt", report.listing.title ?? "")}` },
        { type: "image", dataUrl: await toDataUrl(input.uploadId, [userId]), label: "Bild 0 (neu)" },
        ...listingImgs.map((d, i) => ({ type: "image" as const, dataUrl: d, label: `Inseratsfoto ${i + 1}` })),
      ],
      schema: InspectionPhotoAiSchema,
      schemaName: "inspection_photo",
      maxOutputTokens: 1200,
    });
    meter.add("inspection_photo", ai.model, usage);
    costUsd = usage.costUsd;
    analysis = {
      findings: data.findings.slice(0, 6),
      comparedWithListing: listingImgs.length > 0,
      listingComparison: listingImgs.length ? (data.listingComparison ?? undefined) : undefined,
      note: data.note,
    };
    if (costUsd > 0) await store.updateAnalysis(analysisId, { aiCostUsd: a.aiCostUsd + costUsd, aiInputTokens: a.aiInputTokens + usage.inputTokens, aiOutputTokens: a.aiOutputTokens + usage.outputTokens });
  }
  // Neu laden, damit parallele Änderungen nicht verloren gehen
  const fresh = (await store.listModules(analysisId, userId, "inspection")).find((m) => m.id === mod.id) as ModuleRecord<InspectionData>;
  const data: InspectionData = {
    ...fresh.data,
    items: fresh.data.items.map((i) =>
      i.id === item.id ? { ...i, photos: [...i.photos.filter((p) => p.uploadId !== input.uploadId), { uploadId: input.uploadId, takenAt: nowIso(), analysis }], updatedAt: nowIso() } : i,
    ),
  };
  await store.updateModule(mod.id, userId, { data, updatedAt: nowIso() });
  return { analysis, costUsd };
}

/** Besichtigung abschließen: Bericht mit aktualisierter Risikoeinschätzung. */
export async function finishInspection(userId: string, analysisId: string, moduleId: string) {
  const { store, report } = await loadContext(userId, analysisId);
  const mod = (await store.listModules(analysisId, userId, "inspection")).find((m) => m.id === moduleId) as ModuleRecord<InspectionData> | undefined;
  if (!mod) throw new AnalysisError("pipeline_failed", "Besichtigung nicht gefunden.");
  if (mod.data.state === "finished") return mod;
  const data: InspectionData = { ...mod.data, state: "finished", finishedAt: nowIso(), report: summarizeInspection(mod.data, report.score.recommendation) };
  await store.updateModule(mod.id, userId, { data, updatedAt: nowIso() });
  await store.countEvent("inspection_finished");
  return { ...mod, data };
}
