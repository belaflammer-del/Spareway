import { z } from "zod";
import { akteRoute, readJson } from "@/lib/api/akte-route";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return akteRoute("notifications", 600, async (user) => {
    const items = await getStore().listNotifications(user.id, 50);
    return Response.json({ items, unread: items.filter((n) => !n.readAt).length }, { headers: { "Cache-Control": "no-store" } });
  });
}

/** Als gelesen markieren (alle oder ausgewählte). */
export async function POST(req: Request) {
  return akteRoute("notifications", 600, async (user) => {
    const p = z.object({ ids: z.array(z.string().max(60)).max(100).optional() }).safeParse((await readJson(req)) ?? {});
    await getStore().markNotificationsRead(user.id, p.success ? p.data.ids : undefined);
    return Response.json({ ok: true });
  });
}
