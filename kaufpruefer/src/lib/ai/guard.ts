import "server-only";
import { env } from "../config/env";
import { getStore } from "../store";
import type { AppConfig } from "../store/types";
import type { AIProvider, AIUsage, StructuredRequest } from "./provider";

/**
 * Zentrale KI-Kostenkontrolle. JEDER KI-Aufruf (Extraktion, Bildanalyse,
 * Bewertungs-OCR, Video-Frames, Texte, Rückfragen) läuft über diesen Wächter.
 * Vor jedem Aufruf werden alle Limits geprüft – bei Überschreitung erfolgt
 * kein weiterer API-Aufruf.
 */
export interface CostLimits {
  perAnalysisUsd: number;
  perUserDayUsd: number;
  globalDayUsd: number;
  globalMonthUsd: number;
  maxCallsPerAnalysis: number;
}

export function resolveLimits(cfg: AppConfig): CostLimits {
  const l = cfg.limits ?? {};
  return {
    perAnalysisUsd: l.perAnalysisUsd ?? 1,
    perUserDayUsd: l.perUserDayUsd ?? 3,
    globalDayUsd: cfg.ai?.dailyBudgetUsd ?? env.ai.dailyBudgetUsd,
    globalMonthUsd: l.globalMonthUsd ?? 300,
    maxCallsPerAnalysis: l.maxCallsPerAnalysis ?? 14,
  };
}

const day = (d = new Date()) => d.toISOString().slice(0, 10);
const month = (d = new Date()) => d.toISOString().slice(0, 7);
export const spendKeys = {
  globalDay: (d?: Date) => `ai_cost_micro_usd:${day(d)}`,
  globalMonth: (d?: Date) => `ai_cost_micro_usd_month:${month(d)}`,
  userDay: (userId: string, d?: Date) => `ai_cost_micro_usd_user:${userId}:${day(d)}`,
};

export class AiLimitError extends Error {
  code = "ai_budget" as const;
  constructor(
    message: string,
    public limit: keyof CostLimits,
  ) {
    super(message);
  }
}

export interface GuardContext {
  userId?: string;
  scope: "extract" | "analysis" | "seller" | "video" | "chat" | "chat_check" | "inspection" | "watch";
}

/** Prüft globale bzw. nutzerbezogene Budgets (ohne Aufruf-Kontext). */
export async function checkBudgets(limits: CostLimits, userId?: string) {
  const store = getStore();
  const [d, m, u] = await Promise.all([
    store.getCounter(spendKeys.globalDay()),
    store.getCounter(spendKeys.globalMonth()),
    userId ? store.getCounter(spendKeys.userDay(userId)) : Promise.resolve(0),
  ]);
  if (d / 1e6 >= limits.globalDayUsd) throw new AiLimitError("Das tägliche KI-Budget von DEAL-NIVO ist ausgeschöpft. Bitte versuche es morgen erneut.", "globalDayUsd");
  if (m / 1e6 >= limits.globalMonthUsd) throw new AiLimitError("Das monatliche KI-Budget ist ausgeschöpft. Bitte versuche es später erneut.", "globalMonthUsd");
  if (userId && u / 1e6 >= limits.perUserDayUsd) throw new AiLimitError("Dein tägliches Limit für KI-Auswertungen ist erreicht. Morgen geht es weiter.", "perUserDayUsd");
}

async function recordSpend(usd: number, userId?: string) {
  if (!(usd > 0)) return;
  const micro = Math.round(usd * 1e6);
  const store = getStore();
  await Promise.all([
    store.countEvent(spendKeys.globalDay(), micro),
    store.countEvent(spendKeys.globalMonth(), micro),
    userId ? store.countEvent(spendKeys.userDay(userId), micro) : Promise.resolve(),
  ]);
}

/** Umhüllt einen Provider mit Limitprüfung und Kostenerfassung. */
export function guard(inner: AIProvider | null, ctx: GuardContext): AIProvider | null {
  if (!inner) return null;
  let calls = 0;
  let spent = 0;
  let limitsP: Promise<CostLimits> | null = null;
  const limits = () => (limitsP ??= getStore().getConfig().then(resolveLimits));
  return {
    id: inner.id,
    model: inner.model,
    async generate<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: AIUsage }> {
      const l = await limits();
      try {
        if (calls >= l.maxCallsPerAnalysis) throw new AiLimitError("Maximale Anzahl KI-Aufrufe für diese Analyse erreicht.", "maxCallsPerAnalysis");
        if (spent >= l.perAnalysisUsd) throw new AiLimitError("Kostenlimit für diese Analyse erreicht.", "perAnalysisUsd");
        await checkBudgets(l, ctx.userId);
      } catch (e) {
        await getStore().countEvent("ai_limit_hit").catch(() => undefined);
        console.warn(`[ai-guard] Limit erreicht (${(e as AiLimitError).limit}) scope=${ctx.scope}`);
        throw e;
      }
      calls++;
      const res = await inner.generate(req);
      spent += res.usage.costUsd;
      await recordSpend(res.usage.costUsd, ctx.userId).catch(() => undefined);
      return res;
    },
  };
}
