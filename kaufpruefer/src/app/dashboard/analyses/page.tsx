import type { Metadata } from "next";
import { AnalysisList } from "@/components/dashboard/analysis-list";
import { requireUser } from "@/lib/auth/session";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Analysehistorie" };

export default async function AnalysesPage() {
  const user = await requireUser("/dashboard/analyses");
  const analyses = await getStore().listAnalyses(user.id, 200);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analysehistorie</h1>
        <p className="mt-1 text-sm text-muted">Alle gespeicherten Prüfberichte. Berichte kannst du jederzeit einzeln oder in den Kontoeinstellungen vollständig löschen.</p>
      </div>
      <AnalysisList items={analyses} />
    </div>
  );
}
