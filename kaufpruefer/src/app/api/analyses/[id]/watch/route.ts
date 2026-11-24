import { z } from "zod";
import { akteRoute, readJson } from "@/lib/api/akte-route";
import { errorJson } from "@/lib/http";
import { startWatch, stopWatch } from "@/lib/watch/service";

export const runtime = "nodejs";

const Body = z.object({
  intervalHours: z.number().int().min(1).max(168).optional(),
  notify: z.object({ email: z.boolean().optional(), push: z.boolean().optional() }).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/analyses/[id]/watch">) {
  return akteRoute("watch", 30, async (user) => {
    const parsed = Body.safeParse((await readJson(req)) ?? {});
    if (!parsed.success) return errorJson(400, "invalid_request", "Ungültige Angaben");
    const { id } = await ctx.params;
    return Response.json({ watch: await startWatch(user.id, id, parsed.data) });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/analyses/[id]/watch">) {
  return akteRoute("watch", 30, async (user) => {
    const { id } = await ctx.params;
    await stopWatch(user.id, id);
    return Response.json({ ok: true });
  });
}
