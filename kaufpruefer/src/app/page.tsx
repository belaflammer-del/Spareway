import { ArrowRight, Car, Eye, Gamepad2, Package, ScanSearch, Shield, Shirt, Smartphone, Watch, Zap } from "lucide-react";
import Link from "next/link";
import { DemoCard } from "@/components/home/demo-card";
import { FadeIn } from "@/components/home/fade-in";
import { HeroInput } from "@/components/home/hero-input";
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

const STEPS = [
  { icon: Zap, t: "Link einfügen" },
  { icon: ScanSearch, t: "Wir prüfen" },
  { icon: Eye, t: "Klares Urteil" },
];

export default async function HomePage() {
  const vis = (await getStore().getConfig()).demoVisibility ?? {};
  const demos = listDemos().filter((d) => vis[d.slug] !== false);
  const pricing = await getPricing();
  const cheapest = Math.min(...pricing.packages.map((p) => p.priceCents / p.tokens));

  return (
    <div className="overflow-x-clip">
      <section className="hero-glow">
        <div className="mx-auto max-w-2xl px-4 pb-10 pt-10 text-center sm:pt-20">
          <FadeIn>
            <h1 className="text-[2.4rem] font-bold leading-[1.02] tracking-[-0.04em] text-balance sm:text-6xl">
              Prüfe deinen Deal, <span className="text-accent">bevor du kaufst.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-muted text-pretty">Preis, Zustand, Risiken und Verkäufer – in einem klaren Urteil.</p>
          </FadeIn>
          <div className="mt-8">
            <HeroInput />
          </div>
          <ol className="mx-auto mt-8 flex max-w-sm items-center justify-between text-xs text-muted">
            {STEPS.map((s, i) => (
              <li key={s.t} className="flex items-center gap-1.5">
                <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-foreground">
                  <s.icon className="size-3.5" />
                </span>
                {s.t}
                {i < STEPS.length - 1 && <ArrowRight className="ml-1 size-3 opacity-50" />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4">
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
