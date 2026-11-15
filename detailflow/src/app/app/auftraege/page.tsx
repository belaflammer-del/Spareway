import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { Card, EmptyState, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { OrderStatusBadge } from "@/components/status";
import { getContext } from "@/lib/auth";
import { customerDisplayName, ORDER_BOARD_COLUMNS, ORDER_STATUS_LABELS, vehicleDisplayName, type OrderStatus } from "@/lib/domain";
import { formatDateTime, formatEUR } from "@/lib/utils";

export const metadata = { title: "Aufträge" };

type Row = { id: string; number: string; title: string | null; status: OrderStatus; total_gross: number; scheduled_start: string | null; customers: unknown; vehicles: unknown };

export default async function Orders({ searchParams }: { searchParams: Promise<{ ansicht?: string; archiv?: string }> }) {
  const { ansicht, archiv } = await searchParams;
  const board = ansicht !== "liste";
  const ctx = await getContext();
  let q = ctx.supabase.from("orders")
    .select("id, number, title, status, total_gross, scheduled_start, customers(type, first_name, last_name, company_name), vehicles(make, model, variant, license_plate)")
    .eq("company_id", ctx.companyId).order("scheduled_start", { ascending: true, nullsFirst: false }).limit(500);
  q = archiv ? q.in("status", ["abgeschlossen", "storniert"]) : q.not("status", "in", "(abgeschlossen,storniert)");
  const { data } = await q;
  const orders = (data ?? []) as Row[];

  const card = (o: Row) => {
    const v = o.vehicles as Parameters<typeof vehicleDisplayName>[0] | null;
    return (
      <Link key={o.id} href={`/app/auftraege/${o.id}`} className="block rounded-xl border border-border bg-card p-3 shadow-xs transition hover:border-foreground/20">
        <p className="text-sm font-medium">{v ? vehicleDisplayName(v) : "Ohne Fahrzeug"}</p>
        <p className="truncate text-xs text-muted-foreground">{customerDisplayName(o.customers as Parameters<typeof customerDisplayName>[0])}</p>
        {o.title && <p className="mt-1 line-clamp-2 text-xs">{o.title}</p>}
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{o.scheduled_start ? formatDateTime(o.scheduled_start) : o.number}</span><span className="tabular-nums">{formatEUR(o.total_gross)}</span>
        </div>
      </Link>
    );
  };

  return (
    <>
      <PageHeader title="Aufträge" actions={<>
        <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
          <Link href={`/app/auftraege${archiv ? "?archiv=1" : ""}`} className={`rounded-md px-3 py-1 ${board ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>Board</Link>
          <Link href={`/app/auftraege?ansicht=liste${archiv ? "&archiv=1" : ""}`} className={`rounded-md px-3 py-1 ${!board ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>Liste</Link>
        </div>
        <LinkButton href="/app/angebote/neu?ziel=order"><Plus className="size-4" />Neuer Auftrag</LinkButton>
      </>} />
      <div className="mb-4"><Link href={archiv ? "/app/auftraege" : "/app/auftraege?archiv=1&ansicht=liste"} className={buttonClass("ghost", "sm")}>{archiv ? "← Aktive Aufträge" : "Abgeschlossene & stornierte anzeigen"}</Link></div>
      {!orders.length ? (
        <EmptyState icon={<ClipboardList className="size-5" />} title={archiv ? "Kein Archiv" : "Keine offenen Aufträge"} description="Lege einen Auftrag direkt an oder wandle ein angenommenes Angebot um." action={!archiv && <LinkButton href="/app/angebote/neu?ziel=order">Auftrag anlegen</LinkButton>} />
      ) : board && !archiv ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          <div className="flex gap-3">
            {[...ORDER_BOARD_COLUMNS, "fertig" as OrderStatus].filter((s, i, a) => a.indexOf(s) === i).map((s) => {
              const col = orders.filter((o) => o.status === s || (s === "anfrage" && o.status === "angebot_erstellt"));
              return (
                <div key={s} className="w-64 shrink-0">
                  <div className="mb-2 flex items-center justify-between px-1 text-sm"><span className="font-medium">{ORDER_STATUS_LABELS[s]}</span><span className="text-muted-foreground">{col.length}</span></div>
                  <div className="min-h-24 space-y-2 rounded-xl bg-muted/60 p-2">{col.map(card)}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {orders.map((o) => {
            const v = o.vehicles as Parameters<typeof vehicleDisplayName>[0] | null;
            return (
              <Link key={o.id} href={`/app/auftraege/${o.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate font-medium">{v ? vehicleDisplayName(v) : "Ohne Fahrzeug"} <span className="font-normal text-muted-foreground">· {customerDisplayName(o.customers as Parameters<typeof customerDisplayName>[0])}</span></p>
                  <p className="truncate text-sm text-muted-foreground">{o.number}{o.title && ` · ${o.title}`}{o.scheduled_start && ` · ${formatDateTime(o.scheduled_start)}`}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3"><span className="text-sm tabular-nums">{formatEUR(o.total_gross)}</span><OrderStatusBadge status={o.status} /></div>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
