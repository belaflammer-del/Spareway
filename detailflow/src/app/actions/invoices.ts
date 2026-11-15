"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getContext } from "@/lib/auth";
import { uuid, type ActionState } from "@/lib/validation";

const back = (id: string, msg: string) => redirect(`/app/rechnungen/${id}?fehler=${encodeURIComponent(msg)}`);

export async function createInvoiceFromOrder(form: FormData) {
  const ctx = await getContext();
  const orderId = uuid.parse(form.get("order_id"));
  const { data, error } = await ctx.supabase.rpc("create_invoice_from_order", { p_order: orderId });
  if (error) redirect(`/app/auftraege/${orderId}?fehler=${encodeURIComponent(error.message)}`);
  revalidatePath("/app/rechnungen");
  redirect(`/app/rechnungen/${data}`);
}

export async function createBlankInvoice(form: FormData) {
  const ctx = await getContext();
  const customerId = uuid.parse(form.get("customer_id"));
  const { data, error } = await ctx.supabase.from("invoices").insert({
    company_id: ctx.companyId, customer_id: customerId, payment_terms: `Zahlbar innerhalb von ${(ctx.company as unknown as { payment_terms_days?: number }).payment_terms_days ?? 14} Tagen ohne Abzug.`, created_by: ctx.user.id,
  }).select("id").single();
  if (error) redirect(`/app/rechnungen?fehler=${encodeURIComponent(error.message)}`);
  redirect(`/app/rechnungen/${data.id}`);
}

const itemSchema = z.object({
  title: z.string().trim().min(1, "Bitte eine Bezeichnung angeben.").max(300),
  quantity: z.coerce.number().refine((n) => n !== 0 && Math.abs(n) < 100000, "Ungültige Menge"),
  unit_price_net: z.string().transform((v) => Number(v.replace(",", "."))).refine((n) => Number.isFinite(n) && Math.abs(n) < 1_000_000, "Ungültiger Preis"),
  tax_rate: z.coerce.number().min(0).max(100),
});

export async function addInvoiceItem(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const invoiceId = uuid.parse(form.get("invoice_id"));
  const p = itemSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { message: p.error.issues[0].message };
  const total = Math.round(p.data.quantity * p.data.unit_price_net * 100) / 100;
  const { error } = await ctx.supabase.from("invoice_items").insert({ ...p.data, total_net: total, company_id: ctx.companyId, invoice_id: invoiceId, sort: 999 });
  if (error) return { message: error.message };
  await ctx.supabase.rpc("recalc_invoice", { p_id: invoiceId });
  revalidatePath(`/app/rechnungen/${invoiceId}`);
  return { ok: true, message: "Position hinzugefügt." };
}

export async function deleteInvoiceItem(form: FormData) {
  const ctx = await getContext();
  const invoiceId = uuid.parse(form.get("invoice_id"));
  await ctx.supabase.from("invoice_items").delete().eq("id", uuid.parse(form.get("id")));
  await ctx.supabase.rpc("recalc_invoice", { p_id: invoiceId });
  revalidatePath(`/app/rechnungen/${invoiceId}`);
}

export async function updateInvoiceDraft(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const p = z.object({
    service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Leistungsdatum angeben."),
    intro_text: z.string().max(2000).transform((v) => v.trim() || null),
    payment_terms: z.string().max(500).transform((v) => v.trim() || null),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { message: p.error.issues[0].message };
  const { error } = await ctx.supabase.from("invoices").update(p.data).eq("id", id).eq("status", "draft");
  if (error) return { message: error.message };
  revalidatePath(`/app/rechnungen/${id}`);
  return { ok: true, message: "Gespeichert." };
}

export async function finalizeInvoice(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const { error } = await ctx.supabase.rpc("finalize_invoice", { p_id: id });
  if (error) back(id, error.message);
  revalidatePath("/app/rechnungen");
  revalidatePath(`/app/rechnungen/${id}`);
}

export async function cancelInvoice(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const { data, error } = await ctx.supabase.rpc("cancel_invoice", { p_id: id });
  if (error) back(id, error.message);
  revalidatePath("/app/rechnungen");
  redirect(`/app/rechnungen/${data}`);
}

export async function deleteDraftInvoice(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const { error } = await ctx.supabase.from("invoices").delete().eq("id", id).eq("status", "draft");
  if (error) back(id, error.message);
  revalidatePath("/app/rechnungen");
  redirect("/app/rechnungen");
}

export async function recordPayment(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const id = uuid.parse(form.get("invoice_id"));
  const p = z.object({
    amount: z.string().transform((v) => Number(v.replace(",", "."))).refine((n) => Number.isFinite(n) && n !== 0, "Bitte einen Betrag eingeben."),
    paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    method: z.enum(["Überweisung", "Bar", "EC-Karte", "Kreditkarte", "PayPal", "Sonstiges"]),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { message: p.error.issues[0].message };
  const { error } = await ctx.supabase.from("invoice_payments").insert({ ...p.data, company_id: ctx.companyId, invoice_id: id, created_by: ctx.user.id });
  if (error) return { message: error.code === "42501" ? "Nur Inhaber, Admin oder Büro können Zahlungen erfassen." : error.message };
  revalidatePath(`/app/rechnungen/${id}`);
  revalidatePath("/app/rechnungen");
  return { ok: true, message: "Zahlung erfasst." };
}
