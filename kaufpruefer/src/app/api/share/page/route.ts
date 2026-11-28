import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { errorJson, rateLimit } from "@/lib/http";
import { PageCaptureSchema } from "@/lib/share/page-capture";
import { importPageCapture } from "@/lib/share/page-import";

export const runtime = "nodejs";
export const maxDuration = 90;

/** Übernimmt die vom Nutzer per „→ DEAL-NIVO“-Button übergebene Inseratsseite. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Bitte melde dich an.");
  const rl = await rateLimit(`page-import:${user.id}`, 3600, 40);
  if (!rl.allowed) return errorJson(429, "rate_limited", "Zu viele Übernahmen. Bitte warte etwas.");
  const body = z.object({ capture: PageCaptureSchema }).safeParse(await req.json().catch(() => null));
  if (!body.success) return errorJson(400, "invalid_request", "Die Seite konnte nicht gelesen werden.");
  const r = await importPageCapture(user.id, body.data.capture);
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
