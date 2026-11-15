"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { uuid, type ActionState } from "@/lib/validation";

export async function sendMessage(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const customerId = uuid.parse(form.get("customer_id"));
  const p = z.object({
    body: z.string().trim().min(1, "Bitte eine Nachricht eingeben.").max(5000),
    channel: z.enum(["portal", "email", "telefon", "notiz"]),
    order_id: z.string().optional().transform((v) => (v ? v : null)),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { message: p.error.issues[0].message };

  const { data: cu } = await ctx.supabase.from("customers").select("email, first_name, last_name, company_name").eq("id", customerId).maybeSingle();
  if (!cu) return { message: "Kunde nicht gefunden." };

  let email_status: string | null = null;
  if (p.data.channel === "email") {
    if (!cu.email) return { message: "Für diesen Kunden ist keine E-Mail-Adresse hinterlegt." };
    const r = await sendMail({ to: cu.email, subject: `Nachricht von ${ctx.company.name}`, text: p.data.body, replyTo: ctx.company.email });
    email_status = r.ok ? "sent" : r.reason === "not_configured" ? "not_configured" : "failed";
  }
  const { error } = await ctx.supabase.from("messages").insert({
    company_id: ctx.companyId, customer_id: customerId, order_id: p.data.order_id, direction: "out",
    channel: p.data.channel === "email" && email_status !== "sent" ? "portal" : p.data.channel, body: p.data.body, author_id: ctx.user.id, email_status,
  });
  if (error) return { message: error.message };
  revalidatePath(`/app/nachrichten/${customerId}`);
  revalidatePath("/app/nachrichten");
  if (email_status === "not_configured") return { ok: true, message: "Gespeichert und im Kundenportal sichtbar. E-Mail-Versand ist noch nicht eingerichtet – teile dem Kunden den Portal-Link mit." };
  if (email_status === "failed") return { message: "Nachricht gespeichert, aber die E-Mail konnte nicht versendet werden." };
  return { ok: true, message: p.data.channel === "notiz" ? "Notiz gespeichert." : "Nachricht gesendet." };
}

export async function markRead(customerId: string) {
  const ctx = await getContext();
  await ctx.supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("customer_id", customerId).eq("direction", "in").is("read_at", null);
}

export async function resetPortalLink(form: FormData) {
  const ctx = await getContext();
  const id = uuid.parse(form.get("customer_id"));
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
  await ctx.supabase.from("customers").update({ portal_token: token }).eq("id", id);
  revalidatePath(`/app/nachrichten/${id}`);
}
