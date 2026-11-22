import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toXInvoice } from "@/lib/invoice";
import { buildXRechnung, missingForXRechnung } from "@/lib/xrechnung";

/** E-Rechnung (XRechnung 3.0, UBL) herunterladen – nur finalisierte Rechnungen, Zugriff per RLS */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Nicht gefunden", { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Nicht angemeldet", { status: 401 });
  const { data: inv } = await supabase.from("invoices").select("*, invoice_items(*), cancels:cancels_invoice_id(number)").eq("id", id).maybeSingle();
  if (!inv) return new NextResponse("Nicht gefunden", { status: 404 });
  if (inv.status === "draft") return new NextResponse("Bitte die Rechnung zuerst finalisieren.", { status: 409 });
  const x = toXInvoice({ ...inv, cancels_number: (inv.cancels as { number: string } | null)?.number, items: inv.invoice_items });
  const missing = missingForXRechnung(x);
  if (missing.length) return new NextResponse(`Für die E-Rechnung fehlen Pflichtangaben: ${missing.join(", ")}`, { status: 422, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new NextResponse(buildXRechnung(x), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${x.number}.xml"`, "Cache-Control": "no-store" },
  });
}
