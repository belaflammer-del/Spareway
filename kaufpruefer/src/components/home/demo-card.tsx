import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ScoreBox } from "@/components/report/score-ring";
import { formatEur, PRICE_RATING_LABELS, RECOMMENDATION_LABELS } from "@/lib/domain/labels";
import type { AnalysisReport } from "@/lib/domain/schemas";

export function DemoCard({ slug, report }: { slug: string; report: AnalysisReport }) {
  const title = (report.listing.title ?? "").replace(" (Demo)", "");
  return (
    <Link href={`/demo/${slug}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition active:scale-[0.98] hover:border-accent/50">
      <ScoreBox score={report.score.overall} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{title}</p>
        <p className="truncate text-xs text-muted">
          <span className="tabular font-medium text-foreground">{formatEur(report.listing.priceEur)}</span> · {PRICE_RATING_LABELS[report.market.rating]}
        </p>
        <p className="truncate text-xs text-muted">{RECOMMENDATION_LABELS[report.score.recommendation]}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </Link>
  );
}
