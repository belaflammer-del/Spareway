import { z } from "zod";
import { akteRoute, readJson } from "@/lib/api/akte-route";
import { errorJson } from "@/lib/http";
import { addInspectionPhoto } from "@/lib/inspection/service";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  moduleId: z.string().regex(/^mod_[a-z0-9]{6,32}$/),
  itemId: z.string().max(120),
  uploadId: z.string().regex(/^up_[a-z0-9]{6,32}$/),
  analyze: z.boolean().default(false),
});

export async function POST(req: Request, ctx: RouteContext<"/api/analyses/[id]/inspection/photo">) {
  return akteRoute("inspection-photo", 120, async (user) => {
    const parsed = Body.safeParse(await readJson(req));
    if (!parsed.success) return errorJson(400, "invalid_request", "Ungültige Angaben");
    const { id } = await ctx.params;
    return Response.json(await addInspectionPhoto(user.id, id, parsed.data));
  });
}
