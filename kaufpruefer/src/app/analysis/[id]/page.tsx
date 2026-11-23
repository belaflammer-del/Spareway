import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report/report-view";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { providerEnabled } from "@/lib/config/providers";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Prüfbericht", robots: { index: false } };

export default async function AnalysisPage({ params }: PageProps<"/analysis/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/analysis/${id}`);
  const a = await getStore().getAnalysis(id, user.id);
  if (!a) notFound();
  if (a.status !== "completed" || !a.report) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">{a.status === "failed" ? "Analyse fehlgeschlagen" : "Analyse läuft noch"}</h1>
        <p className="mt-2 text-muted">
          {a.status === "failed" ? "Dein Token wurde nicht verbraucht und automatisch zurückgebucht. Bitte versuche es erneut." : "Bitte lade die Seite in einigen Sekunden neu."}
        </p>
        <Button asChild className="mt-6">
          <Link href={a.status === "failed" ? "/check" : `/analysis/${id}`}>{a.status === "failed" ? "Neue Prüfung starten" : "Neu laden"}</Link>
        </Button>
      </div>
    );
  }
  const store = getStore();
  const [cfg, prev, aiOn] = await Promise.all([store.getConfig(), a.previousId ? store.getAnalysis(a.previousId, user.id) : null, providerEnabled("ai")]);
  return (
    <ReportView
      report={a.report}
      pdfUrl={`/api/analyses/${id}/pdf`}
      analysisId={id}
      assistant={{ initial: a.chat ?? [], limit: cfg.limits?.chatQuestionsPerAnalysis ?? 5, aiAvailable: aiOn }}
      previous={prev ? { id: prev.id, createdAt: prev.createdAt, priceEur: prev.priceEur ?? prev.report?.listing.priceEur } : undefined}
    />
  );
}
