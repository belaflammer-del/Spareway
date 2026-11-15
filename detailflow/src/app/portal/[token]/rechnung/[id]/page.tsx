import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import { toXInvoice } from "@/lib/invoice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rechnung" };

export default async function PortalInvoice({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
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
      <InvoiceDocument inv={{ ...x, intro_text: data.intro_text }} />
    </div>
  );
}
