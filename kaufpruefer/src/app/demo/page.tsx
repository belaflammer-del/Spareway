import type { Metadata } from "next";
import { DemoCard } from "@/components/home/demo-card";
import { listDemos } from "@/lib/demo";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Beispielanalysen" };

export const dynamic = "force-dynamic";

export default async function DemoListPage() {
  const vis = (await getStore().getConfig()).demoVisibility ?? {};
  const demos = listDemos().filter((d) => vis[d.slug] !== false);
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Beispielberichte</h1>
      <p className="mt-1 text-sm text-muted">So sieht ein Ergebnis aus. Alle Daten sind fiktiv, es kostet nichts.</p>
      <div className="mt-6 grid gap-2.5">
        {demos.map((d) => (
          <DemoCard key={d.slug} slug={d.slug} report={d.report} />
        ))}
      </div>
    </div>
  );
}
