import { getCurrentUser } from "@/lib/auth/session";
import { errorJson } from "@/lib/http";
import { getVideoJob } from "@/lib/video/jobs";

export const runtime = "nodejs";

/** Fortschritt einer Videoverarbeitung. */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/video/[jobId]">) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Nicht angemeldet");
  const { jobId } = await ctx.params;
  const job = await getVideoJob(jobId, user.id);
  if (!job) return errorJson(404, "not_found", "Verarbeitung nicht gefunden oder abgelaufen");
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
}
