import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Card, EmptyState, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { QuoteStatusBadge } from "@/components/status";
import { getContext } from "@/lib/auth";
import { customerDisplayName, QUOTE_STATUSES, QUOTE_STATUS_LABELS, vehicleDisplayName, type QuoteStatus } from "@/lib/domain";
import { formatDate, formatEUR } from "@/lib/utils";

export const metadata = { title: "Angebote" };

export default async function Quotes({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const ctx = await getContext();
  let q = ctx.supabase.from("quotes")
    .select("id, number, status, total_gross, created_at, valid_until, customers(type, first_name, last_name, company_name), vehicles(make, model, variant)")
    .eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(200);
  if (status && (QUOTE_STATUSES as readonly string[]).includes(status)) q = q.eq("status", status);
  const { data } = await q;
  return (
    <>
      <PageHeader title="Angebote" actions={<LinkButton href="/app/angebote/neu"><Plus className="size-4" />Neues Angebot</LinkButton>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/app/angebote" className={buttonClass(!status ? "primary" : "secondary", "sm")}>Alle</Link>
        {QUOTE_STATUSES.map((s) => <Link key={s} href={`/app/angebote?status=${s}`} className={buttonClass(status === s ? "primary" : "secondary", "sm")}>{QUOTE_STATUS_LABELS[s]}</Link>)}
      </div>
      {!data?.length ? (
        <EmptyState icon={<FileText className="size-5" />} title="Keine Angebote" description="Erstelle ein Angebot mit dem Kalkulator – in unter einer Minute." action={<LinkButton href="/app/angebote/neu">Angebot erstellen</LinkButton>} />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {data.map((x) => {
            const c = x.customers as unknown as Parameters<typeof customerDisplayName>[0];
            const v = x.vehicles as unknown as Parameters<typeof vehicleDisplayName>[0] | null;
            return (
              <Link key={x.id} href={`/app/angebote/${x.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate font-medium">{customerDisplayName(c)}{v && <span className="font-normal text-muted-foreground"> · {vehicleDisplayName(v)}</span>}</p>
                  <p className="text-sm text-muted-foreground">{x.number} · {formatDate(x.created_at)}{x.valid_until && ` · gültig bis ${formatDate(x.valid_until)}`}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3"><span className="text-sm font-medium tabular-nums">{formatEUR(x.total_gross)}</span><QuoteStatusBadge status={x.status as QuoteStatus} /></div>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
