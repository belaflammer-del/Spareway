import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Card, CardHeader, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { OrderStatusBadge } from "@/components/status";
import { getContext } from "@/lib/auth";
import { vehicleDisplayName, type OrderStatus } from "@/lib/domain";
import { addDays, berlinDay, berlinParts, dayStart, isValidDay, weekStart } from "@/lib/time";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Kalender" };

type View = "tag" | "woche" | "monat";
type Ev = {
  id: string; number: string; title: string | null; status: OrderStatus; scheduled_start: string; scheduled_end: string;
  workstation_id: string | null; customers: unknown; vehicles: unknown;
};

const HOUR_FROM = 7, HOUR_TO = 20, PX = 52; // Pixel pro Stunde
const COLORS = ["bg-teal-100 border-teal-400 text-teal-950 dark:bg-teal-950 dark:border-teal-600 dark:text-teal-100",
  "bg-sky-100 border-sky-400 text-sky-950 dark:bg-sky-950 dark:border-sky-600 dark:text-sky-100",
  "bg-amber-100 border-amber-400 text-amber-950 dark:bg-amber-950 dark:border-amber-600 dark:text-amber-100",
  "bg-violet-100 border-violet-400 text-violet-950 dark:bg-violet-950 dark:border-violet-600 dark:text-violet-100",
  "bg-rose-100 border-rose-400 text-rose-950 dark:bg-rose-950 dark:border-rose-600 dark:text-rose-100"];
