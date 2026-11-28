import "server-only";
import { getStore } from "../store";
import type { ModuleRecord } from "../store/akte-types";
import { newId, nowIso } from "../utils";
import type { OutcomeData, OutcomeInput } from "./schemas";
import { summarizeSavings } from "./savings";
import { getAkte } from "./service";

/** Speichert, wie der Kauf ausgegangen ist (neue Version; frühere bleiben erhalten). */
export async function recordOutcome(userId: string, analysisId: string, input: OutcomeInput): Promise<OutcomeData> {
  const akte = await getAkte(userId, analysisId);
  if (!akte) throw Object.assign(new Error("Kaufakte nicht gefunden"), { code: "not_found" });
  const data: OutcomeData = {
    status: input.status,
    paidEur: input.status === "bought" ? input.paidEur : undefined,
    askingEur: akte.analysis.report?.listing.priceEur || undefined,
    recommendation: akte.recommendation.current,
    decidedAt: nowIso(),
  };
  const store = getStore();
  await store.addModule<OutcomeData>({ id: newId("mod"), analysisId, userId, kind: "outcome", createdAt: data.decidedAt, data });
  await store.countEvent(`outcome_${input.status}`);
  return data;
}

export async function savingsSummary(userId: string) {
  const mods = (await getStore().listUserModules(userId, "outcome", 500)) as ModuleRecord<OutcomeData>[];
  return summarizeSavings(mods.map((m) => ({ analysisId: m.analysisId, data: m.data })));
}
