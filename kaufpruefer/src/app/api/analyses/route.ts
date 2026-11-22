import { AnalysisRequestSchema } from "@/lib/api/schemas";
import { getCurrentUser } from "@/lib/auth/session";
import { errorJson, rateLimit } from "@/lib/http";
import { startFullAnalysis } from "@/lib/pipeline/service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Bitte melde dich an.");
  const rl = await rateLimit(`analysis:${user.id}`, 3600, 30);
  if (!rl.allowed) return errorJson(429, "rate_limited", "Zu viele Analysen in kurzer Zeit. Bitte warte etwas.");
  const parsed = AnalysisRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, "invalid_request", parsed.error.issues[0]?.message ?? "Ungültige Angaben");
  try {
    const { id } = await startFullAnalysis(user.id, parsed.data);
    return Response.json({ id });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "insufficient_balance" || code === "invalid_upload" || code === "pipeline_failed") {
      const status = code === "insufficient_balance" ? 402 : code === "invalid_upload" ? 400 : 500;
      return errorJson(status, code, (e as Error).message);
    }
    console.error("[analyses] unexpected", (e as Error).message);
    return errorJson(500, "internal", "Unerwarteter Fehler. Dein Token wurde nicht verbraucht.");
  }
}
