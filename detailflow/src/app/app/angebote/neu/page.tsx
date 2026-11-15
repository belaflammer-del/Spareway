import { PageHeader } from "@/components/ui";
import { Calculator } from "@/components/calculator";
import { getContext } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { customerDisplayName, normalizePricingConfig, vehicleDisplayName, type VehicleClass } from "@/lib/domain";

export const metadata = { title: "Kalkulation" };

export default async function NewQuote({ searchParams }: { searchParams: Promise<{ kunde?: string; fahrzeug?: string; ziel?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const [catalog, { data: customers }, { data: vehicles }] = await Promise.all([
    loadCatalog(ctx),
    ctx.supabase.from("customers").select("id, type, first_name, last_name, company_name").is("merged_into", null).order("last_name").limit(2000),
    ctx.supabase.from("vehicles").select("id, customer_id, make, model, variant, license_plate, vehicle_class").order("make").limit(5000),
  ]);
  return (
    <>
      <PageHeader title={sp.ziel === "order" ? "Neuer Auftrag" : "Neues Angebot"} description="Wähle Fahrzeug und Leistungen – der Preis wird live nach deinen Preisregeln berechnet." />
      <Calculator
        customers={(customers ?? []).map((c) => ({ id: c.id, name: customerDisplayName(c) }))}
        vehicles={(vehicles ?? []).map((v) => ({ id: v.id, customer_id: v.customer_id, vehicle_class: v.vehicle_class as VehicleClass, name: `${vehicleDisplayName(v)}${v.license_plate ? ` (${v.license_plate})` : ""}` }))}
        services={catalog.services}
        packages={catalog.packages}
        config={normalizePricingConfig(ctx.company.pricing_config)}
        tax={{ default_tax_rate: Number(ctx.company.default_tax_rate), small_business: ctx.company.small_business }}
        canEditPrices={ctx.canEditPrices}
        defaults={{ customerId: sp.kunde || undefined, vehicleId: sp.fahrzeug || undefined, target: sp.ziel === "order" ? "order" : "quote" }}
      />
    </>
  );
}
