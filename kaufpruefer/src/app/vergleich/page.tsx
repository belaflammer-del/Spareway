import { ArrowLeftRight, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ScoreBox } from "@/components/report/score-ring";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { getCurrentUser } from "@/lib/auth/session";
import { getDemoReport, listDemos } from "@/lib/demo";
import { formatEur, PRICE_RATING_LABELS, RECOMMENDATION_LABELS } from "@/lib/domain/labels";
import type { AnalysisReport } from "@/lib/domain/schemas";
import { compareReports } from "@/lib/engine/compare";
import { getStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Angebote vergleichen" };
export const dynamic = "force-dynamic";

const strip = (t?: string) => (t ?? "Angebot").replace(/\s*\(Demo\)$/, "");

export default async function ComparePage({ searchParams }: PageProps<"/vergleich">) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const store = getStore();
  const mine = user ? (await store.listAnalyses(user.id, 100)).filter((a) => a.status === "completed") : [];
  const options = [
    ...mine.map((a) => ({ value: a.id, label: `${a.title} · ${new Date(a.createdAt).toLocaleDateString("de-DE")}` })),
    ...listDemos().map((d) => ({ value: `demo:${d.slug}`, label: `Demo: ${strip(d.report.listing.title)}` })),
  ];

  async function load(v: unknown): Promise<AnalysisReport | null> {
    if (typeof v !== "string" || !v) return null;
    if (v.startsWith("demo:")) return getDemoReport(v.slice(5));
    if (!user) return null;
    return (await store.getAnalysis(v, user.id))?.report ?? null;
  }
  const [a, b] = await Promise.all([load(sp.a), load(sp.b)]);
  const result = a && b ? compareReports(a, b) : null;
  if (result) await store.countEvent("comparisons");

  const rows: { label: string; get: (r: AnalysisReport) => string }[] = [
    { label: "Preis", get: (r) => formatEur(r.listing.priceEur) },
    { label: "Marktwert", get: (r) => (r.market.range ? `${formatEur(r.market.range.low, { compact: true })}–${formatEur(r.market.range.high, { compact: true })}` : "nicht bestimmbar") },
    { label: "Preisbewertung", get: (r) => PRICE_RATING_LABELS[r.market.rating] },
    { label: "Zustand", get: (r) => (r.score.product.score == null ? "nicht bewertbar" : r.score.product.label) },
    { label: "Schwachstellen", get: (r) => String(r.product.weaknesses.length) },
    { label: "Auffälligkeiten (Bilder)", get: (r) => String(r.product.imageFindings.filter((f) => f.evidenceLevel !== "unverifiable").length) },
    { label: "Relevante Risiken", get: (r) => String(r.risks.filter((x) => x.severity === "high" || x.severity === "medium").length) },
    { label: "Verkäufer", get: (r) => (r.seller ? `${r.seller.positive}/${r.seller.visibleReviewCount} positiv` : "nicht geprüft") },
    { label: "Datenqualität", get: (r) => `${r.dataQuality.score}/100` },
    { label: "Empfehlung", get: (r) => RECOMMENDATION_LABELS[r.score.recommendation] },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <ArrowLeftRight className="size-6 text-accent" /> Angebote vergleichen
      </h1>
      <p className="mt-1 text-sm text-muted">Zwei bereits geprüfte Angebote gegenüberstellen – kostenlos, ohne Token.</p>

      <form className="mt-5 grid gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
        <Select name="a" defaultValue={typeof sp.a === "string" ? sp.a : ""} aria-label="Angebot A">
          <option value="">Angebot A wählen …</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Select name="b" defaultValue={typeof sp.b === "string" ? sp.b : ""} aria-label="Angebot B">
          <option value="">Angebot B wählen …</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Button type="submit">Vergleichen</Button>
      </form>
      {!user && <p className="mt-2 text-xs text-muted"><Link href="/login?next=/vergleich" className="underline">Melde dich an</Link>, um deine eigenen Prüfungen zu vergleichen.</p>}

      <details className="mt-4 rounded-2xl border border-border bg-surface p-4" open={!a && !b && mine.length === 0}>
        <summary className="cursor-pointer font-semibold">Neue Inserate vergleichen</summary>
        <form action="/vergleich/start" className="mt-3 space-y-2.5">
          {typeof sp.a === "string" && sp.a ? (
            <>
              <input type="hidden" name="with" value={sp.a} />
              <p className="text-sm text-muted">Mit Angebot A vergleichen:</p>
            </>
          ) : (
            <Input name="url1" placeholder="Link zu Angebot 1" inputMode="url" aria-label="Link Angebot 1" />
          )}
          <Input name="url2" placeholder={typeof sp.a === "string" && sp.a ? "Link zum neuen Angebot" : "Link zu Angebot 2"} inputMode="url" aria-label="Link Angebot 2" required />
          <p className="text-xs text-muted">
            Tokenverbrauch: <span className="font-semibold text-foreground">{typeof sp.a === "string" && sp.a ? "1 Token" : "2 Tokens"}</span> (je neuem vollständigem Check). Bereits geprüfte, unveränderte Inserate werden ohne neuen Token wiederverwendet. Der Vergleich selbst ist kostenlos.
          </p>
          <Button type="submit" className="w-full">Prüfen & vergleichen</Button>
        </form>
      </details>

      {a && b && result && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            {[a, b].map((r, i) => (
              <Card key={i} className={cn("p-3.5", result.winner === (i === 0 ? "a" : "b") && "border-accent ring-2 ring-accent/30")}>
                <div className="flex items-center gap-2.5">
                  <ScoreBox score={r.score.overall} size="sm" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-accent">{i === 0 ? "A" : "B"}{result.winner === (i === 0 ? "a" : "b") && " · vorne"}</p>
                    <p className="line-clamp-2 text-sm font-semibold leading-snug">{strip(r.listing.title)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Card className="mt-3 divide-y divide-border">
            {rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[1fr_1fr] gap-2 px-3.5 py-2.5 text-sm sm:grid-cols-[140px_1fr_1fr]">
                <span className="col-span-2 text-xs text-muted sm:col-span-1 sm:text-sm">{row.label}</span>
                <span className="font-medium">{row.get(a)}</span>
                <span className="font-medium">{row.get(b)}</span>
              </div>
            ))}
          </Card>

          <Card className="mt-3 p-4">
            <p className="flex items-center gap-2 font-semibold">
              <Trophy className="size-4 text-accent" /> Die wichtigsten Unterschiede
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {result.points.map((p) => (
                <li key={p} className="flex gap-2"><span className="text-accent">›</span>{p}</li>
              ))}
            </ul>
            <p className="mt-3 rounded-xl bg-accent-soft/50 p-3 text-sm font-medium">{result.verdict}</p>
            <p className="mt-2 text-xs text-muted">Der Vergleich nutzt ausschließlich die Daten der beiden Prüfberichte – keine zusätzlichen Annahmen.</p>
          </Card>
        </>
      )}
      {(sp.a || sp.b) && (!a || !b) && <p className="mt-6 text-sm text-muted">Bitte zwei verfügbare Prüfberichte auswählen.</p>}
    </div>
  );
}
