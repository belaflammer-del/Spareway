import { Card, CardHeader, Notice, PageHeader, Stat } from "@/components/ui";
import { MonthBars, RankBars } from "@/components/charts";
import { getContext } from "@/lib/auth";
import { hasFeature } from "@/lib/plans";
import { DAYS, normalizePricingConfig } from "@/lib/domain";
import { addDays, berlinDay, berlinParts, dayStart } from "@/lib/time";
import { formatDate, formatEUR } from "@/lib/utils";
import { formatMinutes } from "@/lib/pricing";

export const metadata = { title: "Auswertungen" };

export default async function Analytics() {
  const ctx = await getContext();
  if (!(await hasFeature(ctx, "analytics"))) {
    return (
      <>
        <PageHeader title="Auswertungen" />
        <Notice>Auswertungen sind ab dem Tarif <strong>Professional</strong> enthalten. Den Tarif kannst du unter Einstellungen einsehen.</Notice>
      </>
    );
  }
  const today = berlinDay(new Date());
  const p = berlinParts(new Date());
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(p.year, p.month - 1 - (11 - i), 1));
    return d.toISOString().slice(0, 7);
  });
  const monthStart = today.slice(0, 8) + "01";
  const nextMonth = new Date(Date.UTC(p.year, p.month, 1)).toISOString().slice(0, 10);

  const [{ data: monthly }, { data: services }, { data: qstats }, { data: done }, { data: booked }, { data: boxes }] = await Promise.all([
    ctx.supabase.from("v_revenue_monthly").select("*").eq("company_id", ctx.companyId).gte("month", months[0] + "-01"),
    ctx.supabase.from("v_service_revenue").select("title, times, net").eq("company_id", ctx.companyId).order("net", { ascending: false }).limit(10),
    ctx.supabase.from("v_quote_stats").select("*").eq("company_id", ctx.companyId).maybeSingle(),
    ctx.supabase.from("orders").select("customer_id, total_net").eq("company_id", ctx.companyId).eq("status", "abgeschlossen"),
    ctx.supabase.from("orders").select("scheduled_start, scheduled_end").eq("company_id", ctx.companyId).neq("status", "storniert")
      .gte("scheduled_start", dayStart(monthStart).toISOString()).lt("scheduled_start", dayStart(nextMonth).toISOString()),
    ctx.supabase.from("workstations").select("id").eq("company_id", ctx.companyId).eq("active", true),
  ]);

  const byMonth = new Map((monthly ?? []).map((m) => [String(m.month).slice(0, 7), m]));
  const rows = months.map((m) => {
    const r = byMonth.get(m);
    const net = Number(r?.net ?? 0), material = Number(r?.material ?? 0), minutes = Number(r?.minutes ?? 0);
    const labor = (normalizePricingConfig(ctx.company.pricing_config).internalHourlyCost * minutes) / 60;
    return { month: m, orders: Number(r?.orders ?? 0), net, material, minutes, profit: net - material - labor };
  });
  const year = rows.reduce((a, r) => ({ net: a.net + r.net, orders: a.orders + r.orders, profit: a.profit + r.profit, minutes: a.minutes + r.minutes, material: a.material + r.material }), { net: 0, orders: 0, profit: 0, minutes: 0, material: 0 });

  const perCustomer = new Map<string, number>();
  for (const o of done ?? []) perCustomer.set(o.customer_id, (perCustomer.get(o.customer_id) ?? 0) + 1);
  const repeat = [...perCustomer.values()].filter((n) => n > 1).length;
  const repeatPct = perCustomer.size ? Math.round((repeat / perCustomer.size) * 100) : 0;
  const acceptRate = qstats?.sent ? Math.round((qstats.accepted / qstats.sent) * 100) : null;

  // Auslastung im laufenden Monat: geplante Stunden / (Öffnungsstunden × aktive Boxen)
  const hours = ctx.company.opening_hours ?? {};
  let capacity = 0;
  for (let d = monthStart; d < nextMonth; d = addDays(d, 1)) {
    const wd = new Date(d + "T12:00:00Z").getUTCDay() || 7;
    const h = hours[DAYS[wd - 1][0]];
    if (h?.open) { const [fh, fm] = h.from.split(":").map(Number); const [th, tm] = h.to.split(":").map(Number); capacity += Math.max(0, th * 60 + tm - fh * 60 - fm); }
  }
  capacity *= Math.max(1, boxes?.length ?? 1);
  const bookedMin = (booked ?? []).reduce((a, o) => a + (o.scheduled_end ? (new Date(o.scheduled_end).getTime() - new Date(o.scheduled_start).getTime()) / 60000 : 0), 0);
  const utilization = capacity ? Math.min(100, Math.round((bookedMin / capacity) * 100)) : null;

  const label = (m: string) => formatDate(new Date(m + "-15T12:00:00Z"), { month: "short" });

  return (
    <>
      <PageHeader title="Auswertungen" description="Abgeschlossene Aufträge der letzten 12 Monate, Beträge netto." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Umsatz (12 Monate)" value={formatEUR(year.net)} hint={`${year.orders} Aufträge`} />
        <Stat label="Ø Auftragswert" value={formatEUR(year.orders ? year.net / year.orders : 0)} />
        <Stat label="Geschätzter Gewinn" value={formatEUR(year.profit)} hint="nach Material & internen Stundenkosten" />
        <Stat label="Angebotsannahmequote" value={acceptRate === null ? "–" : `${acceptRate} %`} hint={`${qstats?.open ?? 0} Angebote offen`} />
        <Stat label="Wiederkehrende Kunden" value={`${repeatPct} %`} hint={`${repeat} von ${perCustomer.size} Kunden`} />
        <Stat label="Arbeitszeit (12 Monate)" value={formatMinutes(Math.round(year.minutes))} />
        <Stat label="Materialkosten (12 Monate)" value={formatEUR(year.material)} />
        <Stat label="Auslastung diesen Monat" value={utilization === null ? "–" : `${utilization} %`} hint="geplant / Öffnungszeit × Boxen" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader title="Umsatz pro Monat" description="netto, abgeschlossene Aufträge" />
          <div className="px-3 pb-2 pt-4">
            {year.net > 0 ? <MonthBars data={rows.map((r) => ({ label: label(r.month), value: r.net, hint: `${r.orders} Aufträge` }))} /> : <p className="px-2 py-10 text-center text-sm text-muted-foreground">Noch keine abgeschlossenen Aufträge.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Umsatz nach Leistung" description="Top 10, inkl. Pakete" />
          <div className="p-5">
            {services?.length ? <RankBars data={services.map((s) => ({ label: s.title.replace(/^Paket: /, "Paket · "), value: Number(s.net), sub: `${s.times}× gebucht` }))} /> : <p className="text-sm text-muted-foreground">Noch keine Daten.</p>}
          </div>
        </Card>
      </div>
      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Monatsübersicht" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr className="border-b border-border">
              <th className="px-5 py-2 font-medium">Monat</th><th className="px-3 py-2 text-right font-medium">Aufträge</th><th className="px-3 py-2 text-right font-medium">Umsatz</th>
              <th className="px-3 py-2 text-right font-medium">Material</th><th className="px-3 py-2 text-right font-medium">Arbeitszeit</th><th className="px-5 py-2 text-right font-medium">Gesch. Gewinn</th>
            </tr></thead>
            <tbody className="tabular-nums">
              {[...rows].reverse().map((r) => (
                <tr key={r.month} className="border-b border-border last:border-0">
                  <td className="px-5 py-2">{formatDate(new Date(r.month + "-15T12:00:00Z"), { month: "long", year: "numeric" })}</td>
                  <td className="px-3 py-2 text-right">{r.orders}</td><td className="px-3 py-2 text-right">{formatEUR(r.net)}</td>
                  <td className="px-3 py-2 text-right">{formatEUR(r.material)}</td><td className="px-3 py-2 text-right">{formatMinutes(r.minutes)}</td>
                  <td className="px-5 py-2 text-right">{formatEUR(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
