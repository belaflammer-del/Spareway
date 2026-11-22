import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDatevCsv, buildInvoiceBookCsv, DEFAULT_ACCOUNTING, toWindows1252, type ExportInvoice } from "@/lib/datev";

/** Export finalisierter Rechnungen eines Zeitraums (DATEV-Buchungsstapel oder Rechnungsausgangsbuch) */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("von") ?? "", to = url.searchParams.get("bis") ?? "";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "datev";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return new NextResponse("Bitte einen gültigen Zeitraum wählen.", { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Nicht angemeldet", { status: 401 });
  const companyId = url.searchParams.get("firma") ?? "";
  // Nur Inhaber/Admin/Büro der Firma
  const { data: m } = await supabase.from("memberships").select("role, companies(accounting_config)").eq("user_id", user.id).eq("company_id", companyId).maybeSingle();
  if (!m || m.role === "staff") return new NextResponse("Keine Berechtigung", { status: 403 });
  const { data } = await supabase.from("invoices")
    .select("number, kind, status, issue_date, due_date, subtotal_net, tax_total, total_gross, paid_amount, buyer_snapshot, invoice_items(tax_rate, total_net)")
    .eq("company_id", companyId).neq("status", "draft").gte("issue_date", from).lte("issue_date", to).order("number");
  const invoices: ExportInvoice[] = (data ?? []).map((i) => ({
    number: i.number!, kind: i.kind, status: i.status, issue_date: i.issue_date!, due_date: i.due_date, customer: (i.buyer_snapshot as { name?: string })?.name ?? "",
    subtotal_net: Number(i.subtotal_net), tax_total: Number(i.tax_total), total_gross: Number(i.total_gross), paid_amount: Number(i.paid_amount),
    items: (i.invoice_items as { tax_rate: number; total_net: number }[]).map((x) => ({ tax_rate: Number(x.tax_rate), total_net: Number(x.total_net) })),
  }));
  const cfg = { ...DEFAULT_ACCOUNTING, ...((m.companies as unknown as { accounting_config: object })?.accounting_config ?? {}) };
  if (format === "csv") {
    return new NextResponse(buildInvoiceBookCsv(invoices), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="Rechnungsausgangsbuch_${from}_${to}.csv"` } });
  }
  return new NextResponse(toWindows1252(buildDatevCsv(invoices, cfg, from, to)).buffer as ArrayBuffer, {
    headers: { "Content-Type": "text/csv; charset=windows-1252", "Content-Disposition": `attachment; filename="EXTF_Buchungsstapel_${from}_${to}.csv"` },
  });
}
