import Link from "next/link";
import { Receipt } from "lucide-react";
import { Badge, Card, EmptyState, Notice, PageHeader, Stat, buttonClass } from "@/components/ui";
import { getContext } from "@/lib/auth";
import { customerDisplayName } from "@/lib/domain";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONE as statusTone, type InvoiceStatus } from "@/lib/invoice";
import { formatDate, formatEUR } from "@/lib/utils";
import { createBlankInvoice } from "@/app/actions/invoices";

export const metadata = { title: "Rechnungen" };

export default async function Invoices({ searchParams }: { searchParams: Promise<{ status?: string; fehler?: string }> }) {
  const { status, fehler } = await searchParams;
  const ctx = await getContext();
  let q = ctx.supabase.from("invoices").select("id, number, kind, status, total_gross, paid_amount, issue_date, due_date, created_at, customers(type, first_name, last_name, company_name)")
    .eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(300);
  if (status && status in INVOICE_STATUS_LABELS) q = q.eq("status", status);
  const [{ data }, { data: open }, { data: customers }] = await Promise.all([
    q,
    ctx.supabase.from("invoices").select("total_gross, paid_amount, due_date").eq("company_id", ctx.companyId).eq("status", "finalized").eq("kind", "invoice"),
    ctx.supabase.from("customers").select("id, type, first_name, last_name, company_name").is("merged_into", null).order("last_name").limit(1000),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const openSum = (open ?? []).reduce((a, i) => a + Number(i.total_gross) - Number(i.paid_amount), 0);
  const overdue = (open ?? []).filter((i) => i.due_date && i.due_date < today);
  return (
    <>
      <PageHeader title="Rechnungen" description="Rechnungen aus Aufträgen erstellen, finalisieren und als E-Rechnung (XRechnung) herunterladen." />
      {fehler && <div className="mb-4"><Notice tone="red">{fehler}</Notice></div>}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Offene Rechnungen" value={formatEUR(openSum)} hint={`${open?.length ?? 0} Rechnung(en)`} href="/app/rechnungen?status=finalized" />
        <Stat label="Überfällig" value={overdue.length} hint={formatEUR(overdue.reduce((a, i) => a + Number(i.total_gross) - Number(i.paid_amount), 0))} href="/app/rechnungen?status=finalized" />
        <Card className="col-span-2 p-4 lg:col-span-1">
          <p className="text-xs font-medium text-muted-foreground">Neue Rechnung ohne Auftrag</p>
          <form action={createBlankInvoice} className="mt-2 flex gap-2">
            <select name="customer_id" required defaultValue="" className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-sm">
              <option value="" disabled>Kunde wählen …</option>
              {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{customerDisplayName(c)}</option>)}
            </select>
            <button className={buttonClass("primary", "sm", "h-9")}>Erstellen</button>
          </form>
        </Card>
      </div>
      {ctx.role !== "staff" && (
        <details className="mb-4 rounded-xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Export für den Steuerberater (DATEV / Excel)</summary>
          <form action="/app/rechnungen/export" method="get" className="mt-3 flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="firma" value={ctx.companyId} />
            <label className="flex flex-col gap-1">Von<input type="date" name="von" required defaultValue={firstOfLastMonth()} className="h-9 rounded-lg border border-border bg-card px-2" /></label>
            <label className="flex flex-col gap-1">Bis<input type="date" name="bis" required defaultValue={lastOfLastMonth()} className="h-9 rounded-lg border border-border bg-card px-2" /></label>
            <button name="format" value="datev" className={buttonClass("primary", "sm", "h-9")}>DATEV-Buchungsstapel</button>
            <button name="format" value="csv" className={buttonClass("secondary", "sm", "h-9")}>Rechnungsausgangsbuch (Excel)</button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Konten und Berater-/Mandantennummer unter Einstellungen › Buchhaltung. Ersten Import bitte mit dem Steuerberater testen.</p>
        </details>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/app/rechnungen" className={buttonClass(!status ? "primary" : "secondary", "sm")}>Alle</Link>
        {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((s) => <Link key={s} href={`/app/rechnungen?status=${s}`} className={buttonClass(status === s ? "primary" : "secondary", "sm")}>{INVOICE_STATUS_LABELS[s]}</Link>)}
      </div>
      {!data?.length ? (
        <EmptyState icon={<Receipt className="size-5" />} title="Noch keine Rechnungen" description="Öffne einen abgeschlossenen Auftrag und tippe auf „Rechnung erstellen“." action={<Link href="/app/auftraege" className={buttonClass("primary")}>Zu den Aufträgen</Link>} />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {data.map((i) => {
            const st = i.status as InvoiceStatus;
            const late = st === "finalized" && i.due_date && i.due_date < today;
            return (
              <Link key={i.id} href={`/app/rechnungen/${i.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate font-medium">{customerDisplayName(i.customers as unknown as Parameters<typeof customerDisplayName>[0])}</p>
                  <p className="text-sm text-muted-foreground">{i.kind === "cancellation" ? "Storno " : ""}{i.number ?? "Entwurf"} · {formatDate(i.issue_date ?? i.created_at)}{i.due_date && st === "finalized" ? ` · fällig ${formatDate(i.due_date)}` : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3"><span className="text-sm font-medium tabular-nums">{formatEUR(i.total_gross)}</span><Badge tone={late ? "red" : statusTone[st]}>{late ? "Überfällig" : INVOICE_STATUS_LABELS[st]}</Badge></div>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}

function firstOfLastMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10).slice(0, 8) + "01";
}
function lastOfLastMonth() {
  const d = new Date(); d.setDate(0);
  return d.toISOString().slice(0, 10);
}