const NONE = "bg-zinc-100 border-zinc-400 text-zinc-900 dark:bg-zinc-800 dark:border-zinc-500 dark:text-zinc-100";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ ansicht?: string; datum?: string }> }) {
  const sp = await searchParams;
  const view: View = sp.ansicht === "tag" || sp.ansicht === "monat" ? sp.ansicht : "woche";
  const today = berlinDay(new Date());
  const day = isValidDay(sp.datum) ? sp.datum : today;
  const ctx = await getContext();

  let from: string, to: string;
  if (view === "tag") { from = day; to = addDays(day, 1); }
  else if (view === "woche") { from = weekStart(day); to = addDays(from, 7); }
  else { const first = day.slice(0, 8) + "01"; from = weekStart(first); to = addDays(from, 42); }

  const [{ data }, { data: boxes }, { data: unplanned }] = await Promise.all([
    ctx.supabase.from("orders")
      .select("id, number, title, status, scheduled_start, scheduled_end, workstation_id, customers(type, first_name, last_name, company_name), vehicles(make, model, variant, license_plate)")
      .eq("company_id", ctx.companyId).neq("status", "storniert")
      .lt("scheduled_start", dayStart(to).toISOString()).gt("scheduled_end", dayStart(from).toISOString())
      .order("scheduled_start").limit(1000),
    ctx.supabase.from("workstations").select("id, name").eq("company_id", ctx.companyId).eq("active", true).order("sort"),
    ctx.supabase.from("orders").select("id, number, title, status, vehicles(make, model, variant)").eq("company_id", ctx.companyId)
      .is("scheduled_start", null).in("status", ["anfrage", "bestaetigt"]).order("created_at").limit(20),
  ]);
  const events = (data ?? []) as Ev[];
  const boxIndex = new Map((boxes ?? []).map((b, i) => [b.id, i]));
  const color = (e: Ev) => (e.workstation_id && boxIndex.has(e.workstation_id) ? COLORS[boxIndex.get(e.workstation_id)! % COLORS.length] : NONE);
  const label = (e: Ev) => (e.vehicles ? vehicleDisplayName(e.vehicles as Parameters<typeof vehicleDisplayName>[0]) : e.number);

  const step = view === "tag" ? 1 : view === "woche" ? 7 : 0;
  const prev = view === "monat" ? shiftMonth(day, -1) : addDays(day, -step);
  const next = view === "monat" ? shiftMonth(day, 1) : addDays(day, step);
  const q = (v: View, d: string) => `/app/kalender?ansicht=${v}&datum=${d}`;
  const title = view === "tag" ? formatDate(dayStart(day), { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : view === "woche" ? `${formatDate(dayStart(from), { day: "numeric", month: "short" })} – ${formatDate(dayStart(addDays(from, 6)), { day: "numeric", month: "short", year: "numeric" })}`
    : formatDate(dayStart(day.slice(0, 8) + "15"), { month: "long", year: "numeric" });

  const timed = (e: Ev, d: string) => {
    // Anteil des Termins an diesem Tag, in Berliner Zeit, auf das Raster begrenzt
    const s = new Date(Math.max(new Date(e.scheduled_start).getTime(), dayStart(d).getTime()));
    const en = new Date(Math.min(new Date(e.scheduled_end).getTime(), dayStart(addDays(d, 1)).getTime()));
    const sp2 = berlinParts(s), ep = berlinParts(en);
    const startH = Math.max(HOUR_FROM, sp2.hour + sp2.minute / 60);
    const endH = Math.min(HOUR_TO, (berlinDay(en) !== d ? 24 : ep.hour + ep.minute / 60));
    if (endH <= HOUR_FROM || startH >= HOUR_TO) return null;
    return { top: (startH - HOUR_FROM) * PX, height: Math.max(22, (endH - startH) * PX - 2) };
  };
  const onDay = (e: Ev, d: string) => new Date(e.scheduled_start) < dayStart(addDays(d, 1)) && new Date(e.scheduled_end) > dayStart(d);

  const grid = (cols: { key: string; label: React.ReactNode; day: string; filter: (e: Ev) => boolean; highlight?: boolean }[]) => (
    <div className="overflow-x-auto">
      <div style={{ minWidth: cols.length > 3 ? cols.length * 110 + 48 : undefined }}>
        <div className="grid border-b border-border" style={{ gridTemplateColumns: `48px repeat(${cols.length}, minmax(0,1fr))` }}>
          <div />
          {cols.map((c) => <div key={c.key} className={cn("px-2 py-2 text-center text-sm", c.highlight && "font-semibold text-accent")}>{c.label}</div>)}
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: `48px repeat(${cols.length}, minmax(0,1fr))`, height: (HOUR_TO - HOUR_FROM) * PX }}>
          <div className="relative">
            {Array.from({ length: HOUR_TO - HOUR_FROM }, (_, i) => <span key={i} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground" style={{ top: i * PX }}>{i === 0 ? "" : `${HOUR_FROM + i}:00`}</span>)}
          </div>
          {cols.map((c) => (
            <div key={c.key} className={cn("relative border-l border-border", c.highlight && "bg-accent-soft/20")}>
              {Array.from({ length: HOUR_TO - HOUR_FROM }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * PX }} />)}
              {events.filter((e) => onDay(e, c.day) && c.filter(e)).map((e) => {
                const pos = timed(e, c.day);
                if (!pos) return null;
                return (
                  <Link key={e.id} href={`/app/auftraege/${e.id}`} className={cn("absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-[11px] leading-tight shadow-xs transition hover:brightness-95", color(e))} style={pos}>
                    <span className="block font-semibold tabular-nums">{formatDate(e.scheduled_start, { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="block truncate font-medium">{label(e)}</span>
                    {pos.height > 50 && <span className="block truncate opacity-80">{e.title}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  let body: React.ReactNode;
  if (view === "woche") {
    body = grid(Array.from({ length: 7 }, (_, i) => {
      const d = addDays(from, i);
      return { key: d, day: d, filter: () => true, highlight: d === today, label: <Link href={q("tag", d)} className="hover:underline"><span className="block text-[11px] uppercase text-muted-foreground">{formatDate(dayStart(d), { weekday: "short" })}</span>{formatDate(dayStart(d), { day: "numeric" })}</Link> };
    }));
  } else if (view === "tag") {
    const cols = [...(boxes ?? []).map((b) => ({ key: b.id, day, label: b.name, filter: (e: Ev) => e.workstation_id === b.id })),
      { key: "none", day, label: "Ohne Box", filter: (e: Ev) => !e.workstation_id || !boxIndex.has(e.workstation_id) }];
    body = grid(cols);
  } else {
    const month = day.slice(0, 7);
    body = (
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => <div key={d} className="border-b border-border px-2 py-2 text-center text-xs uppercase text-muted-foreground">{d}</div>)}
          {Array.from({ length: 42 }, (_, i) => {
            const d = addDays(from, i);
            const evs = events.filter((e) => onDay(e, d));
            return (
              <div key={d} className={cn("min-h-24 border-b border-l border-border p-1.5 text-xs [&:nth-child(7n+1)]:border-l-0", !d.startsWith(month) && "bg-muted/40 text-muted-foreground")}>
                <Link href={q("tag", d)} className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full", d === today && "bg-foreground text-background font-semibold")}>{Number(d.slice(8))}</Link>
                <div className="space-y-0.5">
                  {evs.slice(0, 3).map((e) => (
                    <Link key={e.id} href={`/app/auftraege/${e.id}`} className={cn("block truncate rounded border-l-2 px-1 py-0.5", color(e))}>
                      <span className="tabular-nums">{formatDate(e.scheduled_start, { hour: "2-digit", minute: "2-digit" })}</span> {label(e)}
                    </Link>
                  ))}
                  {evs.length > 3 && <Link href={q("tag", d)} className="block px-1 text-muted-foreground">+ {evs.length - 3} weitere</Link>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Kalender" description="Termine, Fahrzeugannahmen und Abholungen deines Teams." actions={<LinkButton href="/app/angebote/neu?ziel=order"><Plus className="size-4" />Neuer Termin</LinkButton>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={q(view, prev)} className={buttonClass("secondary", "sm", "w-8 px-0")} aria-label="Zurück"><ChevronLeft className="size-4" /></Link>
          <Link href={q(view, today)} className={buttonClass("secondary", "sm")}>Heute</Link>
          <Link href={q(view, next)} className={buttonClass("secondary", "sm", "w-8 px-0")} aria-label="Weiter"><ChevronRight className="size-4" /></Link>
          <h2 className="ml-1 font-semibold">{title}</h2>
        </div>
        <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
          {([["tag", "Tag"], ["woche", "Woche"], ["monat", "Monat"]] as const).map(([k, l]) => (
            <Link key={k} href={q(k, day)} className={cn("rounded-md px-3 py-1", view === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{l}</Link>
          ))}
        </div>
      </div>
      <Card className="overflow-hidden">{body}</Card>
      {(boxes?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {boxes!.map((b, i) => <span key={b.id} className="flex items-center gap-1.5"><span className={cn("size-3 rounded-sm border-l-[3px]", COLORS[i % COLORS.length])} />{b.name}</span>)}
          <span className="flex items-center gap-1.5"><span className={cn("size-3 rounded-sm border-l-[3px]", NONE)} />Ohne Box</span>
        </div>
      )}
      {(unplanned?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader title="Noch nicht eingeplant" description="Bestätigte Aufträge und Anfragen ohne Termin" />
          <div className="divide-y divide-border">
            {unplanned!.map((o) => (
              <Link key={o.id} href={`/app/auftraege/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50">
                <span className="min-w-0 truncate text-sm"><span className="font-medium">{o.vehicles ? vehicleDisplayName(o.vehicles as unknown as Parameters<typeof vehicleDisplayName>[0]) : o.number}</span>{o.title && <span className="text-muted-foreground"> · {o.title}</span>}</span>
                <OrderStatusBadge status={o.status as OrderStatus} />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function shiftMonth(day: string, n: number) {
  const [y, m] = day.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
