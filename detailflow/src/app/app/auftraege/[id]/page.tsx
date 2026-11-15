import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { OrderStatusBadge } from "@/components/status";
import { OrderForm } from "@/components/order-form";
import { getContext } from "@/lib/auth";
import { customerDisplayName, ORDER_STATUSES, ORDER_STATUS_LABELS, vehicleDisplayName, type OrderStatus } from "@/lib/domain";
import { formatDateTime, formatEUR } from "@/lib/utils";
import { formatMinutes } from "@/lib/pricing";
import { setOrderStatus, toggleOrderItem } from "@/app/actions/orders";

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  anfrage: "bestaetigt", angebot_erstellt: "bestaetigt", bestaetigt: "geplant", geplant: "fahrzeug_angenommen",
  fahrzeug_angenommen: "in_bearbeitung", in_bearbeitung: "qualitaetskontrolle", qualitaetskontrolle: "fertig",
  fertig: "abholbereit", abholbereit: "abgeschlossen",
};

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const { data: o } = await ctx.supabase.from("orders")
    .select("*, customers(id, type, first_name, last_name, company_name, phone, email), vehicles(id, make, model, variant, license_plate, known_damages, special_notes), order_items(*), quotes(id, number)")
    .eq("id", id).maybeSingle();
  if (!o) notFound();
  const [{ data: members }, { data: history }] = await Promise.all([
    ctx.supabase.from("memberships").select("user_id, role").eq("company_id", ctx.companyId),
    ctx.supabase.from("order_status_history").select("to_status, changed_at").eq("order_id", id).order("changed_at", { ascending: false }).limit(20),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await ctx.supabase.from("profiles").select("user_id, full_name").in("user_id", ids) : { data: [] };
  const memberList = (members ?? []).map((m) => ({ id: m.user_id as string, name: profiles?.find((p) => p.user_id === m.user_id)?.full_name || (m.user_id === ctx.user.id ? ctx.user.email ?? "Ich" : "Mitarbeiter") }));

  const status = o.status as OrderStatus;
  const next = NEXT[status];
  const items = [...(o.order_items as { id: string; title: string; total_net: number; done: boolean; sort: number }[])].sort((a, b) => a.sort - b.sort);
  const doneCount = items.filter((i) => i.done).length;
  const c = o.customers;
  const v = o.vehicles;

  return (
    <>
      <PageHeader title={v ? vehicleDisplayName(v) : `Auftrag ${o.number}`} description={`${o.number} · ${customerDisplayName(c)}${o.scheduled_start ? ` · ${formatDateTime(o.scheduled_start)}` : ""}`} actions={<OrderStatusBadge status={status} />} />
      <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        {next ? (
          <form action={setOrderStatus}>
            <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={next} />
            <button className={buttonClass("primary")}>Weiter: {ORDER_STATUS_LABELS[next]}</button>
          </form>
        ) : <p className="text-sm text-muted-foreground">{status === "abgeschlossen" ? "Auftrag abgeschlossen." : "Auftrag storniert."}</p>}
        <form action={setOrderStatus} className="flex gap-2">
          <input type="hidden" name="id" value={id} />
          <select name="status" defaultValue={status} className="h-10 rounded-lg border border-border bg-card px-2 text-sm">
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
          </select>
          <button className={buttonClass("secondary")}>Status setzen</button>
        </form>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Leistungen" description={`${doneCount} von ${items.length} erledigt · geschätzt ${formatMinutes(o.estimated_minutes)}`} />
            <ul className="divide-y divide-border">
              {items.map((it) => (
                <li key={it.id}>
                  <form action={toggleOrderItem} className="flex">
                    <input type="hidden" name="item_id" value={it.id} /><input type="hidden" name="order_id" value={id} /><input type="hidden" name="done" value={String(!it.done)} />
                    <button className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm hover:bg-muted/50">
                      {it.done ? <CheckCircle2 className="size-5 text-accent" /> : <Circle className="size-5 text-muted-foreground" />}
                      <span className={`flex-1 ${it.done ? "text-muted-foreground line-through" : ""}`}>{it.title}</span>
                      <span className="tabular-nums text-muted-foreground">{formatEUR(it.total_net)}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-border px-5 py-4 text-sm">
              <div className="flex justify-between"><dt>Netto</dt><dd className="tabular-nums">{formatEUR(o.total_net)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Endpreis brutto</dt><dd className="tabular-nums">{formatEUR(o.total_gross)}</dd></div>
            </dl>
          </Card>
          <Card><CardHeader title="Planung & Notizen" /><div className="p-5"><OrderForm order={o} members={memberList} /></div></Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5 text-sm">
            <h3 className="font-medium">Kunde</h3>
            <Link href={`/app/kunden/${c.id}`} className="mt-1 block text-accent">{customerDisplayName(c)}</Link>
            {c.phone && <a href={`tel:${c.phone}`} className="block text-muted-foreground">{c.phone}</a>}
            {c.email && <a href={`mailto:${c.email}`} className="block text-muted-foreground">{c.email}</a>}
            {v && (<>
              <h3 className="mt-4 font-medium">Fahrzeug</h3>
              <Link href={`/app/fahrzeuge/${v.id}`} className="mt-1 block text-accent">{vehicleDisplayName(v)} {v.license_plate && `· ${v.license_plate}`}</Link>
              {v.known_damages && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Vorschäden: {v.known_damages}</p>}
              {v.special_notes && <p className="mt-1 text-xs text-muted-foreground">{v.special_notes}</p>}
            </>)}
            {o.quotes && <><h3 className="mt-4 font-medium">Angebot</h3><Link href={`/app/angebote/${o.quotes.id}`} className="mt-1 block text-accent">{o.quotes.number}</Link></>}
          </Card>
          <Card>
            <CardHeader title="Verlauf" />
            <ol className="space-y-2 px-5 py-4 text-sm">
              {(history ?? []).map((h, i) => (
                <li key={i} className="flex justify-between gap-2"><span>{ORDER_STATUS_LABELS[h.to_status as OrderStatus]}</span><span className="text-xs text-muted-foreground">{formatDateTime(h.changed_at)}</span></li>
              ))}
            </ol>
          </Card>
          <Card className="p-5 text-sm text-muted-foreground"><p className="font-medium text-foreground">Fotos & Checklisten</p><p className="mt-1">Vorher/Nachher-Fotos und digitale Checklisten folgen in Phase 3.</p></Card>
        </div>
      </div>
    </>
  );
}
