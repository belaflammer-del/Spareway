import Link from "next/link";
import { CalendarClock, Car, ClipboardList, FileText, Plus, Receipt, UserPlus } from "lucide-react";
import { Card, CardHeader, Notice, Stat, buttonClass } from "@/components/ui";
import { OrderStatusBadge, QuoteStatusBadge } from "@/components/status";
import { getContext } from "@/lib/auth";
import { ACTIVE_ORDER_STATUSES, customerDisplayName, vehicleDisplayName, type OrderStatus, type QuoteStatus } from "@/lib/domain";
import { formatDate, formatEUR, formatTime } from "@/lib/utils";

export const metadata = { title: "Übersicht" };

function berlinDayBounds(offsetDays = 0) {
  const now = new Date();
  const d = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const diff = now.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "Europe/Berlin" })).getTime();
  return new Date(d.getTime() + diff);
}

export default async function Dashboard() {
  const ctx = await getContext();
  const sb = ctx.supabase;
  const todayStart = berlinDayBounds(0);
  const tomorrow = berlinDayBounds(1);
  const weekEnd = berlinDayBounds(7);
  const monthStart = new Date(todayStart); monthStart.setDate(1);

  const sel = "id, number, title, status, total_gross, scheduled_start, customers(type, first_name, last_name, company_name), vehicles(make, model, variant)";
  const [today, week, running, ready, requests, openQuotes, monthDone] = await Promise.all([
    sb.from("orders").select(sel).eq("company_id", ctx.companyId).gte("scheduled_start", todayStart.toISOString()).lt("scheduled_start", tomorrow.toISOString()).neq("status", "storniert").order("scheduled_start"),
    sb.from("orders").select("id, scheduled_start, status").eq("company_id", ctx.companyId).gte("scheduled_start", todayStart.toISOString()).lt("scheduled_start", weekEnd.toISOString()).neq("status", "storniert"),
    sb.from("orders").select(sel).eq("company_id", ctx.companyId).in("status", ACTIVE_ORDER_STATUSES).order("scheduled_start").limit(8),
    sb.from("orders").select(sel).eq("company_id", ctx.companyId).eq("status", "abholbereit").limit(8),
    sb.from("orders").select("id", { count: "exact", head: true }).eq("company_id", ctx.companyId).eq("status", "anfrage"),
    sb.from("quotes").select("id, number, status, total_gross, valid_until, customers(type, first_name, last_name, company_name)").eq("company_id", ctx.companyId).in("status", ["draft", "sent"]).order("created_at", { ascending: false }).limit(6),
    sb.from("orders").select("total_gross").eq("company_id", ctx.companyId).eq("status", "abgeschlossen").gte("completed_at", monthStart.toISOString()),
  ]);
  const revenue = (monthDone.data ?? []).reduce((a, o) => a + Number(o.total_gross), 0);
  const count = monthDone.data?.length ?? 0;
  const days = Array.from({ length: 7 }, (_, i) => berlinDayBounds(i));

  type O = { id: string; number: string; title: string | null; status: string; total_gross: number; scheduled_start: string | null; customers: unknown; vehicles: unknown };
  const orderRow = (o: O, showTime = false) => (
    <Link key={o.id} href={`/app/auftraege/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {showTime && o.scheduled_start && <span className="mr-2 tabular-nums text-muted-foreground">{formatTime(o.scheduled_start)}</span>}
          {o.vehicles ? vehicleDisplayName(o.vehicles as Parameters<typeof vehicleDisplayName>[0]) : "Fahrzeug"}{o.title && ` – ${o.title}`}
        </p>
        <p className="truncate text-xs text-muted-foreground">{customerDisplayName(o.customers as Parameters<typeof customerDisplayName>[0])}</p>
      </div>
      <OrderStatusBadge status={o.status as OrderStatus} />
    </Link>
  );

  const quick = [
    { href: "/app/kunden/neu", label: "Neuer Kunde", icon: UserPlus },
    { href: "/app/fahrzeuge/neu", label: "Neues Fahrzeug", icon: Car },
    { href: "/app/angebote/neu", label: "Neues Angebot", icon: FileText },
    { href: "/app/angebote/neu?ziel=order", label: "Neuer Auftrag", icon: ClipboardList },
  ];

  return (
    <>
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Guten Tag{ctx.user.user_metadata?.full_name ? `, ${String(ctx.user.user_metadata.full_name).split(" ")[0]}` : ""}</h1>
      </div>
      {!ctx.company.onboarding_completed && ctx.isAdmin && (
        <div className="mb-6"><Notice>Deine Einrichtung ist noch nicht abgeschlossen. <Link href="/onboarding?schritt=2" className="font-medium underline">Jetzt fortsetzen</Link></Notice></div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quick.map((q) => (
          <Link key={q.href} href={q.href} className={buttonClass("secondary", "md", "h-12 justify-start")}><Plus className="size-4 text-muted-foreground" /><q.icon className="size-4" />{q.label}</Link>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Umsatz diesen Monat" value={formatEUR(revenue)} hint="abgeschlossene Aufträge, brutto" />
        <Stat label="Aufträge diesen Monat" value={count} />
        <Stat label="Ø Auftragswert" value={formatEUR(count ? revenue / count : 0)} />
        <Stat label="Offene Anfragen" value={requests.count ?? 0} href="/app/auftraege" />
      </div>

      <Card className="mb-6">
        <CardHeader title="Diese Woche" />
        <div className="grid grid-cols-7 divide-x divide-border text-center">
          {days.map((d, i) => {
            const next = berlinDayBounds(i + 1);
            const n = (week.data ?? []).filter((o) => o.scheduled_start && new Date(o.scheduled_start) >= d && new Date(o.scheduled_start) < next).length;
            return (
              <div key={i} className={`px-1 py-3 ${i === 0 ? "bg-muted/50" : ""}`}>
                <p className="text-[11px] uppercase text-muted-foreground">{formatDate(d, { weekday: "short" })}</p>
                <p className="text-sm font-medium">{formatDate(d, { day: "numeric" })}</p>
                <p className={`mt-1 text-xs ${n ? "font-medium text-accent" : "text-muted-foreground"}`}>{n ? `${n} Termin${n > 1 ? "e" : ""}` : "–"}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Heute" description={`${today.data?.length ?? 0} Termine`} action={<CalendarClock className="size-4 text-muted-foreground" />} />
          {today.data?.length ? <div className="divide-y divide-border">{(today.data as O[]).map((o) => orderRow(o, true))}</div> : <p className="px-5 py-6 text-sm text-muted-foreground">Heute stehen keine Termine an.</p>}
        </Card>
        <Card>
          <CardHeader title="In Bearbeitung" action={<Link href="/app/auftraege" className="text-sm text-accent">Alle</Link>} />
          {running.data?.length ? <div className="divide-y divide-border">{(running.data as O[]).map((o) => orderRow(o))}</div> : <p className="px-5 py-6 text-sm text-muted-foreground">Keine laufenden Aufträge.</p>}
        </Card>
        <Card>
          <CardHeader title="Abholbereit" description="Kunden informieren" />
          {ready.data?.length ? <div className="divide-y divide-border">{(ready.data as O[]).map((o) => orderRow(o))}</div> : <p className="px-5 py-6 text-sm text-muted-foreground">Keine Fahrzeuge zur Abholung.</p>}
        </Card>
        <Card>
          <CardHeader title="Offene Angebote" description="Entwürfe und noch nicht beantwortete" action={<Link href="/app/angebote" className="text-sm text-accent">Alle</Link>} />
          {openQuotes.data?.length ? (
            <div className="divide-y divide-border">
              {openQuotes.data.map((q) => (
                <Link key={q.id} href={`/app/angebote/${q.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50">
                  <div><p className="text-sm font-medium">{customerDisplayName(q.customers as unknown as Parameters<typeof customerDisplayName>[0])}</p><p className="text-xs text-muted-foreground">{q.number}{q.valid_until && ` · bis ${formatDate(q.valid_until)}`}</p></div>
                  <div className="flex items-center gap-2"><span className="text-sm tabular-nums">{formatEUR(q.total_gross)}</span><QuoteStatusBadge status={q.status as QuoteStatus} /></div>
                </Link>
              ))}
            </div>
          ) : <p className="px-5 py-6 text-sm text-muted-foreground">Keine offenen Angebote.</p>}
        </Card>
        <Card className="lg:col-span-2 p-5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground"><Receipt className="size-4" />Offene Rechnungen & Aufgaben</p>
          <p className="mt-1">Das Rechnungsmodul und die Aufgabenliste folgen in Phase 3/4. Bis dahin werden hier keine Platzhalterzahlen angezeigt.</p>
        </Card>
      </div>
    </>
  );
}
