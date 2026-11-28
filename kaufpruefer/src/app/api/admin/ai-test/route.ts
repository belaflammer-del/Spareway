import { z } from "zod";
import { describeAiError } from "@/lib/ai/errors";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveAI } from "@/lib/config/providers";
import { errorJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Admin: Testet die Verbindung zu OpenAI mit einem winzigen Aufruf (< 0,001 $) und nennt die genaue Fehlerursache. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return errorJson(403, "forbidden", "Nur für Admins");
  const out: Record<string, unknown> = {};
  for (const kind of ["main", "fast"] as const) {
    const ai = await getActiveAI(kind);
    if (!ai) {
      out[kind] = { ok: false, reason: "Kein KI-Schlüssel konfiguriert bzw. KI im Admin deaktiviert" };
      continue;
    }
    const t0 = Date.now();
    try {
      const { data, usage } = await ai.generate({
        task: "ai_test",
        system: "Antworte im Schema.",
        parts: [{ type: "text", text: "Sag ok." }],
        schema: z.object({ answer: z.string() }),
        schemaName: "ai_test",
        maxOutputTokens: 50,
      });
      out[kind] = { ok: true, model: ai.model, ms: Date.now() - t0, answer: data.answer.slice(0, 20), costUsd: usage.costUsd };
    } catch (e) {
      out[kind] = { ok: false, model: ai.model, ms: Date.now() - t0, ...describeAiError(e, ai.model) };
    }
  }
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
