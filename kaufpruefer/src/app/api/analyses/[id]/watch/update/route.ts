import { z } from "zod";
import { akteRoute, readJson } from "@/lib/api/akte-route";
import { errorJson } from "@/lib/http";
import { manualWatchUpdate } from "@/lib/watch/service";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  priceEur: z.number().positive().max(10_000_000).optional(),
  imageIds: z.array(z.string().regex(/^up_[a-z0-9]{6,32}$/)).max(6).optional(),
  pastedText: z.string().max(20000).optional(),
  available: z.enum(["yes", "no"]).optional(),
});

/** Manuelle Aktualisierung (neuer Preis, Screenshot oder Text). */
export async function POST(req: Request, ctx: RouteContext<"/api/analyses/[id]/watch/update">) {
  return akteRoute("watch-update", 30, async (user) => {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) return errorJson(400, "invalid_request", "Ungültige Angaben");
    const { id } = await ctx.params;
    const r = await manualWatchUpdate(user.id, id, parsed.data);
    return Response.json({ changes: r.changes, version: r.module.version });
  });
}
