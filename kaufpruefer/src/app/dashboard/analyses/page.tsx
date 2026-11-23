import { ArrowLeftRight, Download, FileText, Trash2, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ScoreBox } from "@/components/report/score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { deleteAnalysisAction } from "@/lib/account/actions";
import { requireUser } from "@/lib/auth/session";
import { CATEGORY_LABELS, formatEur, PLATFORM_LABELS, PRICE_RATING_LABELS, RECOMMENDATION_LABELS } from "@/lib/domain/labels";
import type { Category, Platform, PriceRating, Recommendation } from "@/lib/domain/schemas";
import { getStore } from "@/lib/store";
import type { AnalysisQuery } from "@/lib/store/types";

export const metadata: Metadata = { title: "Analysehistorie" };

const PAGE_SIZE = 15;
const str = (v: unknown) => (typeof v === "string" ? v : "");

export default async function AnalysesPage({ searchParams }: PageProps<"/dashboard/analyses">) {
  const user = await requireUser("/dashboard/analyses");
  const sp = await searchParams;
  const query: AnalysisQuery = {
    q: str(sp.q).slice(0, 80) || undefined,
    category: str(sp.cat) || undefined,
    platform: str(sp.platform) || undefined,
    status: sp.status === "completed" || sp.status === "incomplete" ? sp.status : undefined,
    recommendation: str(sp.rec) || undefined,
    sort: (["date_desc", "date_asc", "price_desc", "price_asc"].includes(str(sp.sort)) ? str(sp.sort) : "date_desc") as AnalysisQuery["sort"],
    page: Math.max(1, Number(str(sp.page)) || 1),
    pageSize: PAGE_SIZE,
  };
  const { items, total } = await getStore().queryAnalyses(user.id, query);
  const activeFilters = [query.category, query.platform, query.status, query.recommendation, query.sort !== "date_desc" ? query.sort : undefined].filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (page: number) => {
    const p = new URLSearchParams(Object.entries({ q: query.q, cat: query.category, platform: query.platform, status: query.status, rec: query.recommendation, sort: query.sort, page: String(page) }).filter(([, v]) => v) as [string, string][]);
    return `/dashboard/analyses?${p}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analysehistorie</h1>
          <p className="mt-1 text-sm text-muted">{total} Prüfung(en) gefunden</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/vergleich">
            <ArrowLeftRight /> Zwei Angebote vergleichen
          </Link>
        </Button>
      </div>

      <form className="space-y-2">
        <div className="flex gap-2">
          <Input name="q" placeholder="Suchen …" defaultValue={query.q} aria-label="Suche" className="min-w-0 flex-1" />
          <Button type="submit" variant="subtle">Suchen</Button>
        </div>
        <details className="rounded-xl border border-border bg-surface" open={activeFilters > 0}>
          <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
            Filter & Sortierung{activeFilters > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-accent-fg">{activeFilters}</span>}
          </summary>
          <div className="grid grid-cols-2 gap-2 border-t border-border p-3 lg:grid-cols-5">
            <Select name="cat" defaultValue={query.category ?? ""} aria-label="Kategorie">
              <option value="">Alle Kategorien</option>
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </Select>
            <Select name="platform" defaultValue={query.platform ?? ""} aria-label="Plattform">
              <option value="">Alle Plattformen</option>
              {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
                <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
              ))}
            </Select>
            <Select name="rec" defaultValue={query.recommendation ?? ""} aria-label="Bewertung">
              <option value="">Alle Bewertungen</option>
              {(Object.keys(RECOMMENDATION_LABELS) as Recommendation[]).map((r) => (
                <option key={r} value={r}>{RECOMMENDATION_LABELS[r]}</option>
              ))}
            </Select>
            <Select name="status" defaultValue={query.status ?? ""} aria-label="Status">
              <option value="">Alle Status</option>
              <option value="completed">Abgeschlossen</option>
              <option value="incomplete">Unvollständig / fehlgeschlagen</option>
            </Select>
            <Select name="sort" defaultValue={query.sort} aria-label="Sortierung" className="col-span-2 lg:col-span-1">
              <option value="date_desc">Neueste zuerst</option>
              <option value="date_asc">Älteste zuerst</option>
              <option value="price_desc">Preis absteigend</option>
              <option value="price_asc">Preis aufsteigend</option>
            </Select>
            <Button type="submit" className="col-span-2 lg:col-span-5">Anwenden</Button>
          </div>
        </details>
      </form>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">Keine Prüfungen gefunden</p>
          <Link href="/check" className="mt-3 inline-block text-sm font-medium text-accent">Angebot prüfen</Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((a) => {
            const score = a.report?.score?.overall ?? null;
            const rec = (a.recommendation ?? a.report?.score?.recommendation) as Recommendation | undefined;
            const rating = (a.priceRating ?? a.report?.market?.rating) as PriceRating | undefined;
            const done = a.status === "completed";
            const stale = done && Date.now() - Date.parse(a.createdAt) > 30 * 864e5;
            return (
              <li key={a.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <Link href={`/analysis/${a.id}`} className="flex items-center gap-3 p-3 transition hover:bg-surface-2/60">
                  <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.thumbnail ? <img src={a.thumbnail} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-muted"><FileText className="size-5" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.title}</p>
                    <p className="truncate text-xs text-muted">
                      {PLATFORM_LABELS[a.platform]} · {new Date(a.createdAt).toLocaleDateString("de-DE")}
                      {a.priceEur != null && <> · <span className="tabular font-medium text-foreground">{formatEur(a.priceEur)}</span></>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {done ? (
                        <>
                          {rating && <Badge>{PRICE_RATING_LABELS[rating]}</Badge>}
                          {rec && <Badge tone={rec === "elevated_risk" ? "bad" : rec === "interesting" ? "good" : "neutral"}>{RECOMMENDATION_LABELS[rec]}</Badge>}
                        </>
                      ) : (
                        <Badge tone={a.status === "failed" ? "bad" : "warn"}>{a.status === "failed" ? "Fehlgeschlagen – kein Token verbraucht" : "Läuft"}</Badge>
                      )}
                      {stale && <Badge tone="warn">Marktdaten evtl. veraltet</Badge>}
                    </div>
                  </div>
                  {done && <ScoreBox score={score} size="sm" />}
                </Link>
                {done && (
                  <div className="flex border-t border-border text-xs">
                    <Link href={`/analysis/${a.id}#s-seller`} className="flex flex-1 items-center justify-center gap-1 py-2.5 text-muted hover:bg-surface-2 hover:text-foreground"><Users className="size-3.5" /> Verkäufer</Link>
                    <Link href={`/vergleich?a=${a.id}`} className="flex flex-1 items-center justify-center gap-1 border-l border-border py-2.5 text-muted hover:bg-surface-2 hover:text-foreground"><ArrowLeftRight className="size-3.5" /> Vergleichen</Link>
                    <a href={`/api/analyses/${a.id}/pdf`} target="_blank" rel="noopener" className="flex flex-1 items-center justify-center gap-1 border-l border-border py-2.5 text-muted hover:bg-surface-2 hover:text-foreground"><Download className="size-3.5" /> PDF</a>
                    <form action={deleteAnalysisAction} className="flex flex-1 border-l border-border">
                      <input type="hidden" name="id" value={a.id} />
                      <button className="flex w-full items-center justify-center gap-1 py-2.5 text-muted hover:bg-bad-soft hover:text-bad" aria-label="Analyse löschen"><Trash2 className="size-3.5" /> Löschen</button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Seiten">
          {query.page! > 1 ? <Link href={link(query.page! - 1)} className="font-medium text-accent">← Zurück</Link> : <span />}
          <span className="text-muted">Seite {query.page} von {pages}</span>
          {query.page! < pages ? <Link href={link(query.page! + 1)} className="font-medium text-accent">Weiter →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
