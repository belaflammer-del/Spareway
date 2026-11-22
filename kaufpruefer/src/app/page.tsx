import { Check, Shield } from "lucide-react";
import Link from "next/link";
import { DemoCard } from "@/components/home/demo-card";
import { FadeIn } from "@/components/home/fade-in";
import { HeroInput } from "@/components/home/hero-input";
import { CategoryGrid3D, LevelHero } from "@/components/home/three-views";
import { formatEur } from "@/lib/domain/labels";
import { listDemos } from "@/lib/demo";
import { getStore } from "@/lib/store";
import { getPricing } from "@/lib/wallet/service";

export const dynamic = "force-dynamic";

const CHIPS = ["Preis checken", "Mängel finden", "Betrug erkennen"];
const PERKS = ["Schnellcheck gratis", "Kein Abo", "Ergebnis in Sekunden", "Keine App nötig"];

export default async function HomePage() {
  const vis = (await getStore().getConfig()).demoVisibility ?? {};
  const demos = listDemos().filter((d) => vis[d.slug] !== false);
  const pricing = await getPricing();
  const cheapest = Math.min(...pricing.packages.map((p) => p.priceCents / p.tokens));

  return (
    <div className="overflow-x-clip">
      <section className="hero-glow relative">
        <div className="mx-auto grid max-w-6xl items-center gap-4 px-5 pb-10 pt-8 md:grid-cols-[1.1fr_1fr] md:gap-10 md:pb-20 md:pt-20">
          <div>
            <FadeIn>
              <p className="text-sm font-semibold text-accent">DEAL-NIVO – der KI-Check für Gebrauchtkäufe</p>
              <h1 className="mt-3 text-[2.7rem] font-extrabold leading-[0.98] tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
                Prüfe deinen Deal, <span className="text-accent">bevor du kaufst.</span>
              </h1>
            </FadeIn>
            {/* Wasserwaage – am Handy direkt unter der Überschrift */}
            <LevelHero className="-mx-5 h-40 md:hidden" />
            <FadeIn delay={0.1}>
              <p className="mt-3 max-w-md text-[17px] leading-relaxed text-muted text-pretty md:mt-6">
                Link einfügen – wir prüfen <span className="font-semibold text-foreground">Preis, Zustand, Risiken und Verkäufer</span> und zeigen dir, ob der Deal im Lot ist.
              </p>
              <ul className="mt-5 flex flex-wrap gap-2.5">
                {CHIPS.map((c) => (
                  <li key={c} className="flex items-center gap-2 rounded-2xl border-2 border-accent bg-background px-3.5 py-2 text-sm font-bold shadow-[3px_4px_0_0_var(--accent)]">
                    <span className="size-2 rounded-full bg-accent" />
                    {c}
                  </li>
                ))}
              </ul>
            </FadeIn>
            <div className="mt-7">
              <HeroInput />
            </div>
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted">
              {PERKS.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-accent" strokeWidth={3} /> {p}
                </li>
              ))}
            </ul>
          </div>
          <LevelHero className="hidden h-[22rem] md:block" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-3 text-xl font-bold tracking-tight">Was wir prüfen</h2>
          <CategoryGrid3D />
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4 pt-10">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Beispielberichte</h2>
            <p className="text-sm text-muted">Kostenlos ansehen – fiktive Daten</p>
          </div>
          <Link href="/demo" className="text-sm font-semibold text-accent">
            Alle
          </Link>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {demos.slice(0, 4).map((d) => (
            <DemoCard key={d.slug} slug={d.slug} report={d.report} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4 pt-10">
        <div className="flex items-center gap-4 rounded-2xl bg-accent p-5 text-accent-fg">
          <Shield className="size-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Schnellcheck gratis</p>
            <p className="text-sm opacity-75">Komplettcheck ab {formatEur(cheapest / 100)} – kein Abo.</p>
          </div>
          <Link href="/preise" className="shrink-0 rounded-xl bg-foreground px-3 py-2 text-sm font-semibold text-background">
            Preise
          </Link>
        </div>
      </section>
    </div>
  );
}
