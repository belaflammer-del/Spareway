import { z } from "zod";
import { akteRoute, readJson } from "@/lib/api/akte-route";
import { errorJson } from "@/lib/http";
import { InspectionSyncSchema, latestInspection, startInspection, syncInspection } from "@/lib/inspection/service";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/analyses/[id]/inspection">) {
  return akteRoute("inspection-get", 600, async (user) => {
    const { id } = await ctx.params;
    return Response.json({ inspection: await latestInspection(user.id, id) }, { headers: { "Cache-Control": "no-store" } });
  });
}

/** Besichtigung starten (keine KI, keine Kosten). */
export async function POST(req: Request, ctx: RouteContext<"/api/analyses/[id]/inspection">) {
  return akteRoute("inspection-start", 30, async (user) => {
    const body = z.object({ restart: z.boolean().default(false) }).safeParse((await readJson(req)) ?? {});
    const { id } = await ctx.params;
    return Response.json({ inspection: await startInspection(user.id, id, { restart: body.success && body.data.restart }) });
  });
}

/** Status/Notizen synchronisieren – auch gesammelte Offline-Änderungen. */
export async function PUT(req: Request, ctx: RouteContext<"/api/analyses/[id]/inspection">) {
  return akteRoute("inspection-sync", 900, async (user) => {
    const parsed = InspectionSyncSchema.safeParse(await readJson(req));
    if (!parsed.success) return errorJson(400, "invalid_request", "Ungültige Angaben");
    const { id } = await ctx.params;
    return Response.json({ inspection: await syncInspection(user.id, id, parsed.data) });
  });
}
