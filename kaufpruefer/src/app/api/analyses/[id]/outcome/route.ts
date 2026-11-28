import { akteRoute, readJson } from "@/lib/api/akte-route";
import { recordOutcome } from "@/lib/akte/outcome";
import { OutcomeInputSchema } from "@/lib/akte/schemas";
import { errorJson } from "@/lib/http";

export const runtime = "nodejs";

/** „Wie ist es ausgegangen?“ – gekauft (mit Preis) oder nicht gekauft. Keine KI, keine Kosten. */
export async function POST(req: Request, ctx: RouteContext<"/api/analyses/[id]/outcome">) {
  return akteRoute("outcome", 60, async (user) => {
    const parsed = OutcomeInputSchema.safeParse(await readJson(req));
    if (!parsed.success) return errorJson(400, "invalid_request", parsed.error.issues[0]?.message ?? "Ungültige Angaben");
    const { id } = await ctx.params;
    return Response.json({ outcome: await recordOutcome(user.id, id, parsed.data) });
  });
}
