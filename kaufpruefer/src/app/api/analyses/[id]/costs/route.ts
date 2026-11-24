import { z } from "zod";
import { akteRoute, readJson } from "@/lib/api/akte-route";
import { UserCostInputSchema } from "@/lib/akte/schemas";
import { computeAndStoreCosts } from "@/lib/costs/service";
import { errorJson } from "@/lib/http";

export const runtime = "nodejs";

/** Gesamtkosten (neu) berechnen, optional mit eigenen Kostenpositionen. Keine KI. */
export async function POST(req: Request, ctx: RouteContext<"/api/analyses/[id]/costs">) {
  return akteRoute("costs", 120, async (user) => {
    const parsed = z.object({ userInputs: z.array(UserCostInputSchema).max(30).optional() }).safeParse((await readJson(req)) ?? {});
    if (!parsed.success) return errorJson(400, "invalid_request", "Ungültige Kostenangaben");
    const { id } = await ctx.params;
    return Response.json({ costs: await computeAndStoreCosts(user.id, id, parsed.data.userInputs) });
  });
}
