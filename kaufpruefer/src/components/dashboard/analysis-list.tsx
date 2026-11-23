import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ScoreBox } from "@/components/report/score-ring";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, PLATFORM_LABELS, RECOMMENDATION_LABELS } from "@/lib/domain/labels";
import type { AnalysisRecord } from "@/lib/store/types";

export function AnalysisList({ items }: { items: AnalysisRecord[] }) {
  if (items.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <p className="font-medium">Noch keine Analysen</p>
        <p className="mt-1 text-sm text-muted">Starte deine erste Prüfung – der Schnellcheck ist kostenlos.</p>
        <Link href="/check" className="mt-4 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline">Angebot prüfen</Link>
      </div>
    );
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {items.map((a) => {
        const score = a.report?.score;
        return (
          <li key={a.id}>
            <Link href={`/analysis/${a.id}`} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-surface-2/60">
              <ScoreBox score={score?.overall ?? null} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {new Date(a.createdAt).toLocaleDateString("de-DE")} · {PLATFORM_LABELS[a.platform]} · {CATEGORY_LABELS[a.category]}
                </p>
                {a.status === "completed" && Date.now() - Date.parse(a.createdAt) > 30 * 864e5 && (
                  <p className="text-[11px] text-warn">Marktdaten älter als 30 Tage – evtl. veraltet</p>
                )}
              </div>
              {a.status === "completed" && score ? (
                <Badge tone={score.recommendation === "elevated_risk" ? "bad" : score.recommendation === "interesting" ? "good" : "neutral"} className="hidden sm:inline-flex">
                  {RECOMMENDATION_LABELS[score.recommendation]}
                </Badge>
              ) : (
                <Badge tone={a.status === "failed" ? "bad" : "warn"}>{a.status === "failed" ? "Fehlgeschlagen" : "Läuft"}</Badge>
              )}
              <ChevronRight className="size-4 text-muted" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
