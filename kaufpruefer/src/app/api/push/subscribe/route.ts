import { z } from "zod";
import { akteRoute, readJson } from "@/lib/api/akte-route";
import { errorJson } from "@/lib/http";
import { pushConfig } from "@/lib/notify/service";
import { getStore } from "@/lib/store";
import { nowIso } from "@/lib/utils";

export const runtime = "nodejs";

/** Öffentlicher VAPID-Schlüssel (oder null, wenn Web Push nicht konfiguriert ist). */
export async function GET() {
  return Response.json({ publicKey: pushConfig()?.publicKey ?? null });
}

const Sub = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "https erforderlich"),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export async function POST(req: Request) {
  return akteRoute("push", 30, async (user) => {
    if (!pushConfig()) return errorJson(503, "push_disabled", "Web-Push ist derzeit nicht eingerichtet.");
    const p = Sub.safeParse(await readJson(req));
    if (!p.success) return errorJson(400, "invalid_request", "Ungültiges Abo");
    await getStore().savePushSubscription({ endpoint: p.data.endpoint, userId: user.id, keys: p.data.keys, createdAt: nowIso() });
    return Response.json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return akteRoute("push", 30, async (user) => {
    const p = z.object({ endpoint: z.string().max(1000) }).safeParse(await readJson(req));
    if (!p.success) return errorJson(400, "invalid_request", "Ungültig");
    const subs = await getStore().listPushSubscriptions(user.id);
    if (subs.some((s) => s.endpoint === p.data.endpoint)) await getStore().deletePushSubscription(p.data.endpoint);
    return Response.json({ ok: true });
  });
}
