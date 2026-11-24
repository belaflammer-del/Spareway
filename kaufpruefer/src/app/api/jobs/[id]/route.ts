import { getCurrentUser } from "@/lib/auth/session";
import { errorJson } from "@/lib/http";
import { publicJob, requestCancel } from "@/lib/jobs/queue";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/** Status und Fortschritt eines eigenen Hintergrundjobs. */
export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Nicht angemeldet");
  const { id } = await ctx.params;
  const job = await getStore().getJob(id);
  if (!job || job.userId !== user.id) return errorJson(404, "not_found", "Auftrag nicht gefunden");
  return Response.json(publicJob(job), { headers: { "Cache-Control": "no-store" } });
}

/** Abbruch eines eigenen Jobs. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Nicht angemeldet");
  const { id } = await ctx.params;
  if (!(await requestCancel(id, user.id))) return errorJson(404, "not_found", "Auftrag nicht gefunden");
  return Response.json({ ok: true });
}
