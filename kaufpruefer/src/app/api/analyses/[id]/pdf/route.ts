import { getCurrentUser } from "@/lib/auth/session";
import { errorJson } from "@/lib/http";
import { renderReportPdf } from "@/lib/pdf/report-pdf";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/analyses/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Nicht angemeldet");
  const { id } = await ctx.params;
  const a = await getStore().getAnalysis(id, user.id);
  if (!a?.report) return errorJson(404, "not_found", "Bericht nicht gefunden");
  const pdf = await renderReportPdf(a.report);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="dealnivo-${id}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
