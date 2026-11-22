import { Car, Check, Gamepad2, Package, Shield, Shirt, Smartphone, Watch } from "lucide-react";
import Link from "next/link";
import { DemoCard } from "@/components/home/demo-card";
import { FadeIn } from "@/components/home/fade-in";
import { Hero3D } from "@/components/home/hero-3d";
import { HeroInput } from "@/components/home/hero-input";
import { Squiggle } from "@/components/home/squiggle";
import { formatEur } from "@/lib/domain/labels";
import type { Category } from "@/lib/domain/schemas";
import { listDemos } from "@/lib/demo";
import { getStore } from "@/lib/store";
import { getPricing } from "@/lib/wallet/service";

export const dynamic = "force-dynamic";

const CATS: { c: Category; label: string; icon: typeof Car }[] = [
  { c: "vehicle", label: "Autos", icon: Car },
  { c: "electronics", label: "Elektronik", icon: Smartphone },
  { c: "fashion", label: "Mode", icon: Shirt },
  { c: "watches_jewelry", label: "Uhren", icon: Watch },
  { c: "gaming_collectibles", label: "Gaming", icon: Gamepad2 },
  { c: "other", label: "Sonstiges", icon: Package },
];

const CHIPS = ["Preis checken", "Mängel finden", "Betrug erkennen"];
const PERKS = ["Schnellcheck gratis", "Kein Abo", "Ergebnis in Sekunden", "Keine App nötig"];

export default async function HomePage() {
  const vis = (await getStore().getConfig()).demoVisibility ?? {};
  const demos = listDemos().filter((d) => vis[d.slug] !== false);
  const pricing = await getPricing();
  const cheapest = Math.min(...pricing.packages.map((p) => p.priceCents / p.tokens));

  return (
    <div className="overflow-x-clip">
      <section className="hero-glow relative isolate">
        <Hero3D />
        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] max-w-2xl flex-col justify-center px-5 pb-10 pt-8 sm:min-h-0 sm:pt-24 sm:pb-16 md:text-center">
          <FadeIn>
            <p className="text-sm font-medium text-accent">DEAL-NIVO – der KI-Check für Gebrauchtkäufe</p>
            <h1 className="mt-4 text-[2.7rem] font-extrabold leading-[0.98] tracking-[-0.045em] text-balance sm:text-7xl">
              Prüfe deinen Deal, <span className="text-accent">bevor du kaufst.</span>
            </h1>
            <Squiggle className="mt-4 h-5 w-36 md:mx-auto" />
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted text-pretty md:mx-auto">
              Link einfügen – wir prüfen <span className="font-semibold text-foreground">Preis, Zustand, Risiken und Verkäufer</span> und sagen dir klar, ob sich der Kauf lohnt.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2.5 md:justify-center">
              {CHIPS.map((c) => (
                <li key={c} className="flex items-center gap-2 rounded-2xl border-2 border-accent bg-background px-3.5 py-2 text-sm font-bold shadow-[3px_4px_0_0_var(--accent)]">
                  <span className="size-2 rounded-full bg-accent" />
                  {c}
                </li>
              ))}
            </ul>
          </FadeIn>
          <div className="mt-8">
            <HeroInput />
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted md:mx-auto md:flex md:gap-6">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-accent" strokeWidth={3} /> {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4 pt-6">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Kategorien">
          {CATS.map(({ c, label, icon: Icon }) => (
            <li key={c} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-2 py-3 text-xs font-medium ring-1 ring-border">
              <Icon className="size-5 text-accent" />
              {label}
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-2xl px-4 pt-10">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Beispielberichte</h2>
            <p className="text-sm text-muted">Kostenlos ansehen – fiktive Daten</p>
          </div>
          <Link href="/demo" className="text-sm font-medium text-accent">
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
        <div className="flex items-center gap-4 rounded-2xl bg-foreground p-5 text-background">
          <Shield className="size-8 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Schnellcheck gratis</p>
            <p className="text-sm opacity-70">Komplettcheck ab {formatEur(cheapest / 100)} – kein Abo.</p>
          </div>
          <Link href="/preise" className="shrink-0 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-fg">
            Preise
          </Link>
        </div>
      </section>
    </div>
  );
}
