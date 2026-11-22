import type { Metadata } from "next";
import Link from "next/link";
import { ScoreRing } from "@/components/report/score-ring";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/misc";
import { listDemos } from "@/lib/demo";
import { getStore } from "@/lib/store";
import { CATEGORY_LABELS, formatEur, PRICE_RATING_LABELS, RECOMMENDATION_LABELS } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "Beispielanalysen" };

export const dynamic = "force-dynamic";

export default async function DemoListPage() {
  const vis = (await getStore().getConfig()).demoVisibility ?? {};
  const demos = listDemos().filter((d) => vis[d.slug] !== false);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionTitle eyebrow="Demo" title="Beispielanalysen" desc="Sechs interaktive Prüfberichte mit fiktiven Daten. Sie zeigen, wie Kaufklar Angebote bewertet – kostenlos und ohne Tokenverbrauch." />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {demos.map(({ slug, teaser, report }) => (
          <Link key={slug} href={`/demo/${slug}`} className="group">
            <Card className="flex h-full flex-col p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex gap-1.5">
                    <Badge tone="demo">Demo</Badge>
                    <Badge>{CATEGORY_LABELS[report.listing.category]}</Badge>
                  </div>
                  <h2 className="mt-3 font-semibold tracking-tight">{report.listing.title?.replace(" (Demo)", "")}</h2>
                  <p className="mt-1 text-sm text-muted">{teaser}</p>
                </div>
                <ScoreRing score={report.score.overall} size={64} stroke={6} />
              </div>
              <div className="mt-auto space-y-1 pt-5 text-sm">
                <div className="flex justify-between"><span className="text-muted">Preis</span><span className="tabular font-medium">{formatEur(report.listing.priceEur)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Bewertung</span><span>{PRICE_RATING_LABELS[report.market.rating]}</span></div>
                <div className="flex justify-between"><span className="text-muted">Empfehlung</span><span className="text-right">{RECOMMENDATION_LABELS[report.score.recommendation]}</span></div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
