import { Card, PageHeader } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { getContext } from "@/lib/auth";
import { customerDisplayName } from "@/lib/domain";

export const metadata = { title: "Neues Fahrzeug" };

export default async function NewVehicle({ searchParams }: { searchParams: Promise<{ kunde?: string; einrichtung?: string }> }) {
  const { kunde, einrichtung } = await searchParams;
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("customers").select("id, type, first_name, last_name, company_name").is("merged_into", null).order("last_name").limit(1000);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Neues Fahrzeug" description="Pflichtfelder sind mit * markiert. Alles andere kannst du später ergänzen." />
      <Card className="p-6"><VehicleForm customers={(data ?? []).map((c) => ({ id: c.id, name: customerDisplayName(c) }))} defaultCustomerId={kunde} onboarding={Boolean(einrichtung)} /></Card>
    </div>
  );
}
