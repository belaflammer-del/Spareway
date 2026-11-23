import { z } from "zod";
import { UsageMeter } from "@/lib/ai/provider";
import { assertAiBudget } from "@/lib/ai/budget";
import { guard } from "@/lib/ai/guard";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveAI } from "@/lib/config/providers";
import { errorJson, rateLimit } from "@/lib/http";
import { askReport } from "@/lib/pipeline/assistant";
import { getStore } from "@/lib/store";
import { nowIso } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ question: z.string().trim().min(3).max(500) });

/** KI-Rückfrage zum fertigen Bericht – nutzt nur den gespeicherten Bericht als Kontext. */
export async function POST(req: Request, ctx: RouteContext<"/api/analyses/[id]/chat">) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Bitte melde dich an.");
  const rl = await rateLimit(`chat:${user.id}`, 600, 15);
  if (!rl.allowed) return errorJson(429, "rate_limited", "Zu viele Fragen in kurzer Zeit.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, "invalid_request", "Bitte stelle eine Frage (3–500 Zeichen).");

  const { id } = await ctx.params;
  const store = getStore();
  const a = await store.getAnalysis(id, user.id);
  if (!a?.report || a.status !== "completed") return errorJson(404, "not_found", "Bericht nicht gefunden.");
  const limit = (await store.getConfig()).limits?.chatQuestionsPerAnalysis ?? 5;
  const history = a.chat ?? [];
  if (history.length >= limit) return errorJson(429, "chat_limit", `Du hast alle ${limit} Rückfragen zu diesem Kaufcheck genutzt.`);

  const rawAi = await getActiveAI("fast");
  if (!rawAi) return errorJson(503, "ai_unavailable", "Rückfragen benötigen eine aktive KI – derzeit nicht verfügbar.");
  try {
    await assertAiBudget(rawAi, user.id);
    const meter = new UsageMeter();
    const res = await askReport(guard(rawAi, { userId: user.id, scope: "chat" })!, meter, a.report, parsed.data.question, history);
    const entry = { q: parsed.data.question, a: res.answer, at: nowIso(), grounded: !res.insufficientData };
    const t = meter.total;
    await store.updateAnalysis(id, {
      chat: [...history, entry],
      aiCostUsd: a.aiCostUsd + t.costUsd,
      aiInputTokens: a.aiInputTokens + t.inputTokens,
      aiOutputTokens: a.aiOutputTokens + t.outputTokens,
    });
    await store.countEvent("chat_questions");
    return Response.json({ entry, remaining: limit - history.length - 1, basedOn: res.basedOn });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ai_budget") return errorJson(503, code, (e as Error).message);
    console.error("[chat] failed", (e as Error).message);
    return errorJson(502, "ai_failed", "Die Antwort konnte nicht erstellt werden. Bitte versuche es erneut – die Frage wurde nicht angerechnet.");
  }
}
