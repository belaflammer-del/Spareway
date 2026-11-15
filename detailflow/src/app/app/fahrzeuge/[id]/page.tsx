import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, CardHeader, LinkButton, Notice, PageHeader } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { ConfirmSubmit } from "@/components/confirm-button";
import { OrderStatusBadge } from "@/components/status";
import { getContext } from "@/lib/auth";
import { customerDisplayName, vehicleDisplayName, VEHICLE_CLASS_LABELS, type OrderStatus, type VehicleClass } from "@/lib/domain";
import { formatDate, formatEUR } from "@/lib/utils";
import { deleteVehicle } from "@/app/actions/vehicles";

export default async function VehicleDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { id } = await params;
  const { fehler } = await searchParams;
  const ctx = await getContext();
  const { data: v } = await ctx.supabase.from("vehicles").select("*, customers(id, type, first_name, last_name, company_name)").eq("id", id).maybeSingle();
  if (!v) notFound();
  const [{ data: customers }, { data: orders }] = await Promise.all([
    ctx.supabase.from("customers").select("id, type, first_name, last_name, company_name").is("merged_into", null).order("last_name").limit(1000),
    ctx.supabase.from("orders").select("id, number, title, status, total_gross, scheduled_start, completed_at, created_at, order_items(title)").eq("vehicle_id", id).order("created_at", { ascending: false }),
  ]);
  const owner = v.customers as unknown as { id: string; type: string; first_name: string; last_name: string; company_name: string } | null;
  return (
    <>
      <PageHeader
        title={vehicleDisplayName(v)}
        description={[v.license_plate, VEHICLE_CLASS_LABELS[v.vehicle_class as VehicleClass], owner && customerDisplayName(owner)].filter(Boolean).join(" · ")}
        actions={<LinkButton href={`/app/angebote/neu?kunde=${v.customer_id ?? ""}&fahrzeug=${id}`}><Plus className="size-4" />Angebot für dieses Fahrzeug</LinkButton>}
      />
      {fehler && <div className="mb-4"><Notice tone="red">{fehler}</Notice></div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader title="Fahrzeugakte" />
          <div className="p-5"><VehicleForm vehicle={v} customers={(customers ?? []).map((c) => ({ id: c.id, name: customerDisplayName(c) }))} /></div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Pflegehistorie" description="Frühere Aufbereitungen" />
            {orders?.length ? (
              <ol className="divide-y divide-border">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/app/auftraege/${o.id}`} className="block px-5 py-3 hover:bg-muted/50">
                      <div className="flex items-center justify-between"><span className="text-sm font-medium">{formatDate(o.completed_at ?? o.scheduled_start ?? o.created_at)}</span><OrderStatusBadge status={o.status as OrderStatus} /></div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{(o.order_items as { title: string }[]).map((i) => i.title).join(", ")}</p>
                      <p className="mt-0.5 text-xs tabular-nums">{formatEUR(o.total_gross)}</p>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : <p className="px-5 py-6 text-sm text-muted-foreground">Noch keine Aufbereitungen.</p>}
          </Card>
          <Card className="p-5">
            <h3 className="font-medium">Fotos</h3>
            <p className="mt-1 text-sm text-muted-foreground">Fotos werden am jeweiligen Auftrag dokumentiert (Vorher/Nachher, Schäden) und sind über die Pflegehistorie erreichbar.</p>
          </Card>
          {ctx.role !== "staff" && (
            <form action={deleteVehicle} className="px-1"><input type="hidden" name="id" value={id} /><ConfirmSubmit message="Fahrzeug endgültig löschen?">Fahrzeug löschen</ConfirmSubmit></form>
          )}
        </div>
      </div>
    </>
  );
}
