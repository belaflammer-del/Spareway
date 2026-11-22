import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import { toXInvoice } from "@/lib/invoice";
import { Notice, buttonClass } from "@/components/ui";
import { formatEUR } from "@/lib/utils";
import { payInvoiceOnline } from "@/app/actions/billing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rechnung" };

export default async function PortalInvoice({ params, searchParams }: { params: Promise<{ token: string; id: string }>; searchParams: Promise<{ bezahlt?: string; fehler?: string }> }) {
  const { token, id } = await params;
  const sp = await searchParams;
  if (!/^[a-f0-9]{48}$/.test(token) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_portal_invoice", { token, p_invoice: id });
  if (!data) notFound();
  const x = toXInvoice(data);
  return (
    <div className="px-4 py-8">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between">
        <Link href={`/portal/${token}`} className="text-sm text-accent">← Zurück</Link>
        <PrintButton />
      </div>
      <div className="no-print mx-auto mb-4 max-w-[210mm] space-y-3">
        {sp.bezahlt && <Notice tone="green">Vielen Dank! Ihre Zahlung wird verarbeitet. Der Status aktualisiert sich in wenigen Minuten.</Notice>}
        {sp.fehler && <Notice tone="red">{sp.fehler}</Notice>}
        {data.online_payment && Number(data.open_amount) > 0 && !sp.bezahlt && (
          <form action={payInvoiceOnline} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <input type="hidden" name="token" value={token} /><input type="hidden" name="invoice_id" value={id} />
            <p className="text-sm">Offener Betrag: <strong className="tabular-nums">{formatEUR(data.open_amount)}</strong></p>
            <button className={buttonClass("primary")}>Jetzt online bezahlen</button>
          </form>
        )}
      </div>
      <InvoiceDocument inv={{ ...x, intro_text: data.intro_text }} />
    </div>
  );
}
