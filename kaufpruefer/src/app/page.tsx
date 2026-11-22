import { ArrowRight, BadgeCheck, Car, Eye, FileSearch, Gamepad2, Gem, Layers, Package, ScanSearch, Shield, Shirt, Smartphone, Sparkles, Watch } from "lucide-react";
import Link from "next/link";
import { FadeIn } from "@/components/home/fade-in";
import { HeroInput } from "@/components/home/hero-input";
import { ScoreRing } from "@/components/report/score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/misc";
import { listDemos } from "@/lib/demo";
import { getStore } from "@/lib/store";
import { getPricing } from "@/lib/wallet/service";
import { CATEGORY_LABELS, CATEGORY_SUPPORT, formatEur, PRICE_RATING_LABELS, RECOMMENDATION_LABELS } from "@/lib/domain/labels";
import type { Category } from "@/lib/domain/schemas";

const CATEGORY_ICONS: Record<Category, typeof Car> = {
  vehicle: Car,
  electronics: Smartphone,
  fashion: Shirt,
  watches_jewelry: Watch,
  gaming_collectibles: Gamepad2,
  other: Package,
};

const STEPS = [
  { icon: Layers, title: "Link einfügen oder Screenshots hochladen", text: "Wir erkennen Plattform, Kategorie und Angaben – und fragen gezielt nach, was fehlt." },
  { icon: ScanSearch, title: "Analyse im Hintergrund", text: "Marktvergleich, Bildprüfung, bekannte Schwachstellen, Plausibilität und Verkäuferbewertungen." },
  { icon: FileSearch, title: "Klarer Prüfbericht", text: "Deal-Score mit Teilbewertungen, Risiken mit Belegen, Checkliste, Nachricht an den Verkäufer." },
];

const PRINCIPLES = [
  { icon: Eye, title: "Belegt statt behauptet", text: "Jede Aussage zeigt ihre Quelle: sichtbar belegt, möglich oder nicht überprüfbar." },
  { icon: Gem, title: "Keine erfundenen Preise", text: "Ohne belastbare Vergleichsdaten zeigen wir keinen Marktwert – sondern sagen das offen." },
  { icon: Shield, title: "Fair zu Verkäufern", text: "Hinweise statt Vorwürfe. Ein günstiger Preis allein ist kein Betrugsbeweis." },
  { icon: BadgeCheck, title: "Datensparsam", text: "Uploads werden automatisch gelöscht, Bildmetadaten entfernt, Daten nicht weiterverkauft." },
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const vis = (await getStore().getConfig()).demoVisibility ?? {};
  const demos = listDemos().filter((d) => vis[d.slug] !== false);
  const pricing = await getPricing();
  return (
    <>
      {/* Hero */}
      <section className="hero-glow relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pb-24 sm:pt-24">
          <FadeIn>
            <Badge tone="accent" className="mb-6 px-3 py-1">
              <Sparkles /> KI-Kaufprüfung für Gebrauchtwaren
            </Badge>
            <h1 className="mx-auto max-w-3xl text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] text-balance sm:text-6xl">
              Prüfe deinen Deal, bevor du kaufst.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted text-pretty">
              Lass Angebote, Preise und Risiken mit KI analysieren – bevor du dein Geld ausgibst.
            </p>
          </FadeIn>
          <FadeIn delay={0.1} className="mt-10">
            <HeroInput />
          </FadeIn>
          <FadeIn delay={0.18} className="mx-auto mt-12 max-w-4xl">
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6" aria-label="Unterstützte Produktkategorien">
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => {
                const Icon = CATEGORY_ICONS[c];
                return (
                  <li key={c} className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface/70 px-3 py-4 text-center backdrop-blur">
                    <Icon className="size-5 text-foreground/80" aria-hidden />
                    <span className="text-[13px] font-medium leading-tight">{CATEGORY_LABELS[c]}</span>
                    <span className={`text-[11px] ${CATEGORY_SUPPORT[c] === "full" ? "text-accent" : "text-muted"}`}>
                      {CATEGORY_SUPPORT[c] === "full" ? "Vollständige Prüfung" : "Basisprüfung"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </FadeIn>
        </div>
      </section>

      {/* Demo-Analysen */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="demos">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <SectionTitle eyebrow="Kostenlos ansehen" title="So sieht ein fertiger Prüfbericht aus" desc="Interaktive Beispielanalysen mit fiktiven Daten – sie verbrauchen keine Tokens." />
          <Button asChild variant="outline" size="sm">
            <Link href="/demo">
              Alle Beispiele <ArrowRight />
            </Link>
          </Button>
        </div>
        <div id="demos" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {demos.map(({ slug, teaser, report }, i) => (
            <FadeIn key={slug} delay={i * 0.04}>
              <Link href={`/demo/${slug}`} className="group block h-full">
                <Card className="flex h-full flex-col p-5 transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge tone="demo" className="mb-2">Demo</Badge>
                      <h3 className="truncate font-semibold tracking-tight">{report.listing.title?.replace(" (Demo)", "")}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted">{teaser}</p>
                    </div>
                    <ScoreRing score={report.score.overall} size={64} stroke={6} />
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-5 text-sm">
                    <span className="tabular font-medium">{formatEur(report.listing.priceEur)}</span>
                    <span className="text-muted">{PRICE_RATING_LABELS[report.market.rating]}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted">{RECOMMENDATION_LABELS[report.score.recommendation]}</p>
                </Card>
              </Link>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Ablauf */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionTitle eyebrow="So funktioniert es" title="In drei Schritten zur fundierten Kaufentscheidung" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <FadeIn key={s.title} delay={i * 0.06}>
              <Card className="h-full p-6">
                <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <s.icon className="size-5" />
                </div>
                <p className="mt-5 text-xs font-medium text-muted">Schritt {i + 1}</p>
                <h3 className="mt-1 font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </Card>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Prinzipien */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <SectionTitle
            eyebrow="Transparenz"
            title="Ehrliche Ergebnisse statt falscher Sicherheit"
            desc="Kaufklar trennt konsequent zwischen belegten Fakten, Hinweisen und nicht überprüfbaren Punkten. Der Deal-Score ist eine Orientierung – keine Garantie."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="rounded-2xl border border-border p-5">
                <p.icon className="size-5 text-accent" />
                <h3 className="mt-3 font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Preise */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Card className="overflow-hidden">
          <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <SectionTitle eyebrow="Fair & ohne Abo" title="Zahle nur, wenn du wirklich prüfst" desc="Der kostenlose Schnellcheck zeigt Grundinformationen und erste Risiken. Der vollständige Kaufcheck inklusive Verkäuferanalyse kostet einen Token." />
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/check">Kostenlos Schnellcheck starten</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/preise">Preise ansehen</Link>
                </Button>
              </div>
            </div>
            <ul className="grid gap-2.5">
              {pricing.packages.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                  <span className="font-medium">{p.label}</span>
                  <span className="tabular text-muted">{formatEur(p.priceCents / 100)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </section>
    </>
  );
}
