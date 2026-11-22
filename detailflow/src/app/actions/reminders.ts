"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { isMailConfigured } from "@/lib/mailer";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDunning } from "@/lib/reminders";
import { uuid } from "@/lib/validation";

/** Nächste Mahnstufe manuell senden (Inhaber/Admin/Büro) */
export async function sendNextDunning(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("id"));
  const back = (m: string) => redirect(`/app/rechnungen/${id}?fehler=${encodeURIComponent(m)}`);
  if (ctx.role === "staff") back("Mahnungen dürfen Inhaber, Admin und Büro senden.");
  if (!isMailConfigured()) back("E-Mail-Versand ist noch nicht eingerichtet.");
  // Rechte und Firmenzugehörigkeit über RLS prüfen, bevor der Server-Client verwendet wird
  const { data: inv } = await ctx.supabase.from("invoices").select("id, status, invoice_reminders(level)").eq("id", id).maybeSingle();
  if (!inv || inv.status !== "finalized") back("Nur offene Rechnungen können gemahnt werden.");
  const next = Math.max(0, ...((inv!.invoice_reminders as { level: number }[]).map((r) => r.level))) + 1;
  if (next > 3) back("Alle Mahnstufen wurden bereits versendet.");
  const ok = await sendDunning(createAdminClient(), id, next);
  if (!ok) back("Die Mahnung konnte nicht versendet werden (E-Mail des Kunden prüfen).");
  revalidatePath(`/app/rechnungen/${id}`);
}
