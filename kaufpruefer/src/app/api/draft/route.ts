import { assertAiBudget, recordAiSpend } from "@/lib/ai/budget";
import { getActiveAI, providerEnabled } from "@/lib/config/providers";
import { DraftRequestSchema } from "@/lib/api/schemas";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { clientIpHash, errorJson, rateLimit } from "@/lib/http";
import { buildDraft } from "@/lib/pipeline/extract";
import { assertOwnedUploads } from "@/lib/pipeline/service";
import { toDataUrl } from "@/lib/uploads/service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const parsed = DraftRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, "invalid_request", "Ungültige Anfrage");
  const { url, imageIds, pastedText } = parsed.data;
  const user = await getCurrentUser();
  const ai = await getActiveAI();
  const usesAi = !!ai && (imageIds.length > 0 || !!pastedText);
  if ((usesAi || imageIds.length > 0) && !user) return errorJson(401, "unauthorized", "Für das Auslesen von Screenshots ist ein kostenloses Konto nötig.");

  const key = user ? `draft:u:${user.id}` : `draft:ip:${await clientIpHash()}`;
  const rl = await rateLimit(key, 3600, user ? 40 : 20);
  if (!rl.allowed) return errorJson(429, "rate_limited", "Zu viele Anfragen. Bitte versuche es später erneut.");
  if (user) {
    try {
      await assertOwnedUploads(imageIds, user.id);
    } catch (e) {
      return errorJson(400, "invalid_upload", (e as Error).message);
    }
  }

  if (usesAi) {
    try {
      await assertAiBudget(ai);
    } catch (e) {
      return errorJson(503, "ai_budget", (e as Error).message);
    }
  }
  const draft = await buildDraft(
    { url, imageRefs: imageIds, pastedText },
    {
      ai: usesAi ? ai : null,
      importCtx: { ebay: (await providerEnabled("ebay_api")) ? { clientId: env.ebay.clientId, clientSecret: env.ebay.clientSecret, marketplaceId: env.ebay.marketplaceId } : undefined },
      loadImage: (ref) => toDataUrl(ref, user ? [user.id] : []),
    },
  );
  await recordAiSpend(draft.aiCostUsd);
  return Response.json({ draft, aiAvailable: !!ai });
}
