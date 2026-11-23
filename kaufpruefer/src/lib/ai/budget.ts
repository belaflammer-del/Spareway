import "server-only";
import { getStore } from "../store";
import type { AIProvider } from "./provider";
import { checkBudgets, resolveLimits, spendKeys } from "./guard";

/** Zähler-Schlüssel für die KI-Kosten eines Tages (Mikro-USD). */
export function aiSpendKey(d = new Date()) {
  return spendKeys.globalDay(d);
}

export async function dailyBudgetUsd(): Promise<number> {
  return resolveLimits(await getStore().getConfig()).globalDayUsd;
}

/** Vorabprüfung vor dem Start einer KI-gestützten Aktion. */
export async function assertAiBudget(ai: AIProvider | null, userId?: string) {
  if (!ai) return;
  await checkBudgets(resolveLimits(await getStore().getConfig()), userId);
}
