"use client";

import {
  AlertTriangle,
  Banknote,
  ChevronDown,
  ClipboardList,
  Download,
  FileText,
  ImageIcon,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  COMPLAINT_LABELS,
  FIELD_LABELS,
  FIELD_SOURCE_LABELS,
  formatEur,
  formatNumber,
  PLATFORM_LABELS,
  PRICE_RATING_LABELS,
  RECOMMENDATION_LABELS,
} from "@/lib/domain/labels";
import { LISTING_FIELDS, type AnalysisReport, type FieldSource, type ListingFieldKey, type SubScore } from "@/lib/domain/schemas";
import { cn } from "@/lib/utils";
import { CopyBlock, EvidenceBadge, EvidenceImage, SeverityBadge, SourceBadge } from "./parts";
import { ComparablesTable } from "./comparables-table";
import { PriceScale } from "./price-scale";
import { ReportAssistant } from "./report-assistant";
import { SellerAddon } from "./seller-addon";
import { ScoreBox, scoreTone, toTen } from "./score-ring";
import dynamic from "next/dynamic";
import { modelForListing } from "@/components/home/model-choice";

const ModelViewer = dynamic(() => import("./model-viewer").then((m) => m.ModelViewer), { ssr: false });

type SectionId = "price" | "product" | "weak" | "risks" | "seller" | "payment" | "checklist" | "messages" | "data" | "method";

/** Erster Satz eines Textes – für das Kurzfazit. */
function firstSentence(s: string): string {
  const clean = s.replace(/^Demo:\s*/, "");
  const m = clean.match(/^.+?[.!?](\s|$)/);
  return (m ? m[0] : clean).trim();
}

const TONE_DOT = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", neutral: "bg-border" } as const;

function Tile({ title, icon: Icon, value, sub, tone, onClick }: { title: string; icon: typeof Banknote; value: string; sub?: string; tone: keyof typeof TONE_DOT; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-3.5 text-left transition active:scale-[0.98] hover:border-accent/50">
      <span className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5" /> {title}
        </span>
        <span className={cn("size-2.5 rounded-full", TONE_DOT[tone])} />
      </span>
      <span className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug">{value}</span>
      {sub && <span className="mt-0.5 truncate text-xs text-muted">{sub}</span>}
    </button>
  );
}

function Accordion({ id, title, icon: Icon, open, onToggle, badge, children }: { id: SectionId; title: string; icon: typeof Banknote; open: boolean; onToggle: () => void; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={`s-${id}`} className="scroll-mt-20 overflow-hidden rounded-2xl border border-border bg-surface">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
          <Icon className="size-4" />
        </span>
        <span className="flex-1 font-semibold">{title}</span>
        {badge}
        <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
            <div className="border-t border-border px-4 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function MiniScore({ label, sub }: { label: string; sub: SubScore }) {
  const tone = scoreTone(sub.score);
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface-2/70 px-3 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className={cn("tabular rounded-md px-2 py-0.5 font-semibold", tone === "good" && "bg-good text-white", tone === "warn" && "bg-warn text-[oklch(0.18_0.03_60)]", tone === "bad" && "bg-bad text-white", tone === "neutral" && "text-muted")}>
        {toTen(sub.score)}
      </span>
    </div>
  );
}

