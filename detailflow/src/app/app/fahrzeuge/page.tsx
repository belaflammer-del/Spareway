import Link from "next/link";
import { Car, Plus, Search } from "lucide-react";
import { Badge, Card, EmptyState, Input, LinkButton, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/auth";
import { customerDisplayName, vehicleDisplayName, VEHICLE_CLASS_LABELS, type VehicleClass } from "@/lib/domain";

export const metadata = { title: "Fahrzeuge" };

export default async function Vehicles({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const ctx = await getContext();
  let query = ctx.supabase.from("vehicles")
    .select("id, make, model, variant, license_plate, vehicle_class, year, color, customers(id, type, first_name, last_name, company_name)")
    .eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(200);
  if (q?.trim()) {
    const t = q.trim().replace(/[%*,()]/g, " ");
    query = query.or(`make.ilike.*${t}*,model.ilike.*${t}*,license_plate.ilike.*${t}*,vin.ilike.*${t}*`);
  }
  const { data } = await query;
  return (
    <>
      <PageHeader title="Fahrzeuge" description="Digitale Fahrzeugakten mit Zustand, Vorschäden und Pflegehistorie." actions={<LinkButton href="/app/fahrzeuge/neu"><Plus className="size-4" />Neues Fahrzeug</LinkButton>} />
      <form className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="Hersteller, Modell, Kennzeichen oder FIN …" className="pl-9" />
      </form>
      {!data?.length ? (
        <EmptyState icon={<Car className="size-5" />} title={q ? "Keine Treffer" : "Noch keine Fahrzeuge"} description="Fahrzeuge werden einem Kunden zugeordnet und bestimmen die Preisklasse." action={!q && <LinkButton href="/app/fahrzeuge/neu">Fahrzeug anlegen</LinkButton>} />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {data.map((v) => {
            const c = v.customers as unknown as { type: string; first_name: string; last_name: string; company_name: string } | null;
            return (
              <Link key={v.id} href={`/app/fahrzeuge/${v.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate font-medium">{vehicleDisplayName(v)} {v.year && <span className="font-normal text-muted-foreground">({v.year})</span>}</p>
                  <p className="truncate text-sm text-muted-foreground">{c ? customerDisplayName(c) : "Ohne Kunde"}{v.color && ` · ${v.color}`}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {v.license_plate && <span className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">{v.license_plate}</span>}
                  <Badge>{VEHICLE_CLASS_LABELS[v.vehicle_class as VehicleClass]}</Badge>
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
