import { Card, PageHeader } from "@/components/ui";
import { ServiceForm } from "@/components/service-form";
import { getContext } from "@/lib/auth";

export const metadata = { title: "Neue Leistung" };
export default async function NewService() {
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("service_categories").select("id, name").eq("company_id", ctx.companyId).order("sort");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Neue Leistung" description="Individuelle Sonderleistung für deinen Katalog." />
      <Card className="p-6"><ServiceForm categories={data ?? []} /></Card>
    </div>
  );
}
