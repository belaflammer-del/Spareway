import "server-only";
import { createHash } from "node:crypto";
import type { ChatCheckData, CostAnalysisData, InspectionData, UserCostInput } from "../akte/schemas";
import { AnalysisError } from "../pipeline/service";
import { getStore } from "../store";
import type { ModuleRecord } from "../store/akte-types";
import { newId, nowIso } from "../utils";
import { computeCosts } from "./analyze";
import { DEMO_COST_TABLE, validCostEntries } from "./table";

/**
 * Gesamtkosten berechnen und als neue Modulversion speichern – nur wenn sich
 * Eingaben (Nutzerkosten, Besichtigung, Chat, Kostentabelle) geändert haben.
 * Keine KI, keine Kosten.
 */
export async function computeAndStoreCosts(userId: string, analysisId: string, userInputs?: UserCostInput[]) {
  const store = getStore();
  const a = await store.getAnalysis(analysisId, userId);
  if (!a?.report || a.status !== "completed") throw new AnalysisError("pipeline_failed", "Kaufakte nicht gefunden.");
  const [cfg, costMods, insp, chats] = await Promise.all([
    store.getConfig(),
    store.listModules(analysisId, userId, "costs") as Promise<ModuleRecord<CostAnalysisData>[]>,
    store.listModules(analysisId, userId, "inspection") as Promise<ModuleRecord<InspectionData>[]>,
    store.listModules(analysisId, userId, "chat_check") as Promise<ModuleRecord<ChatCheckData>[]>,
  ]);
  const inputs = (userInputs ?? costMods.at(-1)?.data.userInputs ?? []).slice(0, 30);
  const table = validCostEntries(cfg.costTable);
  const inspection = insp.at(-1)?.data;
  const chatData = chats.map((c) => c.data);
  const inputHash = createHash("sha256")
    .update(JSON.stringify({ inputs, table, insp: inspection?.items.map((i) => [i.id, i.status]), chats: chats.map((c) => c.id), price: a.report.listing.priceEur }))
    .digest("hex")
    .slice(0, 32);
  const last = costMods.at(-1);
  if (last?.inputHash === inputHash) return last;
  const data = computeCosts(a.report, { table, userInputs: inputs, inspection, chats: chatData, now: nowIso() });
  await store.countEvent("costs_computed");
  return store.addModule<CostAnalysisData>({ id: newId("mod"), analysisId, userId, kind: "costs", createdAt: nowIso(), inputHash, data });
}

/** Für Demo-Berichte: ausschließlich fiktive, gekennzeichnete Demo-Richtwerte. */
export function demoCosts(report: Parameters<typeof computeCosts>[0]) {
  return computeCosts(report, { table: DEMO_COST_TABLE, now: nowIso(), usesDemoTable: true });
}
