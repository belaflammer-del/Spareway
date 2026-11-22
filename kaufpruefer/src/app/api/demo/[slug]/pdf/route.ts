import { errorJson } from "@/lib/http";
import { getDemoReport } from "@/lib/demo";
import { renderReportPdf } from "@/lib/pdf/report-pdf";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/demo/[slug]/pdf">) {
  const { slug } = await ctx.params;
  const report = getDemoReport(slug);
  if (!report) return errorJson(404, "not_found", "Demo nicht gefunden");
  const pdf = await renderReportPdf(report);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="dealnivo-demo-${slug}.pdf"` },
  });
}
