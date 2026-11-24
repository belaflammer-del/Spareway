import { akteRoute } from "@/lib/api/akte-route";
import { runImageMatch } from "@/lib/images/match";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Bildabgleich (erneut) ausführen – nur Hashes, keine KI. */
export async function POST(_req: Request, ctx: RouteContext<"/api/analyses/[id]/images">) {
  return akteRoute("images", 20, async (user) => {
    const { id } = await ctx.params;
    return Response.json({ imageMatch: await runImageMatch(user.id, id, { force: true }) });
  });
}
