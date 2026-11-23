import "server-only";
import { env } from "../config/env";
import { getStore } from "../store";
import type { AIProvider } from "./provider";

/** Zähler-Schlüssel für die KI-Kosten eines Tages (Mikro-USD). */
export function aiSpendKey(d = new Date()) {
  return `ai_cost_micro_usd:${d.toISOString().slice(0, 10)}`;
}

export async function recordAiSpend(usd: number) {
  if (usd > 0) await getStore().countEvent(aiSpendKey(), Math.round(usd * 1_000_000));
}

export async function dailyBudgetUsd(): Promise<number> {
  const cfg = await getStore().getConfig();
  return cfg.ai?.dailyBudgetUsd ?? env.ai.dailyBudgetUsd;
}

/**
 * Kostenbremse: Wird das tägliche KI-Budget überschritten, werden keine
 * weiteren KI-Aufrufe gestartet (Analysen laufen dann im Regelmodus bzw. werden abgelehnt).
 */
export async function assertAiBudget(ai: AIProvider | null) {
  if (!ai) return;
  const spent = (await getStore().getCounter(aiSpendKey())) / 1_000_000;
  if (spent >= (await dailyBudgetUsd())) {
    throw Object.assign(new Error("Das tägliche KI-Budget ist ausgeschöpft. Bitte versuche es morgen erneut."), { code: "ai_budget" });
  }
}
