import "server-only";
import { safeErr } from "@/lib/ai/errors";
import { getCurrentUser, type SessionUser } from "../auth/session";
import { errorJson, rateLimit } from "../http";

/** Gemeinsamer Rahmen für Kaufakte-Routen: Anmeldung, Rate-Limit, Fehlerabbildung. */
export async function akteRoute(
  key: string,
  limitPerHour: number,
  fn: (user: SessionUser) => Promise<Response>,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Bitte melde dich an.");
  const rl = await rateLimit(`${key}:${user.id}`, 3600, limitPerHour);
  if (!rl.allowed) return errorJson(429, "rate_limited", "Zu viele Anfragen. Bitte warte etwas.");
  try {
    return await fn(user);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "failed";
    const status = code === "invalid_upload" ? 400 : code === "ai_budget" ? 503 : code === "insufficient_balance" ? 402 : 422;
    if (!(e as { code?: string }).code) console.error(`[${key}]`, safeErr(e));
    return errorJson(status, code, (e as { code?: string }).code ? safeErr(e) : "Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.");
  }
}

export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}
