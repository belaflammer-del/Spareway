"use client";

import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CarFront,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Gauge,
  ImageIcon,
  Info,
  ListChecks,
  MessageSquareText,
  ShieldCheck,
  Star,
  Users,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, Progress } from "@/components/ui/misc";
import {
  CATEGORY_LABELS,
  COMPLAINT_LABELS,
  FIELD_LABELS,
  FIELD_SOURCE_LABELS,
  formatEur,
  formatNumber,
  PLATFORM_LABELS,
  RECOMMENDATION_LABELS,
} from "@/lib/domain/labels";
import { LISTING_FIELDS, type AnalysisReport, type FieldSource, type ListingFieldKey } from "@/lib/domain/schemas";
import { cn } from "@/lib/utils";
import { CopyBlock, EvidenceBadge, EvidenceImage, PriceGauge, PriceRatingBadge, SeverityBadge, SourceBadge, SubScoreCard } from "./parts";
import { ScoreRing } from "./score-ring";

const SECTIONS = [
  { id: "overview", label: "Übersicht", icon: Gauge },
  { id: "price", label: "Preis", icon: Banknote },
  { id: "product", label: "Produkt", icon: ImageIcon },
  { id: "risks", label: "Risiken", icon: AlertTriangle },
  { id: "seller", label: "Verkäufer", icon: Users },
  { id: "payment", label: "Bezahlung", icon: ShieldCheck },
  { id: "checklist", label: "Checkliste", icon: ListChecks },
  { id: "messages", label: "Nachricht & Verhandlung", icon: MessageSquareText },
  { id: "data", label: "Angaben & Quellen", icon: FileText },
  { id: "method", label: "Ablauf", icon: Workflow },
] as const;

const REC_TONE = { interesting: "good", inspect_further: "accent", elevated_risk: "bad", missing_info: "warn" } as const;

