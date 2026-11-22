import Link from "next/link";
import { notFound } from "next/navigation";
import { Car, FileText, Plus } from "lucide-react";
import { Card, CardHeader, LinkButton, Notice, PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/customer-form";
import { MergeForm } from "@/components/merge-form";
import { ConfirmSubmit } from "@/components/confirm-button";
import { OrderStatusBadge, QuoteStatusBadge } from "@/components/status";
import { getContext } from "@/lib/auth";
import { customerDisplayName, vehicleDisplayName, VEHICLE_CLASS_LABELS, type OrderStatus, type QuoteStatus, type VehicleClass } from "@/lib/domain";
import { formatDate, formatEUR } from "@/lib/utils";
import { deleteCustomer } from "@/app/actions/customers";

export default async function CustomerDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { id } = await params;
  const { fehler } = await searchParams;
  const ctx = await getContext();
  const { data: customer } = await ctx.supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!customer) notFound();

  const [{ data: vehicles }, { data: quotes }, { data: orders }, { data: others }] = await Promise.all([
    ctx.supabase.from("vehicles").select("id, make, model, variant, license_plate, vehicle_class").eq("customer_id", id).order("created_at"),
    ctx.supabase.from("quotes").select("id, number, status, total_gross, created_at").eq("customer_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("orders").select("id, number, status, title, total_gross, scheduled_start, created_at").eq("customer_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("customers").select("id, type, first_name, last_name, company_name").neq("id", id).is("merged_into", null).order("last_name").limit(500),
  ]);
  const revenue = (orders ?? []).filter((o) => o.status === "abgeschlossen").reduce((a, o) => a + Number(o.total_gross), 0);

  return (
    <>
      <PageHeader
        title={customerDisplayName(customer)}
        description={`Kunde seit ${formatDate(customer.created_at)} · ${orders?.length ?? 0} Aufträge · ${formatEUR(revenue)} Umsatz`}
        actions={<>
          <LinkButton variant="secondary" href={`/app/fahrzeuge/neu?kunde=${id}`}><Car className="size-4" />Fahrzeug</LinkButton>
          <LinkButton href={`/app/angebote/neu?kunde=${id}`}><Plus className="size-4" />Angebot</LinkButton>
        </>}
      />
      {customer.merged_into && <div className="mb-4"><Notice tone="amber">Dieser Kunde wurde zusammengeführt. <Link className="underline" href={`/app/kunden/${customer.merged_into}`}>Zum Ziel-Kunden</Link></Notice></div>}
      {fehler && <div className="mb-4"><Notice tone="red">{fehler}</Notice></div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Fahrzeuge" action={<Link href={`/app/fahrzeuge/neu?kunde=${id}`} className="text-sm font-medium text-accent">+ Hinzufügen</Link>} />
            {vehicles?.length ? (
              <div className="divide-y divide-border">
                {vehicles.map((v) => (
                  <Link key={v.id} href={`/app/fahrzeuge/${v.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50">
                    <span className="font-medium">{vehicleDisplayName(v)}</span>
                    <span className="text-sm text-muted-foreground">{[v.license_plate, VEHICLE_CLASS_LABELS[v.vehicle_class as VehicleClass]].filter(Boolean).join(" · ")}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="px-5 py-6 text-sm text-muted-foreground">Noch kein Fahrzeug hinterlegt.</p>}
          </Card>
          <Card>
            <CardHeader title="Historie" description="Angebote und Aufträge" />
            {quotes?.length || orders?.length ? (
              <div className="divide-y divide-border">
                {(orders ?? []).map((o) => (
                  <Link key={o.id} href={`/app/auftraege/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">Auftrag {o.number} {o.title && `· ${o.title}`}</p><p className="text-xs text-muted-foreground">{formatDate(o.scheduled_start ?? o.created_at)}</p></div>
                    <div className="flex items-center gap-3"><span className="text-sm tabular-nums">{formatEUR(o.total_gross)}</span><OrderStatusBadge status={o.status as OrderStatus} /></div>
                  </Link>
                ))}
                {(quotes ?? []).map((q) => (
                  <Link key={q.id} href={`/app/angebote/${q.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50">
                    <div><p className="flex items-center gap-1.5 text-sm font-medium"><FileText className="size-3.5" />Angebot {q.number}</p><p className="text-xs text-muted-foreground">{formatDate(q.created_at)}</p></div>
                    <div className="flex items-center gap-3"><span className="text-sm tabular-nums">{formatEUR(q.total_gross)}</span><QuoteStatusBadge status={q.status as QuoteStatus} /></div>
                  </Link>
                ))}
              </div>
            ) : <p className="px-5 py-6 text-sm text-muted-foreground">Noch keine Angebote oder Aufträge.</p>}
          </Card>
          <Card>
            <CardHeader title="Kundendaten" />
            <div className="p-5"><CustomerForm customer={customer} /></div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Dublette zusammenführen" description="Überträgt Fahrzeuge, Angebote und Aufträge auf einen anderen Kunden." />
            <div className="p-5"><MergeForm sourceId={id} candidates={(others ?? []).map((o) => ({ id: o.id, name: customerDisplayName(o) }))} /></div>
          </Card>
          {ctx.role !== "staff" && (
            <Card className="p-5">
              <h3 className="font-medium">Kunde löschen</h3>
              <p className="mb-3 mt-1 text-sm text-muted-foreground">Nur möglich, wenn keine Angebote oder Aufträge existieren.</p>
              <form action={deleteCustomer}><input type="hidden" name="id" value={id} /><ConfirmSubmit message="Kunde endgültig löschen?">Löschen</ConfirmSubmit></form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
