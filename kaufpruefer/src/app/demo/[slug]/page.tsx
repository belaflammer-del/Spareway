import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report/report-view";
import { getDemoReport } from "@/lib/demo";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/demo/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const r = getDemoReport(slug);
  return { title: r ? `Demo: ${r.listing.title?.replace(" (Demo)", "")}` : "Demo" };
}

export default async function DemoReportPage({ params }: PageProps<"/demo/[slug]">) {
  const { slug } = await params;
  const report = getDemoReport(slug);
  if (!report) notFound();
  const visibility = (await getStore().getConfig()).demoVisibility ?? {};
  if (visibility[slug] === false) notFound();
  return <ReportView report={report} pdfUrl={`/api/demo/${slug}/pdf`} />;
}