function Section({ id, title, icon: Icon, children, aside }: { id: string; title: string; icon: typeof Gauge; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24" aria-labelledby={`${id}-h`}>
      <Card className="p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id={`${id}-h`} className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2">
              <Icon className="size-4" />
            </span>
            {title}
          </h2>
          {aside}
        </div>
        {children}
      </Card>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">{children}</p>;
}

export function ReportView({ report, imageBase, pdfUrl }: { report: AnalysisReport; imageBase?: string; pdfUrl?: string }) {
  const { listing, market, product, score, dataQuality, seller } = report;
  const img = (ref?: string) => (!ref ? undefined : ref.startsWith("/") ? ref : `${imageBase ?? "/api/uploads/"}${ref}`);
  const title = listing.title ?? ([listing.brand, listing.model].filter(Boolean).join(" ") || "Angebot");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"questionsForSeller" | "inspection" | "documents" | "expensiveDamages">("questionsForSeller");

  const visible = product.imageFindings.filter((f) => f.evidenceLevel === "visible");
  const possible = product.imageFindings.filter((f) => f.evidenceLevel === "possible");
  const unverifiable = product.imageFindings.filter((f) => f.evidenceLevel === "unverifiable");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {report.isDemo && (
        <div className="demo-stripes mb-6 rounded-2xl border border-demo/30 px-4 py-3 text-sm">
          <p className="font-semibold text-demo">Demo-Bericht – alle Daten sind fiktiv</p>
          <p className="text-foreground/80">Preise, Bilder, Bewertungen und Befunde dienen nur der Veranschaulichung. Die Bewertungslogik (Marktwert, Risiken, Score) ist die echte Engine.</p>
        </div>
      )}
      {report.mode === "rules_only" && (
        <Alert tone="info" title="Regelbasierte Analyse" className="mb-6">
          Es war kein KI-Provider aktiv. Bilder wurden nicht automatisch ausgewertet; alle Ergebnisse stammen aus deinen Angaben und der Regelprüfung.
        </Alert>
      )}

      <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-8">
        {/* Navigation */}
        <nav className="sticky top-16 z-30 -mx-4 mb-6 overflow-x-auto border-b border-border bg-background/90 px-4 py-2 backdrop-blur lg:top-24 lg:mx-0 lg:h-fit lg:border-0 lg:bg-transparent lg:p-0" aria-label="Berichtsabschnitte">
          <ul className="flex gap-1 lg:flex-col">
            {SECTIONS.filter((s) => s.id !== "seller" || seller).map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-foreground">
                  <s.icon className="size-4" /> {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          {/* Übersicht */}
          <section id="overview" className="scroll-mt-24">
            <Card className="overflow-hidden">
              <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-1.5">
                    {report.isDemo && <Badge tone="demo">Demo</Badge>}
                    <Badge>{PLATFORM_LABELS[listing.platform]}</Badge>
                    <Badge>{CATEGORY_LABELS[listing.category]}</Badge>
                    <Badge tone={report.mode === "live_ai" ? "accent" : "neutral"}>
                      {report.mode === "live_ai" ? "KI-Analyse" : report.mode === "demo" ? "Beispiel" : "Regelanalyse"}
                    </Badge>
                  </div>
                  <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <p className="tabular text-2xl font-semibold">{formatEur(listing.priceEur)}</p>
                    <PriceRatingBadge rating={market.rating} />
                  </div>
                  <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-foreground/85">{report.summary}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Badge tone={REC_TONE[score.recommendation]} className="px-3 py-1.5 text-sm">
                      {score.recommendation === "interesting" ? <CheckCircle2 /> : <AlertTriangle />} {RECOMMENDATION_LABELS[score.recommendation]}
                    </Badge>
                    {pdfUrl && (
                      <Button asChild variant="outline" size="sm">
                        <a href={pdfUrl} target="_blank" rel="noopener">
                          <Download /> PDF-Bericht
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 md:pl-4">
                  <ScoreRing score={score.overall} size={148} />
                  <p className="text-xs text-muted">Deal-Score</p>
                </div>
              </div>
              <div className="grid gap-3 border-t border-border bg-surface-2/40 p-5 sm:grid-cols-2 sm:p-7 xl:grid-cols-4">
                <SubScoreCard title="Preis" sub={score.price} />
                <SubScoreCard title="Produkt" sub={score.product} delay={0.05} />
                <SubScoreCard title="Verkäufer" sub={score.seller} delay={0.1} />
                <SubScoreCard title="Plausibilität" sub={score.plausibility} delay={0.15} />
              </div>
              <div className="grid gap-5 border-t border-border p-5 sm:p-7 md:grid-cols-[1fr_1.3fr]">
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-medium">Datenqualität</p>
                    <p className="tabular text-sm text-muted">{dataQuality.score} / 100</p>
                  </div>
                  <Progress value={dataQuality.score} className="mt-2" tone={dataQuality.level === "high" ? "good" : dataQuality.level === "medium" ? "accent" : "warn"} />
                  <p className="mt-2 text-sm text-muted">{dataQuality.uncertainty}</p>
                </div>
                <div className="text-sm">
                  <p className="font-medium">Wie der Score entsteht</p>
                  <p className="mt-1 text-muted">{score.explanation}</p>
                  {score.caps.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {score.caps.map((c) => (
                        <li key={c}>
                          <Badge tone="warn">{c}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          </section>

          {/* Preis */}
          <Section id="price" title="Marktpreisanalyse" icon={Banknote} aside={<PriceRatingBadge rating={market.rating} />}>
            {market.status === "ok" && market.range ? (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat label="Angebotspreis" value={formatEur(market.offerPriceEur)} />
                  <Stat label="Geschätzter Marktwert" value={`${formatEur(market.range.low)} – ${formatEur(market.range.high)}`} />
                  <Stat label="Abweichung zum Mittelwert" value={market.deviationPct != null ? `${market.deviationPct > 0 ? "+" : ""}${market.deviationPct} %` : "–"} />
                </div>
                <PriceGauge market={market} />
                <p className="text-sm text-foreground/85">{market.explanation}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <MiniStat label="Vergleichsangebote" value={String(market.comparables.used)} />
                  <MiniStat label="davon Verkaufspreise" value={String(market.comparables.soldPrices)} />
                  <MiniStat label="Ausreißer entfernt" value={String(market.comparables.excluded)} />
                  <MiniStat label="Datenqualität" value={{ high: "Hoch", medium: "Mittel", low: "Gering", none: "–" }[market.comparables.quality]} />
                </div>
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer font-medium">Methode & Anpassungen</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                    <li>{market.method}</li>
                    {market.adjustments.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                    <li>Quellen: {market.comparables.sources.join(", ") || "–"}</li>
                  </ul>
                </details>
              </>
            ) : (
              <div className="rounded-xl bg-surface-2/60 p-5">
                <p className="font-semibold">Marktwert derzeit nicht verlässlich bestimmbar</p>
                <p className="mt-1 text-sm text-muted">{market.explanation}</p>
                <p className="mt-3 text-xs text-muted">
                  Kaufklar erfindet keine Marktpreise. Ein Marktwert wird nur aus echten Vergleichsdaten berechnet – entweder von einem angebundenen Marktdatenanbieter oder aus Vergleichsangeboten, die du selbst hinterlegst.
                </p>
              </div>
            )}
          </Section>

          {/* Produkt */}
          <Section id="product" title="Produkt, Bilder & Schwachstellen" icon={ImageIcon}>
            {product.conditionSummary && <p className="mb-5 text-[15px] text-foreground/85">{product.conditionSummary}</p>}
            <div className="space-y-6">
              <FindingGroup title="Sichtbar belegte Auffälligkeiten" findings={visible} img={img} />
              <FindingGroup title="Mögliche Auffälligkeiten" findings={possible} img={img} />
              <FindingGroup title="Nicht überprüfbar" findings={unverifiable} img={img} />
              {product.imageFindings.length === 0 && (
                <Empty>{report.mode === "rules_only" ? "Keine Bildanalyse durchgeführt (kein KI-Provider aktiv)." : "Keine Auffälligkeiten auf den Bildern erkannt. Das ist keine Garantie für einen mangelfreien Zustand."}</Empty>
              )}
              {product.missingViews.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Fehlende Ansichten – beim Verkäufer anfragen</h3>
                  <ul className="flex flex-wrap gap-2">
                    {product.missingViews.map((v) => (
                      <li key={v}>
                        <Badge>{v}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="mb-3 text-sm font-semibold">Bekannte Schwachstellen</h3>
                {product.weaknesses.length === 0 ? (
                  <Empty>Für diese Variante liegen keine geprüften Einträge in der Wissensdatenbank vor.</Empty>
                ) : (
                  <ul className="space-y-3">
                    {product.weaknesses.map((w) => (
                      <li key={w.id} className="rounded-xl border border-border p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{w.title}</p>
                          <SeverityBadge severity={w.severity} />
                          <SourceBadge claim={w.claim} />
                        </div>
                        <p className="mt-1.5 text-sm text-foreground/85">{w.detail}</p>
                        <p className="mt-1 text-xs text-muted">Gilt für: {w.appliesTo}</p>
                        {w.checkAdvice && <p className="mt-2 text-sm"><span className="font-medium">Prüfen:</span> {w.checkAdvice}</p>}
                        {w.claim.source.url && (
                          <a href={w.claim.source.url} className="mt-1 inline-block text-xs text-accent underline" target="_blank" rel="noopener noreferrer">
                            Quelle ansehen
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {product.authenticity?.applicable && (
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <BadgeCheck className="size-4" /> Echtheitsmerkmale
                  </h3>
                  {product.authenticity.checkedFeatures.length > 0 && (
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {product.authenticity.checkedFeatures.map((f) => (
                        <li key={f.feature} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium">{f.feature}</p>
                            <p className="text-xs text-muted">{f.note}</p>
                          </div>
                          <Badge tone={f.status === "consistent" ? "good" : f.status === "conspicuous" ? "warn" : "neutral"}>
                            {f.status === "consistent" ? "Unauffällig" : f.status === "conspicuous" ? "Auffällig" : "Nicht überprüfbar"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Alert tone="warn" className="mt-3">
                    {product.authenticity.recommendation}
                  </Alert>
                </div>
              )}
              {product.notes.map((n) => (
                <Alert key={n} tone="warn">{n}</Alert>
              ))}
            </div>
          </Section>

          {/* Risiken */}
          <Section id="risks" title="Betrugs- & Plausibilitätsprüfung" icon={AlertTriangle} aside={<Badge>{report.risks.length} Hinweise</Badge>}>
            {report.risks.length === 0 ? (
              <Empty>Die Regelprüfung hat keine Auffälligkeiten gefunden. Das ist keine Garantie.</Empty>
            ) : (
              <ul className="space-y-3">
                {report.risks.map((r) => (
                  <li key={r.id} className={cn("rounded-xl border p-4", r.severity === "high" ? "border-bad/40 bg-bad-soft/40" : "border-border")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={r.severity} />
                      <p className="font-medium">{r.title}</p>
                    </div>
                    <p className="mt-1.5 text-sm text-foreground/85">{r.explanation}</p>
                    {r.evidence.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-muted">
                        {r.evidence.map((e) => (
                          <li key={e} className="flex gap-1.5">
                            <span aria-hidden>›</span> {e}
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.caveat && <p className="mt-2 text-xs font-medium text-info">{r.caveat}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Verkäufer */}
          {seller && (
            <Section id="seller" title="Verkäuferanalyse" icon={Users}>
              <div className="grid gap-3 sm:grid-cols-4">
                <MiniStat label="Erkannte Bewertungen" value={String(seller.visibleReviewCount)} />
                <MiniStat label="Positiv" value={String(seller.positive)} tone="good" />
                <MiniStat label="Neutral" value={String(seller.neutral)} />
                <MiniStat label="Negativ" value={String(seller.negative)} tone="bad" />
              </div>
              {seller.visibleReviewCount > 0 && (
                <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className="bg-good" style={{ width: `${(seller.positive / seller.visibleReviewCount) * 100}%` }} />
                  <div className="bg-warn" style={{ width: `${(seller.neutral / seller.visibleReviewCount) * 100}%` }} />
                  <div className="bg-bad" style={{ width: `${(seller.negative / seller.visibleReviewCount) * 100}%` }} />
                </div>
              )}
              <p className="mt-3 text-sm text-muted">{seller.coverageNote}{seller.duplicatesRemoved > 0 && ` ${seller.duplicatesRemoved} Duplikate entfernt.`}</p>
              <p className="mt-4 text-[15px]">{seller.summary}</p>
              {seller.complaints.length > 0 && (
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-semibold">Beschwerdethemen (Aussagen anderer Käufer)</h3>
                  <ul className="space-y-2">
                    {seller.complaints.map((c) => (
                      <li key={c.category} className="rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{COMPLAINT_LABELS[c.category]}</p>
                          <Badge>{c.count}×</Badge>
                        </div>
                        {c.examples.map((e) => (
                          <blockquote key={e.text} className="mt-2 border-l-2 border-border pl-3 text-sm italic text-muted">„{e.text}“</blockquote>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {seller.patterns.length > 0 && (
                <div className="mt-5 space-y-2">
                  <h3 className="text-sm font-semibold">Auffällige Muster</h3>
                  {seller.patterns.map((p) => (
                    <Alert key={p.title} tone="info" title={p.title}>{p.detail}</Alert>
                  ))}
                </div>
              )}
              {seller.trustSignals.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {seller.trustSignals.map((t) => (
                    <li key={t}>
                      <Badge tone="good"><Star /> {t}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-5 text-xs text-muted">{seller.disclaimer}</p>
            </Section>
          )}

          {/* Bezahlung */}
          <Section id="payment" title="Sichere Bezahlung & Übergabe" icon={ShieldCheck}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {report.payment.map((p) => (
                <li key={p.id} className={cn("rounded-xl border p-4", p.kind === "avoid" ? "border-bad/30 bg-bad-soft/30" : p.kind === "recommended" ? "border-good/30 bg-good-soft/30" : "border-border")}>
                  <p className="text-sm font-semibold">{p.title}</p>
                  <p className="mt-1 text-sm text-foreground/80">{p.detail}</p>
                </li>
              ))}
            </ul>
          </Section>

          {/* Checkliste */}
          <Section id="checklist" title="Deine persönliche Checkliste" icon={ClipboardList}>
            <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1" role="tablist">
              {(
                [
                  ["questionsForSeller", "Fragen an den Verkäufer"],
                  ["inspection", "Bei der Besichtigung"],
                  ["documents", "Dokumente"],
                  ["expensiveDamages", "Teure Schäden"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm transition", tab === k ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground")}
                >
                  {l}
                </button>
              ))}
            </div>
            <ul className="space-y-1.5" role="tabpanel">
              {report.checklist[tab].map((item) => {
                const key = `${tab}:${item}`;
                return (
                  <li key={key}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-surface-2/70">
                      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={!!checked[key]} onChange={(e) => setChecked((c) => ({ ...c, [key]: e.target.checked }))} />
                      <span className={cn("text-[15px]", checked[key] && "text-muted line-through")}>{item}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* Nachricht & Verhandlung */}
          <Section id="messages" title="Nachricht an den Verkäufer & Preisverhandlung" icon={MessageSquareText}>
            {report.sellerMessage && (
              <>
                <h3 className="mb-2 text-sm font-semibold">Höfliche Anfrage</h3>
                <CopyBlock text={report.sellerMessage} />
              </>
            )}
            <h3 className="mb-2 mt-6 text-sm font-semibold">Sachliche Preisverhandlung</h3>
            {report.negotiation.possible ? (
              <>
                <ul className="mb-3 space-y-2">
                  {report.negotiation.arguments.map((a) => (
                    <li key={a.text} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                      <span>
                        {a.text} <span className="text-xs text-muted">({a.basis})</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {report.negotiation.suggestedOpeningEur && (
                  <p className="mb-3 text-sm">
                    Orientierung für ein erstes Angebot: <span className="tabular font-semibold">{formatEur(report.negotiation.suggestedOpeningEur)}</span>
                  </p>
                )}
                {report.negotiation.message && <CopyBlock text={report.negotiation.message} />}
              </>
            ) : null}
            <p className="mt-3 text-xs text-muted">{report.negotiation.note}</p>
          </Section>

          {/* Angaben & Quellen */}
          <Section id="data" title="Erkannte Angaben & Herkunft" icon={FileText}>
            <dl className="divide-y divide-border rounded-xl border border-border">
              {LISTING_FIELDS.filter((f) => f !== "description" && listing[f as ListingFieldKey] != null && listing[f as ListingFieldKey] !== "").map((f) => {
                const v = listing[f as ListingFieldKey];
                const src = listing.provenance[f] as FieldSource | undefined;
                const display = typeof v === "number" ? (f === "priceEur" ? formatEur(v) : f === "mileageKm" ? `${formatNumber(v)} km` : f === "year" ? String(v) : formatNumber(v)) : String(v);
                return (
                  <div key={f} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[200px_1fr_auto]">
                    <dt className="text-sm text-muted">{FIELD_LABELS[f as ListingFieldKey]}</dt>
                    <dd className="col-start-1 text-sm font-medium sm:col-start-2">{display}</dd>
                    <dd className="col-start-2 row-span-2 row-start-1 self-center sm:col-start-3 sm:row-span-1">
                      {src && <Badge tone={src === "user" ? "accent" : src === "demo" ? "demo" : src === "ai_extraction" ? "warn" : "neutral"}>{FIELD_SOURCE_LABELS[src]}</Badge>}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {listing.description && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium">Beschreibungstext</summary>
                <p className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-2/60 p-4 text-sm">{listing.description}</p>
              </details>
            )}
            {report.missingInfo.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">Fehlende Angaben</h3>
                <ul className="space-y-1.5 text-sm">
                  {report.missingInfo.map((m) => (
                    <li key={m.field} className="flex items-center justify-between gap-3">
                      <span>{m.question}</span>
                      <Badge tone={m.importance === "critical" ? "bad" : m.importance === "important" ? "warn" : "neutral"}>
                        {m.importance === "critical" ? "Wichtig" : m.importance === "important" ? "Relevant" : "Hilfreich"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.vehicleHistory && (
              <div className="mt-6 rounded-xl border border-border p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <CarFront className="size-4" /> Fahrzeughistorie (Zusatzleistung)
                  {report.vehicleHistory.status === "demo" && <Badge tone="demo">Demo</Badge>}
                </p>
                <p className="mt-1 text-sm text-muted">{report.vehicleHistory.note}</p>
                {report.vehicleHistory.entries.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {report.vehicleHistory.entries.map((e) => (
                      <li key={e.date + e.event} className="flex justify-between gap-3">
                        <span>{e.date} · {e.event}</span>
                        {e.mileageKm != null && <span className="tabular text-muted">{formatNumber(e.mileageKm)} km</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Section>

          {/* Ablauf */}
          <Section id="method" title="Analyse-Ablauf & Transparenz" icon={Workflow}>
            <ol className="space-y-2">
              {report.pipeline.map((s, i) => (
                <li key={`${s.step}-${i}`} className="flex items-start justify-between gap-3 text-sm">
                  <span className="flex items-start gap-2.5">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", { ok: "bg-good", partial: "bg-warn", skipped: "bg-border", failed: "bg-bad" }[s.status])} />
                    <span>
                      {s.label}
                      {s.note && <span className="block text-xs text-muted">{s.note}</span>}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{{ ok: "erledigt", partial: "teilweise", skipped: "übersprungen", failed: "fehlgeschlagen" }[s.status]}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex gap-2.5 rounded-xl bg-surface-2/60 p-4 text-xs text-muted">
              <Info className="size-4 shrink-0" />
              <p>{report.disclaimer}</p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2/60 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("tabular text-lg font-semibold", tone === "good" && "text-good", tone === "bad" && "text-bad")}>{value}</p>
    </div>
  );
}

function FindingGroup({ title, findings, img }: { title: string; findings: AnalysisReport["product"]["imageFindings"]; img: (r?: string) => string | undefined }) {
  if (findings.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <ul className="grid gap-3 sm:grid-cols-2">
        {findings.map((f) => {
          const src = img(f.imageRef);
          return (
            <li key={f.id} className="overflow-hidden rounded-xl border border-border">
              {src && <EvidenceImage src={src} box={f.box} alt={`Beleg: ${f.title}`} />}
              <div className="p-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <EvidenceBadge level={f.evidenceLevel} />
                  <SourceBadge claim={f.claim} />
                </div>
                <p className="mt-2 text-sm font-medium">{f.title}</p>
                <p className="mt-0.5 text-sm text-muted">{f.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
