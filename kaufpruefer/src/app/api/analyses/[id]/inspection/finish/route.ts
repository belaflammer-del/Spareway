import { z } from "zod";
import { akteRoute, readJson } from "@/lib/api/akte-route";
import { errorJson } from "@/lib/http";
import { finishInspection } from "@/lib/inspection/service";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext<"/api/analyses/[id]/inspection/finish">) {
  return akteRoute("inspection-finish", 30, async (user) => {
    const parsed = z.object({ moduleId: z.string().regex(/^mod_[a-z0-9]{6,32}$/) }).safeParse(await readJson(req));
    if (!parsed.success) return errorJson(400, "invalid_request", "Ungültige Angaben");
    const { id } = await ctx.params;
    return Response.json({ inspection: await finishInspection(user.id, id, parsed.data.moduleId) });
  });
}
