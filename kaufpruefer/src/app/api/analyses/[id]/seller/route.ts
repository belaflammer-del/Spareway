import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { errorJson, rateLimit } from "@/lib/http";
import { addSellerToAnalysis } from "@/lib/pipeline/service";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  method: z.enum(["screenshots", "screen_recording", "pasted_text"]),
  imageIds: z.array(z.string().regex(/^up_[a-z0-9]{6,32}$/)).max(30).default([]),
  pastedText: z.string().max(50000).optional(),
  platformTotalClaimed: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

/** Verkäuferprüfung nachträglich ergänzen – kein zusätzlicher Token. */
export async function POST(req: Request, ctx: RouteContext<"/api/analyses/[id]/seller">) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Bitte melde dich an.");
  const rl = await rateLimit(`seller:${user.id}`, 3600, 10);
  if (!rl.allowed) return errorJson(429, "rate_limited", "Zu viele Anfragen. Bitte warte etwas.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, "invalid_request", "Ungültige Angaben");
  const { id } = await ctx.params;
  try {
    await addSellerToAnalysis(user.id, id, parsed.data);
    return Response.json({ ok: true });
  } catch (e) {
    const code = (e as { code?: string }).code ?? "failed";
    return errorJson(code === "invalid_upload" ? 400 : code === "ai_budget" ? 503 : 422, code, (e as Error).message);
  }
}
