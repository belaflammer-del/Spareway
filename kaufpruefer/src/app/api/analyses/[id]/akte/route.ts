import { akteRoute } from "@/lib/api/akte-route";
import { exportAkte, getAkte } from "@/lib/akte/service";
import { errorJson } from "@/lib/http";

export const runtime = "nodejs";

/** Kaufakte als JSON-Datei exportieren. */
export async function GET(_req: Request, ctx: RouteContext<"/api/analyses/[id]/akte">) {
  return akteRoute("akte-export", 60, async (user) => {
    const { id } = await ctx.params;
    const akte = await getAkte(user.id, id);
    if (!akte) return errorJson(404, "not_found", "Kaufakte nicht gefunden");
    return new Response(JSON.stringify(exportAkte(akte), null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="dealnivo-kaufakte-${id}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
