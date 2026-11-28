import { akteRoute } from "@/lib/api/akte-route";
import { extendWatch } from "@/lib/watch/service";

export const runtime = "nodejs";

/** Beobachtung um einen Zeitraum verlängern (kostet Token). */
export async function POST(_req: Request, ctx: RouteContext<"/api/analyses/[id]/watch/extend">) {
  return akteRoute("watch-extend", 20, async (user) => {
    const { id } = await ctx.params;
    return Response.json({ watch: await extendWatch(user.id, id) });
  });
}
