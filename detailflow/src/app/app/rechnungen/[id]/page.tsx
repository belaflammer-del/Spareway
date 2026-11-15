import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { Badge, Card, CardHeader, Notice, PageHeader, buttonClass } from "@/components/ui";
import { InvoiceDocument } from "@/components/invoice-document";
import { AddItemForm, DraftHeaderForm, PaymentForm } from "@/components/invoice-forms";
import { PrintButton } from "@/components/print-button";
import { ConfirmSubmit } from "@/components/confirm-button";
import { getContext } from "@/lib/auth";
import { customerDisplayName } from "@/lib/domain";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONE, toXInvoice, type InvoiceStatus } from "@/lib/invoice";
import { missingForXRechnung } from "@/lib/xrechnung";
import { formatDate, formatDateTime, formatEUR } from "@/lib/utils";
import { cancelInvoice, deleteDraftInvoice, deleteInvoiceItem, finalizeInvoice } from "@/app/actions/invoices";

export default async function InvoiceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { id } = await params;
  const { fehler } = await searchParams;
  const ctx = await getContext();
  const { data: inv } = await ctx.supabase.from("invoices")
    .select("*, invoice_items(*), invoice_payments(*), customers(*), orders(id, number), cancels:cancels_invoice_id(number)").eq("id", id).maybeSingle();
  if (!inv) notFound();
  const { data: cancelledBy } = await ctx.supabase.from("invoices").select("id, number").eq("cancels_invoice_id", id).maybeSingle();
  const status = inv.status as InvoiceStatus;
  const draft = status === "draft";
  const cu = inv.customers;
  const co = ctx.company as unknown as Record<string, unknown>;
  // Entwürfe zeigen die aktuellen Stammdaten, finalisierte Rechnungen die eingefrorenen
  const seller = inv.seller_snapshot ?? { name: co.name, street: co.street, zip: co.zip, city: co.city, phone: co.phone, email: co.email, contact_name: co.contact_name, tax_id: co.tax_id, vat_id: co.vat_id, small_business: co.small_business, iban: co.iban, bic: co.bic, bank_name: co.bank_name };
  const buyer = inv.buyer_snapshot ?? { name: customerDisplayName(cu), street: cu.billing_street ?? cu.street, zip: cu.billing_zip ?? cu.zip, city: cu.billing_city ?? cu.city, email: cu.email, vat_id: cu.vat_id, buyer_reference: cu.buyer_reference };
  const x = toXInvoice({ ...inv, seller_snapshot: seller, buyer_snapshot: buyer, cancels_number: (inv.cancels as { number: string } | null)?.number, items: inv.invoice_items });
  const missing = missingForXRechnung(x);
  const canFinalize = ctx.role !== "staff";
  const open = Number(inv.total_gross) - Number(inv.paid_amount);
  let logoUrl: string | null = null;
  if (ctx.company.logo_path) logoUrl = (await ctx.supabase.storage.from("company-files").createSignedUrl(ctx.company.logo_path, 3600)).data?.signedUrl ?? null;
  const items = [...inv.invoice_items].sort((a: { sort: number }, b: { sort: number }) => a.sort - b.sort);

  return (
    <>
      <div className="no-print">
        <PageHeader title={`${inv.kind === "cancellation" ? "Stornorechnung" : "Rechnung"} ${inv.number ?? "(Entwurf)"}`} description={`${customerDisplayName(cu)} · ${formatEUR(inv.total_gross)}${inv.orders ? ` · Auftrag ${inv.orders.number}` : ""}`}
          actions={<Badge tone={INVOICE_STATUS_TONE[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>} />
        {fehler && <div className="mb-4"><Notice tone="red">{fehler}</Notice></div>}
        {cancelledBy && <div className="mb-4"><Notice tone="amber">Diese Rechnung wurde storniert durch <Link className="underline" href={`/app/rechnungen/${cancelledBy.id}`}>{cancelledBy.number}</Link>.</Notice></div>}

        {draft ? (
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Card>
              <CardHeader title="Positionen" description="Im Entwurf frei änderbar. Nach dem Finalisieren ist die Rechnung festgeschrieben." />
              <ul className="divide-y divide-border">
                {items.map((it: { id: string; title: string; quantity: number; unit_price_net: number; total_net: number; tax_rate: number }) => (
                  <li key={it.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{it.title}</span>
                    <span className="tabular-nums text-muted-foreground">{Number(it.quantity).toLocaleString("de-DE")} × {formatEUR(it.unit_price_net)} · {it.tax_rate} %</span>
                    <span className="w-24 text-right tabular-nums">{formatEUR(it.total_net)}</span>
                    <form action={deleteInvoiceItem}><input type="hidden" name="id" value={it.id} /><input type="hidden" name="invoice_id" value={id} /><button className="p-1 text-muted-foreground hover:text-danger" aria-label="Position entfernen"><Trash2 className="size-4" /></button></form>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border p-5"><AddItemForm invoiceId={id} defaultTax={ctx.company.small_business ? 0 : Number(ctx.company.default_tax_rate)} /></div>
              <div className="border-t border-border p-5"><DraftHeaderForm inv={inv} /></div>
            </Card>
            <Card className="space-y-3 p-5 text-sm">
              <p className="font-medium">Finalisieren</p>
              <p className="text-muted-foreground">Vergibt die fortlaufende Rechnungsnummer und schreibt die Rechnung unveränderbar fest. Korrekturen danach nur per Stornorechnung.</p>
              {missing.length > 0 && <Notice tone="amber">Für die E-Rechnung fehlt noch: {missing.join(", ")}.</Notice>}
              {canFinalize ? (
                <form action={finalizeInvoice}><input type="hidden" name="id" value={id} /><ConfirmSubmit variant="secondary" size="md" message="Rechnung jetzt finalisieren? Danach kann sie nicht mehr geändert werden.">Rechnung finalisieren</ConfirmSubmit></form>
              ) : <p className="text-muted-foreground">Finalisieren dürfen Inhaber, Admin und Büro.</p>}
              {canFinalize && <form action={deleteDraftInvoice}><input type="hidden" name="id" value={id} /><ConfirmSubmit variant="ghost" message="Entwurf löschen?">Entwurf löschen</ConfirmSubmit></form>}
            </Card>
          </div>
        ) : (
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Card className="flex flex-wrap items-center gap-2 p-4">
              <a href={`/app/rechnungen/${id}/xrechnung`} className={buttonClass("primary")}><Download className="size-4" />E-Rechnung (XRechnung)</a>
              <PrintButton />
              {status !== "cancelled" && inv.kind === "invoice" && canFinalize && (
                <form action={cancelInvoice}><input type="hidden" name="id" value={id} /><ConfirmSubmit variant="ghost" size="md" message="Stornorechnung erstellen? Die Rechnung wird vollständig gegengebucht.">Stornieren</ConfirmSubmit></form>
              )}
              <p className="w-full text-xs text-muted-foreground">Finalisiert am {formatDateTime(inv.finalized_at)} · Prüfsumme {String(inv.content_hash ?? "").slice(0, 12)}…{missing.length ? ` · Für die E-Rechnung fehlt: ${missing.join(", ")}` : ""}</p>
            </Card>
            {inv.kind === "invoice" && (
              <Card>
                <CardHeader title="Zahlungen" description={status === "paid" ? "Vollständig bezahlt" : `Offen: ${formatEUR(open)}`} />
                <ul className="divide-y divide-border text-sm">
                  {(inv.invoice_payments as { id: string; amount: number; paid_on: string; method: string }[]).map((p) => (
                    <li key={p.id} className="flex justify-between px-5 py-2"><span>{formatDate(p.paid_on)} · {p.method}</span><span className="tabular-nums">{formatEUR(p.amount)}</span></li>
                  ))}
                </ul>
                {status === "finalized" && ctx.role !== "staff" && <div className="border-t border-border p-5"><PaymentForm invoiceId={id} open={open} /></div>}
              </Card>
            )}
          </div>
        )}
      </div>
      <InvoiceDocument inv={{ ...x, intro_text: inv.intro_text }} logoUrl={logoUrl} draft={draft} />
    </>
  );
}
