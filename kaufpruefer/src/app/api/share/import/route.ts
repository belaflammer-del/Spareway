import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { clientIpHash, errorJson, rateLimit } from "@/lib/http";
import { processShare } from "@/lib/share/import";
import { getStore } from "@/lib/store";
import { nowIso } from "@/lib/utils";

export const runtime = "nodejs";

const Body = z.object({
  url: z.string().max(2000).optional(),
  text: z.string().max(4000).optional(),
  title: z.string().max(300).optional(),
  inboxId: z.string().regex(/^sh_[a-z0-9]{6,32}$/).optional(),
});

/**
 * Verarbeitet geteilte Inhalte (Link, Text, Bilder aus dem Teilen-Eingang)
 * und liefert eine Bestätigungsansicht. Startet KEINE Analyse.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  const rl = await rateLimit(user ? `share-import:u:${user.id}` : `share-import:ip:${await clientIpHash()}`, 3600, 60);
  if (!rl.allowed) return errorJson(429, "rate_limited", "Zu viele Anfragen. Bitte versuche es später erneut.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, "invalid_request", "Ungültige Anfrage");
  const { inboxId } = parsed.data;
  let { url, text, title } = parsed.data;
  let uploadIds: string[] = [];

  if (inboxId) {
    if (!user) return errorJson(401, "unauthorized", "Bitte melde dich an, um geteilte Inhalte zu übernehmen.");
    const store = getStore();
    const inbox = await store.takeShareInbox(inboxId, user.id, nowIso());
    if (!inbox) return errorJson(404, "not_found", "Die geteilten Inhalte sind abgelaufen. Bitte teile das Inserat erneut.");
    const owner = `share_${inbox.id.replace(/[^a-z0-9]/gi, "")}`;
    // Uploads dem Nutzer zuordnen (idempotent – erneutes Abholen schadet nicht)
    for (const id of inbox.uploadIds) await store.reassignUpload(id, owner, user.id);
    uploadIds = inbox.uploadIds;
    url ??= inbox.url;
    text ??= inbox.text;
    title ??= inbox.title;
  }

  const result = await processShare({ url, text, title, uploadIds }, user?.id);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
