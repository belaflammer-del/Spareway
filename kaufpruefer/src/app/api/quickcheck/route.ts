import { QuickCheckRequestSchema } from "@/lib/api/schemas";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { clientIpHash, errorJson, rateLimit } from "@/lib/http";
import { runQuickCheck } from "@/lib/pipeline/quick";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/** Kostenloser Schnellcheck mit Missbrauchsschutz (IP- und Konto-Limit pro Tag). */
export async function POST(req: Request) {
  const parsed = QuickCheckRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, "invalid_request", "Ungültige Angaben");
  const user = await getCurrentUser();
  const ip = await clientIpHash();
  const day = 24 * 3600;
  const ipLimit = await rateLimit(`quick:ip:${ip}`, day, env.quickcheckLimitPerIp * (user ? 2 : 1));
  if (!ipLimit.allowed) return errorJson(429, "rate_limited", "Du hast das tägliche Limit für kostenlose Schnellchecks erreicht. Der vollständige Kaufcheck ist weiterhin verfügbar.");
  if (user) {
    const u = await rateLimit(`quick:user:${user.id}`, day, env.quickcheckLimitPerUser);
    if (!u.allowed) return errorJson(429, "rate_limited", "Du hast das tägliche Limit für kostenlose Schnellchecks erreicht.");
  }
  await getStore().countQuickCheck();
  return Response.json({ result: runQuickCheck(parsed.data.listing), remaining: ipLimit.remaining });
}
