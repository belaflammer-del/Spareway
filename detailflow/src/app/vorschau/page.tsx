import Link from "next/link";
import { CalendarClock, Car, ClipboardList, FileText, UserPlus } from "lucide-react";
import { Card, CardHeader, Stat, buttonClass } from "@/components/ui";
import { OrderStatusBadge, QuoteStatusBadge } from "@/components/status";
import { formatDate, formatEUR } from "@/lib/utils";
import type { OrderStatus } from "@/lib/domain";
import { orders } from "./demo";

export default function PreviewDashboard() {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  const counts = [3, 2, 4, 1, 3, 2, 0];
  const row = (o: (typeof orders)[number], t = false) => (
    <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0"><p className="truncate text-sm font-medium">{t && o.time && <span className="mr-2 tabular-nums text-muted-foreground">{o.time}</span>}{o.vehicle} – {o.title}</p><p className="truncate text-xs text-muted-foreground">{o.customer}</p></div>
      <OrderStatusBadge status={o.status as OrderStatus} />
    </div>
  );
  return (
    <>
      <div className="mb-6"><p className="text-sm text-muted-foreground">{formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</p><h1 className="text-2xl font-semibold tracking-tight">Guten Tag, Markus</h1></div>
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Neuer Kunde", UserPlus], ["Neues Fahrzeug", Car], ["Neues Angebot", FileText], ["Neuer Auftrag", ClipboardList]].map(([l, I]) => {
          const Icon = I as typeof Car;
          return <Link key={l as string} href="/vorschau/kalkulator" className={buttonClass("secondary", "md", "h-12 justify-start px-3")}><Icon className="size-4 shrink-0" /><span className="truncate">{l as string}</span></Link>;
        })}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Umsatz diesen Monat" value={formatEUR(14862.4)} hint="abgeschlossene Aufträge, brutto" />
        <Stat label="Aufträge diesen Monat" value={38} />
        <Stat label="Ø Auftragswert" value={formatEUR(391.12)} />
        <Stat label="Offene Anfragen" value={4} />
      </div>
      <Card className="mb-6">
        <CardHeader title="Diese Woche" />
        <div className="grid grid-cols-7 divide-x divide-border text-center">
          {days.map((d, i) => (
            <div key={i} className={`px-1 py-3 ${i === 0 ? "bg-muted/50" : ""}`}>
              <p className="text-[11px] uppercase text-muted-foreground">{formatDate(d, { weekday: "short" })}</p>
              <p className="text-sm font-medium">{formatDate(d, { day: "numeric" })}</p>
              <p className={`mt-1 text-xs ${counts[i] ? "font-medium text-accent" : "text-muted-foreground"}`}>{counts[i] ? <>{counts[i]}<span className="hidden sm:inline"> Termin{counts[i] > 1 ? "e" : ""}</span></> : "–"}</p>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Heute" description="3 Termine" action={<CalendarClock className="size-4 text-muted-foreground" />} /><div className="divide-y divide-border">{[orders[3], orders[0], orders[1]].map((o) => row(o, true))}</div></Card>
        <Card><CardHeader title="In Bearbeitung" action={<span className="text-sm text-accent">Alle</span>} /><div className="divide-y divide-border">{[orders[0], orders[3], orders[5]].map((o) => row(o))}</div></Card>
        <Card><CardHeader title="Abholbereit" description="Kunden informieren" /><div className="divide-y divide-border">{row(orders[2])}</div></Card>
        <Card>
          <CardHeader title="Offene Angebote" description="Entwürfe und noch nicht beantwortete" />
          <div className="divide-y divide-border">
            {[["Jonas Becker", "AN-2026-0001", 1283.77, "sent"], ["Aylin Yilmaz", "AN-2026-0002", 213.49, "draft"], ["Dr. Marc Richter", "AN-2026-0003", 534.31, "sent"]].map(([n, nr, t, st]) => (
              <div key={nr as string} className="flex items-center justify-between gap-3 px-5 py-3">
                <div><p className="text-sm font-medium">{n}</p><p className="text-xs text-muted-foreground">{nr}</p></div>
                <div className="flex items-center gap-2"><span className="text-sm tabular-nums">{formatEUR(t as number)}</span><QuoteStatusBadge status={st as "sent" | "draft"} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
