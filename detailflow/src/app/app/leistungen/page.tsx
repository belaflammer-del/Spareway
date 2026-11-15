import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { Badge, Card, CardHeader, Input, LinkButton, Notice, PageHeader, buttonClass } from "@/components/ui";
import { PricingRulesForm } from "@/components/pricing-rules-form";
import { getContext } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { normalizePricingConfig } from "@/lib/domain";
import { formatMinutes } from "@/lib/pricing";
import { formatEUR } from "@/lib/utils";
import { quickUpdatePrice, toggleService } from "@/app/actions/services";

export const metadata = { title: "Leistungen & Preise" };

export default async function Services({ searchParams }: { searchParams: Promise<{ alle?: string; q?: string }> }) {
  const { alle, q } = await searchParams;
  const ctx = await getContext();
  const { services } = await loadCatalog(ctx, { onlyActive: false });
  const term = q?.trim().toLowerCase();
  const visible = services.filter((s) => (alle ? true : s.active) && (!term || s.name.toLowerCase().includes(term)));
  const groups = new Map<string, typeof services>();
  for (const s of visible) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);
  const missing = services.filter((s) => s.active && s.pricing_type === "fixed" && s.base_price === 0).length;
  const ro = !ctx.canEditPrices;

  return (
    <>
      <PageHeader
        title="Leistungen & Preise"
        description={`${services.filter((s) => s.active).length} aktive von ${services.length} Leistungen. Alle Preise netto für ein Kompaktfahrzeug mit normaler Verschmutzung.`}
        actions={<>
          <LinkButton variant="secondary" href="/app/leistungen/pakete"><Package className="size-4" />Pakete</LinkButton>
          {!ro && <LinkButton href="/app/leistungen/neu"><Plus className="size-4" />Neue Leistung</LinkButton>}
        </>}
      />
      {ro && <div className="mb-4"><Notice>Du kannst Leistungen ansehen, aber keine Preise ändern. Wende dich an den Inhaber.</Notice></div>}
      {missing > 0 && !ro && <div className="mb-4"><Notice tone="amber">Bei {missing} aktiven Leistungen fehlt noch ein Preis. Trage ihn direkt in der Liste ein.</Notice></div>}

      <details className="mb-6">
        <summary className={buttonClass("secondary", "md", "cursor-pointer list-none")}>Preisregeln: Zuschläge & Stundensatz</summary>
        <Card className="mt-3 p-5"><PricingRulesForm config={normalizePricingConfig(ctx.company.pricing_config)} readOnly={ro} /></Card>
      </details>

      <form className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Leistung suchen …" className="max-w-sm" />
        {alle && <input type="hidden" name="alle" value="1" />}
        <Link href={alle ? "/app/leistungen" : "/app/leistungen?alle=1"} className={buttonClass("ghost")}>{alle ? "Nur aktive zeigen" : "Auch deaktivierte zeigen"}</Link>
      </form>

      <div className="space-y-6">
        {[...groups.entries()].map(([cat, list]) => (
          <Card key={cat} className="overflow-hidden">
            <CardHeader title={cat} description={`${list.length} Leistungen`} />
            <div className="divide-y divide-border">
              {list.map((s) => (
                <div key={s.id} className={`flex flex-col gap-2 px-5 py-2.5 sm:flex-row sm:items-center ${s.active ? "" : "opacity-50"}`}>
                  <Link href={`/app/leistungen/${s.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{formatMinutes(s.duration_minutes)}</span>
                    {s.pricing_type === "hourly" && <Badge className="ml-2">Stundenbasis</Badge>}
                  </Link>
                  <div className="flex items-center gap-2">
                    {s.pricing_type === "fixed" && !ro ? (
                      <form action={quickUpdatePrice} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={s.id} />
                        <div className="relative"><Input name="base_price" inputMode="decimal" defaultValue={s.base_price || ""} placeholder="Preis" className="h-8 w-24 pr-6 text-right text-sm" /><span className="absolute right-2 top-1.5 text-sm text-muted-foreground">€</span></div>
                        <button className={buttonClass("ghost", "sm")}>OK</button>
                      </form>
                    ) : (
                      <span className="w-24 text-right text-sm tabular-nums">{s.pricing_type === "hourly" ? `${formatEUR(s.hourly_rate ?? normalizePricingConfig(ctx.company.pricing_config).hourlyRate)}/h` : formatEUR(s.base_price)}</span>
                    )}
                    {!ro && (
                      <form action={toggleService}>
                        <input type="hidden" name="id" value={s.id} /><input type="hidden" name="active" value={String(!s.active)} />
                        <button className={buttonClass("ghost", "sm", "w-24")}>{s.active ? "Deaktivieren" : "Aktivieren"}</button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