export function ReportView({
  report,
  imageBase,
  pdfUrl,
  analysisId,
  assistant,
  previous,
  akte,
}: {
  report: AnalysisReport;
  imageBase?: string;
  pdfUrl?: string;
  analysisId?: string;
  assistant?: { initial: { q: string; a: string; at: string; grounded: boolean }[]; limit: number; aiAvailable: boolean };
  previous?: { id: string; createdAt: string; priceEur?: number };
  /** V4: Kaufakte (Chat, Besichtigung, Kosten, Preisverlauf, Bilder) */
  akte?: React.ReactNode;
}) {
  const { listing, market, product, score, seller } = report;
  const img = (ref?: string) => (!ref ? undefined : ref.startsWith("/") ? ref : `${imageBase ?? "/api/uploads/"}${ref}`);
  const title = (listing.title ?? ([listing.brand, listing.model].filter(Boolean).join(" ") || "Angebot")).replace(/\s*\(Demo\)$/, "");
  const [open, setOpen] = useState<Partial<Record<SectionId, boolean>>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggle = (id: SectionId) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const jump = (id: SectionId) => {
    setOpen((o) => ({ ...o, [id]: true }));
    setTimeout(() => document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const cmpId = analysisId ?? (report.isDemo ? `demo:${report.id.replace(/^demo_/, "")}` : undefined);
  const heroImg = img(listing.images.find((i) => i.kind === "product_photo")?.ref ?? listing.images[0]?.ref);
  // Ohne Produktfoto: passendes 3D-Symbolbild (z. B. Karosserieform)
  const heroModel = !listing.images.some((i) => i.kind === "product_photo") ? modelForListing(listing.category, [listing.title, listing.brand, listing.model, listing.variant].filter(Boolean).join(" ")) : null;
  const stale = !report.isDemo && Date.now() - Date.parse(market.collectedAt) > 30 * 864e5;
  const visit =
    score.recommendation === "interesting"
      ? { t: "Ja – Besichtigung lohnt sich", d: "Die Prüfung ergab keine wesentlichen Warnsignale. Kläre die offenen Punkte und prüfe vor Ort.", tone: "good" as const }
      : score.recommendation === "inspect_further"
        ? { t: "Ja, aber gut vorbereitet", d: "Kläre die Punkte unten vorab mit dem Verkäufer und prüfe vor Ort gezielt.", tone: "warn" as const }
        : score.recommendation === "elevated_risk"
          ? { t: "Nur mit großer Vorsicht", d: "Es gibt deutliche Warnsignale. Keine Anzahlung, nur persönliche Übergabe mit Prüfung.", tone: "bad" as const }
          : { t: "Erst Informationen einholen", d: "Für eine Empfehlung fehlen wichtige Angaben. Frag den Verkäufer zuerst danach.", tone: "neutral" as const };
  const fairPrice =
    market.status === "ok" && market.range
      ? report.negotiation.suggestedOpeningEur
        ? `Verhandlungsziel ca. ${formatEur(report.negotiation.suggestedOpeningEur)} – Markt ${formatEur(market.range.low, { compact: true })}–${formatEur(market.range.high, { compact: true })}`
        : `Marktbereich ${formatEur(market.range.low, { compact: true })}–${formatEur(market.range.high, { compact: true })}`
      : "Ohne Marktdaten keine verlässliche Preisaussage";
  const phases = [
    { key: "before", label: "Vor der Besichtigung klären", items: report.checklist.questionsForSeller.slice(0, 6) },
    { key: "visit", label: "Bei der Besichtigung prüfen", items: report.checklist.inspection.slice(0, 7) },
    {
      key: "pay",
      label: "Vor der Bezahlung erledigen",
      items: [...report.checklist.documents.slice(0, 4).map((d) => `Vorlegen lassen: ${d}`), ...report.payment.filter((p) => p.kind === "avoid" || p.kind === "documents").map((p) => p.title)].slice(0, 7),
    },
  ];
  const seriousRisks = report.risks.filter((r) => r.severity === "high" || r.severity === "medium");
  const visibleFindings = product.imageFindings.filter((f) => f.evidenceLevel === "visible" && f.severity !== "info");

  // Kacheln
  const priceTone = market.rating === "insufficient_data" ? "neutral" : market.rating === "well_above" ? "bad" : market.rating === "rather_expensive" ? "warn" : "good";
  const riskTone = report.risks.some((r) => r.severity === "high") ? "bad" : seriousRisks.length ? "warn" : "good";

  // „Worauf achten“ – maximal 3 Punkte, wichtigstes zuerst
  const watch: string[] = [];
  for (const r of report.risks.filter((r) => r.severity !== "info" && r.area !== "information")) watch.push(r.title);
  for (const w of product.weaknesses) watch.push(w.checkAdvice ?? w.title);
  for (const f of visibleFindings) watch.push(f.title);
  if (product.missingViews.length) watch.push(`Fehlende Fotos anfragen: ${product.missingViews.slice(0, 2).join(", ")}`);
  const top3 = [...new Set(watch)].slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:py-8">
      {report.isDemo && (
        <div className="demo-stripes mb-4 rounded-xl border border-demo/30 px-3 py-2 text-xs">
          <span className="font-semibold text-demo">Demo</span> <span className="text-muted">– alle Daten sind fiktiv, die Bewertungslogik ist echt.</span>
        </div>
      )}

      {previous && (
        <a href={`/analysis/${previous.id}`} className="mb-4 block rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted hover:border-accent/50">
          Frühere Prüfung dieses Inserats vom {new Date(previous.createdAt).toLocaleDateString("de-DE")}
          {previous.priceEur != null && <> · Preis damals {formatEur(previous.priceEur)}</>} – ansehen
        </a>
      )}

      {/* Urteil */}
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
        {heroModel && <ModelViewer model={heroModel} className="h-44 bg-gradient-to-b from-surface-2/70 to-surface sm:h-56" />}
        {!heroModel && heroImg && (
          <div className="relative h-40 bg-surface-2 sm:h-52">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImg} alt="" className="size-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />
          </div>
        )}
        <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <ScoreBox score={score.overall} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted">
              {PLATFORM_LABELS[listing.platform]} · {CATEGORY_LABELS[listing.category]}
            </p>
            <h1 className="mt-1 line-clamp-2 text-lg font-semibold leading-snug tracking-tight sm:text-xl">{title}</h1>
            <p className="tabular mt-1 text-xl font-bold">{formatEur(listing.priceEur)}</p>
            <Badge
              tone={score.recommendation === "interesting" ? "good" : score.recommendation === "elevated_risk" ? "bad" : score.recommendation === "missing_info" ? "neutral" : "accent"}
              className="mt-2"
            >
              {RECOMMENDATION_LABELS[score.recommendation]}
            </Badge>
          </div>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed">{firstSentence(report.summary)}</p>
        <div className="mt-5 rounded-2xl bg-surface-2/60 p-3.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Preis-Check</p>
          <PriceScale market={market} />
        </div>
        {report.mode === "rules_only" && <p className="mt-2 text-xs text-muted">Ohne KI-Bildanalyse erstellt.</p>}
        </div>
      </div>

      {/* Auf einen Blick */}
      <h2 className="mb-2.5 mt-6 text-sm font-semibold text-muted">Auf einen Blick</h2>
      <div className="grid grid-cols-2 gap-2.5">
        <Tile
          title="Preis"
          icon={Banknote}
          tone={priceTone}
          value={PRICE_RATING_LABELS[market.rating]}
          sub={market.range ? `Markt ${formatEur(market.range.low, { compact: true })}–${formatEur(market.range.high, { compact: true })}` : "Kein Marktwert"}
          onClick={() => jump("price")}
        />
        <Tile
          title="Zustand"
          icon={ImageIcon}
          tone={scoreTone(score.product.score)}
          value={score.product.score == null ? "Nicht bewertbar" : score.product.label}
          sub={visibleFindings.length ? `${visibleFindings.length} sichtbare Auffälligkeit${visibleFindings.length > 1 ? "en" : ""}` : product.weaknesses.length ? `${product.weaknesses.length} Prüfpunkt(e)` : "Keine Auffälligkeiten"}
          onClick={() => jump("product")}
        />
        <Tile
          title="Risiken"
          icon={AlertTriangle}
          tone={riskTone}
          value={seriousRisks.length ? `${seriousRisks.length} Warnhinweis${seriousRisks.length > 1 ? "e" : ""}` : "Keine Warnsignale"}
          sub={seriousRisks[0]?.title}
          onClick={() => jump("risks")}
        />
        <Tile
          title="Verkäufer"
          icon={Users}
          tone={seller ? scoreTone(score.seller.score) : "neutral"}
          value={seller ? score.seller.label : "Nicht geprüft"}
          sub={seller ? `${seller.positive}👍 · ${seller.negative}👎 von ${seller.visibleReviewCount}` : "Im Komplettcheck möglich"}
          onClick={() => (seller ? jump("seller") : undefined)}
        />
      </div>

      {/* Kaufempfehlung */}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Lohnt sich eine Besichtigung?</p>
        <p className={cn("mt-1 text-lg font-bold", visit.tone === "good" && "text-good", visit.tone === "warn" && "text-warn", visit.tone === "bad" && "text-bad")}>{visit.t}</p>
        <p className="mt-0.5 text-sm text-muted">{visit.d}</p>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2/70 px-3 py-2.5 text-sm">
          <Banknote className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            <span className="font-semibold">Realistischer Preis: </span>
            {fairPrice}
          </span>
        </div>
        {stale && <p className="mt-2 text-xs text-warn">Marktdaten vom {new Date(market.collectedAt).toLocaleDateString("de-DE")} – möglicherweise veraltet.</p>}
      </div>

      {/* Worauf achten */}
      {top3.length > 0 && (
        <div className="mt-6 rounded-2xl border border-accent/40 bg-accent-soft/40 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-accent" /> Worauf du achten musst
          </h2>
          <ol className="mt-2.5 space-y-2">
            {top3.map((t, i) => (
              <li key={t} className="flex gap-2.5 text-[15px] leading-snug">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4 flex gap-2.5">
        <Button className="flex-1" onClick={() => jump("messages")}>
          <MessageSquareText /> Nachricht an Verkäufer
        </Button>
        {pdfUrl && (
          <Button asChild variant="outline" size="icon" className="size-11">
            <a href={pdfUrl} target="_blank" rel="noopener" aria-label="PDF-Bericht">
              <Download />
            </a>
          </Button>
        )}
      </div>

      {analysisId && assistant && (
        <div className="mt-6">
          <ReportAssistant analysisId={analysisId} initial={assistant.initial} limit={assistant.limit} category={listing.category} aiAvailable={assistant.aiAvailable} />
        </div>
      )}

      {akte}

      {/* Details */}
      <h2 className="mb-2.5 mt-8 text-sm font-semibold text-muted">Details</h2>
      <div className="space-y-2.5">
        <Accordion id="price" title="Preis" icon={Banknote} open={!!open.price} onToggle={() => toggle("price")} badge={<MiniBadge text={toTen(score.price.score)} tone={scoreTone(score.price.score)} />}>
          {market.status === "ok" && market.range ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <KV k="Angebot" v={formatEur(market.offerPriceEur)} />
                <KV k="Marktwert" v={`${formatEur(market.range.low, { compact: true })} – ${formatEur(market.range.high, { compact: true })}`} />
              </div>
              <p className="text-sm text-muted">
                {market.deviationPct != null && `${market.deviationPct > 0 ? "+" : ""}${market.deviationPct} % zum Mittelwert · `}
                {market.comparables.used} Vergleiche ({market.comparables.soldPrices} echte Verkäufe)
              </p>
              <ComparablesTable market={market} />
            </>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-semibold">Marktwert derzeit nicht verlässlich bestimmbar.</span>{" "}
                <span className="text-muted">Zu wenige echte Vergleichsdaten – wir erfinden keine Preise.</span>
              </p>
              {market.samples.length > 0 && <ComparablesTable market={market} />}
            </>
          )}
        </Accordion>

        <Accordion id="product" title="Zustand & Bilder" icon={ImageIcon} open={!!open.product} onToggle={() => toggle("product")} badge={<MiniBadge text={toTen(score.product.score)} tone={scoreTone(score.product.score)} />}>
          {product.conditionSummary && <p className="mb-3 text-sm">{product.conditionSummary}</p>}
          {product.imageFindings.length > 0 ? (
            <ul className="space-y-3">
              {product.imageFindings.map((f) => {
                const src = img(f.imageRef);
                return (
                  <li key={f.id} className="overflow-hidden rounded-xl border border-border">
                    {src && <EvidenceImage src={src} box={f.box} alt={`Beleg: ${f.title}`} />}
                    <div className="p-3">
                      <EvidenceBadge level={f.evidenceLevel} />
                      <p className="mt-1.5 text-sm font-medium">{f.title}</p>
                      <p className="text-sm text-muted">{f.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">{report.mode === "rules_only" ? "Keine Bildanalyse (KI nicht aktiv)." : "Keine Auffälligkeiten auf den Bildern erkannt."}</p>
          )}
          {product.missingViews.length > 0 && <p className="mt-3 text-sm text-muted">Fehlende Fotos: {product.missingViews.join(", ")}</p>}
          {product.authenticity?.applicable && <p className="mt-3 rounded-xl bg-accent-soft/50 p-3 text-sm">{product.authenticity.recommendation}</p>}
        </Accordion>

        <Accordion id="weak" title="Technische Schwachstellen" icon={Wrench} open={!!open.weak} onToggle={() => toggle("weak")} badge={<MiniBadge text={String(product.weaknesses.length)} tone={product.weaknesses.some((w) => w.severity === "high") ? "warn" : "neutral"} />}>
          {product.weaknesses.length === 0 ? (
            <p className="text-sm text-muted">Für diese Variante liegen keine geprüften Einträge vor. Wir nennen bewusst keine unbelegten Schwachstellen.</p>
          ) : (
            <ul className="space-y-2">
              {product.weaknesses.map((w) => (
                <li key={w.id} className="rounded-xl bg-surface-2/70 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{w.title}</span>
                    <SourceBadge claim={w.claim} />
                  </div>
                  <p className="mt-1 text-muted">{w.detail}</p>
                  <p className="mt-1 text-xs text-muted">Gilt für: {w.appliesTo}</p>
                  {w.checkAdvice && <p className="mt-1"><span className="font-medium">Prüfen:</span> {w.checkAdvice}</p>}
                </li>
              ))}
            </ul>
          )}
        </Accordion>

        <Accordion id="risks" title="Betrugs- & Plausibilitätsrisiken" icon={AlertTriangle} open={!!open.risks} onToggle={() => toggle("risks")} badge={<MiniBadge text={String(report.risks.length)} tone={riskTone} />}>
          {report.risks.length === 0 ? (
            <p className="text-sm text-muted">Keine Auffälligkeiten – das ist keine Garantie.</p>
          ) : (
            <ul className="space-y-2.5">
              {report.risks.map((r) => (
                <li key={r.id} className="rounded-xl bg-surface-2/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{r.title}</p>
                    <SeverityBadge severity={r.severity} />
                  </div>
                  <p className="mt-1 text-sm text-muted">{r.explanation}</p>
                  {r.caveat && <p className="mt-1 text-xs text-accent">{r.caveat}</p>}
                </li>
              ))}
            </ul>
          )}
        </Accordion>

        {seller && (
          <Accordion id="seller" title="Verkäufer" icon={Users} open={!!open.seller} onToggle={() => toggle("seller")} badge={<MiniBadge text={toTen(score.seller.score)} tone={scoreTone(score.seller.score)} />}>
            {seller.visibleReviewCount > 0 && (
              <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                <div className="bg-good" style={{ width: `${(seller.positive / seller.visibleReviewCount) * 100}%` }} />
                <div className="bg-warn" style={{ width: `${(seller.neutral / seller.visibleReviewCount) * 100}%` }} />
                <div className="bg-bad" style={{ width: `${(seller.negative / seller.visibleReviewCount) * 100}%` }} />
              </div>
            )}
            <p className="text-sm">{seller.summary}</p>
            {seller.complaints.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {seller.complaints.map((c) => (
                  <li key={c.category} className="flex justify-between gap-3">
                    <span>{COMPLAINT_LABELS[c.category]}</span>
                    <span className="tabular text-muted">{c.count}×</span>
                  </li>
                ))}
              </ul>
            )}
            {seller.complaints.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted">Originaltext wichtiger Beschwerden</p>
                {seller.complaints.slice(0, 3).flatMap((c) => c.examples.slice(0, 1).map((e) => (
                  <blockquote key={c.category + e.text} className="border-l-2 border-warn pl-3 text-sm italic text-muted">„{e.text}“</blockquote>
                )))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted">{seller.coverageNote} Bewertungen sind Aussagen anderer Nutzer, nicht überprüft.</p>
            {(report.sellerRuns ?? []).length > 1 && (
              <p className="mt-1 text-xs text-muted">
                {report.sellerRuns.length} Prüfungen: {report.sellerRuns.map((r) => `${new Date(r.at).toLocaleDateString("de-DE")} +${r.newReviews} neu (${r.duplicates} Duplikate)`).join(" · ")}
              </p>
            )}
          </Accordion>
        )}

        {analysisId && (
          <div id={seller ? "s-seller-add" : "s-seller"} className="scroll-mt-20">
            <SellerAddon analysisId={analysisId} existing={seller?.visibleReviewCount} />
          </div>
        )}

        <Accordion id="payment" title="Sicher bezahlen & übergeben" icon={ShieldCheck} open={!!open.payment} onToggle={() => toggle("payment")}>
          <ul className="space-y-2">
            {report.payment.slice(0, 5).map((p) => (
              <li key={p.id} className="flex gap-2.5 text-sm">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", p.kind === "avoid" ? "bg-bad" : p.kind === "recommended" ? "bg-good" : "bg-warn")} />
                <span>
                  <span className="font-medium">{p.title}.</span> <span className="text-muted">{p.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Accordion>

        <Accordion id="checklist" title="Checkliste" icon={ClipboardList} open={!!open.checklist} onToggle={() => toggle("checklist")}>
          {phases.map(({ key: k, label, items }) => (
            <div key={k} className="mb-4 last:mb-0">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">{phases.findIndex((p) => p.key === k) + 1}</span>
                {label}
              </p>
              <ul>
                {items.map((item) => {
                  const key = `${k}:${item}`;
                  return (
                    <li key={key}>
                      <label className="flex cursor-pointer items-start gap-3 py-1.5">
                        <input type="checkbox" className="mt-0.5 size-[18px] accent-[var(--accent)]" checked={!!checked[key]} onChange={(e) => setChecked((c) => ({ ...c, [key]: e.target.checked }))} />
                        <span className={cn("text-sm", checked[key] && "text-muted line-through")}>{item}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </Accordion>

        <Accordion id="messages" title="Nachricht & Verhandlung" icon={MessageSquareText} open={!!open.messages} onToggle={() => toggle("messages")}>
          {report.sellerMessage && <CopyBlock text={report.sellerMessage} />}
          {report.negotiation.possible && report.negotiation.message && (
            <>
              <p className="mb-2 mt-4 text-sm font-semibold">
                Preis verhandeln
                {report.negotiation.suggestedOpeningEur && <span className="font-normal text-muted"> · Vorschlag {formatEur(report.negotiation.suggestedOpeningEur)}</span>}
              </p>
              <CopyBlock text={report.negotiation.message} />
            </>
          )}
        </Accordion>

        <Accordion id="data" title="Angaben & Quellen" icon={FileText} open={!!open.data} onToggle={() => toggle("data")}>
          <dl className="divide-y divide-border text-sm">
            {LISTING_FIELDS.filter((f) => f !== "description" && listing[f as ListingFieldKey] != null && listing[f as ListingFieldKey] !== "").map((f) => {
              const v = listing[f as ListingFieldKey];
              const src = listing.provenance[f] as FieldSource | undefined;
              const display = typeof v === "number" ? (f === "priceEur" ? formatEur(v) : f === "mileageKm" ? `${formatNumber(v)} km` : f === "year" ? String(v) : formatNumber(v)) : String(v);
              return (
                <div key={f} className="flex items-center justify-between gap-3 py-2">
                  <dt className="min-w-0">
                    <span className="block text-xs text-muted">{FIELD_LABELS[f as ListingFieldKey]}</span>
                    <span className="block truncate font-medium">{display}</span>
                  </dt>
                  {src && <dd className="shrink-0 text-[11px] text-muted">{FIELD_SOURCE_LABELS[src]}</dd>}
                </div>
              );
            })}
          </dl>
        </Accordion>

        <Accordion id="method" title="Datenqualität & Methode" icon={Workflow} open={!!open.method} onToggle={() => toggle("method")}>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <MiniScore label="Preis" sub={score.price} />
            <MiniScore label="Zustand" sub={score.product} />
            <MiniScore label="Verkäufer" sub={score.seller} />
            <MiniScore label="Plausibilität" sub={score.plausibility} />
          </div>
          <p className="text-sm text-muted">
            Datenqualität {report.dataQuality.score}/100 – {report.dataQuality.uncertainty}
          </p>
          {score.caps.length > 0 && <p className="mt-2 text-xs text-muted">Begrenzt: {score.caps.join(" · ")}</p>}
        </Accordion>
      </div>

      {cmpId && (
        <Button asChild variant="outline" className="mt-5 w-full">
          <Link href={`/vergleich?a=${encodeURIComponent(cmpId)}`}>Mit anderem Angebot vergleichen</Link>
        </Button>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-muted">
        Orientierungshilfe, keine Garantie für Zustand, Echtheit oder Seriosität.{" "}
        <Link href="/methodik" className="underline">So bewerten wir</Link>
      </p>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-surface-2/70 px-3 py-2">
      <p className="text-xs text-muted">{k}</p>
      <p className="tabular font-semibold">{v}</p>
    </div>
  );
}

function MiniBadge({ text, tone }: { text: string; tone: keyof typeof TONE_DOT }) {
  return (
    <span
      className={cn(
        "tabular rounded-md px-2 py-0.5 text-xs font-semibold",
        tone === "good" && "bg-good text-white",
        tone === "warn" && "bg-warn text-[oklch(0.18_0.03_60)]",
        tone === "bad" && "bg-bad text-white",
        tone === "neutral" && "bg-surface-2 text-muted",
      )}
    >
      {text}
    </span>
  );
}
