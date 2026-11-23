import type { Metadata } from "next";
import Link from "next/link";
import { AnalysisList } from "@/components/dashboard/analysis-list";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { CATEGORY_LABELS } from "@/lib/domain/labels";
import type { Category } from "@/lib/domain/schemas";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Analysehistorie" };

export default async function AnalysesPage({ searchParams }: PageProps<"/dashboard/analyses">) {
  const user = await requireUser("/dashboard/analyses");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const cat = typeof sp.cat === "string" ? sp.cat : "";
  const all = await getStore().listAnalyses(user.id, 200);
  const items = all.filter((a) => (!q || a.title.toLowerCase().includes(q)) && (!cat || a.category === cat));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analysehistorie</h1>
          <p className="mt-1 text-sm text-muted">{all.length} Prüfung(en). Berichte kannst du jederzeit löschen.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/vergleich">Zwei Angebote vergleichen</Link>
        </Button>
      </div>
      <form className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
        <Input name="q" placeholder="Suchen, z. B. BMW oder iPhone" defaultValue={q} aria-label="Suche" />
        <Select name="cat" defaultValue={cat} aria-label="Kategorie">
          <option value="">Alle Kategorien</option>
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </Select>
        <Button type="submit" variant="subtle">Filtern</Button>
      </form>
      <AnalysisList items={items} />
    </div>
  );
}
