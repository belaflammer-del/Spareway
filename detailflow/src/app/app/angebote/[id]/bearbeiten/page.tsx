import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { Calculator } from "@/components/calculator";
import { getContext } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { customerDisplayName, normalizePricingConfig, vehicleDisplayName, type VehicleClass } from "@/lib/domain";

export const metadata = { title: "Angebot bearbeiten" };

export default async function EditQuote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const { data: q } = await ctx.supabase.from("quotes").select("id, number, status, customer_id, vehicle_id, calculation, intro_text, notes").eq("id", id).maybeSingle();
  if (!q) notFound();
  if (q.status !== "draft") redirect(`/app/angebote/${id}?fehler=${encodeURIComponent("Nur Entwürfe können bearbeitet werden.")}`);
  const input = (q.calculation as { input?: Record<string, unknown> })?.input;
  if (!input) redirect(`/app/angebote/${id}?fehler=${encodeURIComponent("Für dieses Angebot liegt keine Kalkulation vor.")}`);
  const [catalog, { data: customers }, { data: vehicles }] = await Promise.all([
    loadCatalog(ctx),
    ctx.supabase.from("customers").select("id, type, first_name, last_name, company_name").is("merged_into", null).order("last_name").limit(2000),
    ctx.supabase.from("vehicles").select("id, customer_id, make, model, variant, license_plate, vehicle_class").order("make").limit(5000),
  ]);
  return (
    <>
      <PageHeader title={`Angebot ${q.number} bearbeiten`} description="Änderungen werden neu berechnet. Nach dem Versenden ist das Angebot festgeschrieben." />
      <Calculator
        customers={(customers ?? []).map((c) => ({ id: c.id, name: customerDisplayName(c) }))}
        vehicles={(vehicles ?? []).map((v) => ({ id: v.id, customer_id: v.customer_id, vehicle_class: v.vehicle_class as VehicleClass, name: `${vehicleDisplayName(v)}${v.license_plate ? ` (${v.license_plate})` : ""}` }))}
        services={catalog.services}
        packages={catalog.packages}
        config={normalizePricingConfig(ctx.company.pricing_config)}
        tax={{ default_tax_rate: Number(ctx.company.default_tax_rate), small_business: ctx.company.small_business }}
        canEditPrices={ctx.canEditPrices}
        defaults={{ customerId: q.customer_id, vehicleId: q.vehicle_id ?? undefined }}
        edit={{ quoteId: q.id, calc: input as never, intro: q.intro_text ?? "", notes: q.notes ?? "" }}
      />
    </>
  );
}
