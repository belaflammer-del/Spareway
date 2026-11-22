import { getCurrentUser } from "@/lib/auth/session";
import { errorJson } from "@/lib/http";
import { getStore } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/analyses/[id]">) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Nicht angemeldet");
  const { id } = await ctx.params;
  const a = await getStore().getAnalysis(id, user.id);
  if (!a) return errorJson(404, "not_found", "Analyse nicht gefunden");
  return Response.json({ id: a.id, status: a.status, errorCode: a.errorCode });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/analyses/[id]">) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Nicht angemeldet");
  const { id } = await ctx.params;
  await getStore().deleteAnalysis(id, user.id);
  return Response.json({ ok: true });
}
