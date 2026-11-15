import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { ServiceForm } from "@/components/service-form";
import { getContext } from "@/lib/auth";

export default async function EditService({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const [{ data: s }, { data: cats }] = await Promise.all([
    ctx.supabase.from("services").select("*").eq("id", id).maybeSingle(),
    ctx.supabase.from("service_categories").select("id, name").eq("company_id", ctx.companyId).order("sort"),
  ]);
  if (!s) notFound();
  const service = { ...s, base_price: Number(s.base_price), material_cost: Number(s.material_cost), hourly_rate: s.hourly_rate == null ? null : Number(s.hourly_rate), min_price: s.min_price == null ? null : Number(s.min_price), tax_rate: s.tax_rate == null ? null : Number(s.tax_rate) };
  return (
    <div className="max-w-3xl">
      <PageHeader title={s.name} description="Leistung bearbeiten" />
      <Card className="p-6"><ServiceForm service={service} categories={cats ?? []} readOnly={!ctx.canEditPrices} /></Card>
    </div>
  );
}
