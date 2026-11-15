import { notFound } from "next/navigation";
import { Card, Notice, PageHeader, buttonClass } from "@/components/ui";
import { QuoteDocument } from "@/components/quote-document";
import { QuoteStatusBadge } from "@/components/status";
import { CopyButton, PrintButton } from "@/components/print-button";
import { ConfirmSubmit } from "@/components/confirm-button";
import { getContext } from "@/lib/auth";
import { customerDisplayName, type QuoteStatus } from "@/lib/domain";
import { formatDateTime, formatEUR } from "@/lib/utils";
import { formatMinutes } from "@/lib/pricing";
import { env } from "@/lib/env";
import { convertQuote, deleteQuote, setQuoteStatus } from "@/app/actions/quotes";

export default async function QuoteDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { id } = await params;
  const { fehler } = await searchParams;
  const ctx = await getContext();
  const { data: q } = await ctx.supabase.from("quotes")
    .select("*, customers(*), vehicles(make, model, license_plate), quote_items(*), orders(id, number)")
    .eq("id", id).maybeSingle();
  if (!q) notFound();
  const c = q.customers;
  let logoUrl: string | null = null;
  if (ctx.company.logo_path) {
    const { data } = await ctx.supabase.storage.from("company-files").createSignedUrl(ctx.company.logo_path, 3600);
    logoUrl = data?.signedUrl ?? null;
  }
  const status = q.status as QuoteStatus;
  const publicUrl = `${env.appUrl}/angebot/${q.public_token}`;
  const order = (q.orders as { id: string; number: string }[])[0];
  const items = [...(q.quote_items as { sort: number; title: string; description: string | null; quantity: number; unit_price_net: number; tax_rate: number; total_net: number }[])].sort((a, b) => a.sort - b.sort);

  const statusButton = (to: QuoteStatus, label: string, variant: "primary" | "secondary" = "secondary") => (
    <form action={setQuoteStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={to} /><button className={buttonClass(variant)}>{label}</button></form>
  );

  return (
    <>
      <div className="no-print">
        <PageHeader title={`Angebot ${q.number}`} description={`${customerDisplayName(c)} · ${formatEUR(q.total_gross)}`} actions={<><QuoteStatusBadge status={status} /></>} />
        {fehler && <div className="mb-4"><Notice tone="red">{fehler}</Notice></div>}
        <Card className="mb-6 flex flex-wrap items-center gap-2 p-4">
          {status === "draft" && statusButton("sent", "Als versendet markieren", "primary")}
          {status === "sent" && <>{statusButton("accepted", "Angenommen", "primary")}{statusButton("rejected", "Abgelehnt")}{statusButton("draft", "Zurück zu Entwurf")}</>}
          {(status === "expired") && statusButton("sent", "Erneut versenden")}
          {status === "rejected" && statusButton("draft", "Zurück zu Entwurf")}
          {status === "accepted" && (order
            ? <a href={`/app/auftraege/${order.id}`} className={buttonClass("primary")}>Zum Auftrag {order.number}</a>
            : <form action={convertQuote}><input type="hidden" name="id" value={id} /><button className={buttonClass("primary")}>In Auftrag umwandeln</button></form>)}
          <PrintButton />
          {status === "draft" && ctx.role !== "staff" && <form action={deleteQuote}><input type="hidden" name="id" value={id} /><ConfirmSubmit size="md" variant="ghost" message="Entwurf löschen?">Löschen</ConfirmSubmit></form>}
        </Card>
        {status !== "draft" && (
          <Card className="mb-6 p-4 text-sm">
            <p className="font-medium">Kundenlink zur Online-Annahme</p>
            <p className="mt-1 text-muted-foreground">Sende diesen Link an den Kunden (z. B. per E-Mail oder Messenger). Der automatische E-Mail-Versand ist noch nicht angebunden.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2"><code className="break-all rounded bg-muted px-2 py-1 text-xs">{publicUrl}</code><CopyButton text={publicUrl} /></div>
          </Card>
        )}
        {status === "draft" && <div className="mb-6"><Notice>Entwurf: Positionen sind noch änderbar. Nach dem Versenden wird das Angebot festgeschrieben. (Bearbeiten von Entwürfen: neu kalkulieren – Bearbeitungsmaske folgt.)</Notice></div>}
        <div className="mb-6 grid gap-3 text-sm sm:grid-cols-4">
          <Card className="p-3"><p className="text-xs text-muted-foreground">Dauer (geschätzt)</p><p className="font-medium">{formatMinutes(q.estimated_minutes)}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Materialkosten</p><p className="font-medium">{formatEUR(q.material_cost)}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Versendet</p><p className="font-medium">{q.sent_at ? formatDateTime(q.sent_at) : "–"}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Angenommen</p><p className="font-medium">{q.accepted_at ? formatDateTime(q.accepted_at) : "–"}</p></Card>
        </div>
      </div>
      <QuoteDocument q={{
        ...q,
        company: ctx.company,
        logoUrl,
        customer: { name: customerDisplayName(c), lines: [c.contact_person && c.type === "business" ? `z. Hd. ${c.contact_person}` : null, c.billing_street ?? c.street, [c.billing_zip ?? c.zip, c.billing_city ?? c.city].filter(Boolean).join(" ")].filter(Boolean) as string[] },
        vehicle: q.vehicles,
        items,
      }} />
    </>
  );
}
