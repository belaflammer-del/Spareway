import { Card, CardHeader, Notice, PageHeader } from "@/components/ui";
import { PackageForm } from "@/components/package-form";
import { ConfirmSubmit } from "@/components/confirm-button";
import { getContext } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { calculate } from "@/lib/pricing";
import { normalizePricingConfig } from "@/lib/domain";
import { formatEUR } from "@/lib/utils";
import { deletePackage } from "@/app/actions/services";

export const metadata = { title: "Pakete" };

export default async function Packages() {
  const ctx = await getContext();
  const { services, packages } = await loadCatalog(ctx, { onlyActive: false });
  const active = services.filter((s) => s.active);
  const cfg = normalizePricingConfig(ctx.company.pricing_config);
  const tax = { default_tax_rate: Number(ctx.company.default_tax_rate), small_business: ctx.company.small_business };
  return (
    <>
      <PageHeader title="Pakete" description="Kombiniere Einzelleistungen zu Paketen. Doppelte Leistungen werden in der Kalkulation automatisch nur einmal berechnet." />
      {!ctx.canEditPrices && <div className="mb-4"><Notice>Nur Inhaber und Mitarbeiter mit Preisrecht können Pakete ändern.</Notice></div>}
      <div className="space-y-6">
        {packages.map((p) => {
          const preview = calculate({ vehicleClass: "kompaktwagen", soiling: "normal", serviceIds: [], packageIds: [p.id] }, { services, packages }, cfg, tax);
          return (
            <Card key={p.id}>
              <CardHeader title={p.name} description={`${p.service_ids.length} Leistungen · Kompaktwagen: ${formatEUR(preview.netTotal)} netto${p.active ? "" : " · deaktiviert"}`}
                action={ctx.canEditPrices && <form action={deletePackage}><input type="hidden" name="id" value={p.id} /><ConfirmSubmit variant="ghost" message={`Paket „${p.name}“ löschen?`}>Löschen</ConfirmSubmit></form>} />
              {ctx.canEditPrices && <details className="px-5 py-3"><summary className="cursor-pointer text-sm font-medium text-accent">Bearbeiten</summary><div className="pt-4"><PackageForm pkg={p} services={active} /></div></details>}
            </Card>
          );
        })}
        {ctx.canEditPrices && (
          <Card><CardHeader title="Neues Paket" /><div className="p-5"><PackageForm services={active} /></div></Card>
        )}
      </div>
    </>
  );
}
