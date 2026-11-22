"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { VEHICLE_CLASSES } from "@/lib/domain";
import { env, isStripeConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCareCheckout, createPaymentCheckout } from "@/lib/payments";

async function ip() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function portalSend(form: FormData) {
  const token = z.string().regex(/^[a-f0-9]{48}$/).safeParse(form.get("token"));
  if (!token.success) redirect("/");
  if (!rateLimit(`portal:${await ip()}`, 10, 60_000)) redirect(`/portal/${token.data}?fehler=${encodeURIComponent("Zu viele Nachrichten. Bitte kurz warten.")}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_send_message", { token: token.data, body: String(form.get("body") ?? "") });
  redirect(`/portal/${token.data}?${error ? `fehler=${encodeURIComponent(error.message)}` : "gesendet=1"}#nachrichten`);
}

export async function submitBooking(form: FormData) {
  const slug = z.string().regex(/^[a-z0-9-]{3,50}$/).safeParse(form.get("slug"));
  if (!slug.success) redirect("/");
  if (form.get("website")) redirect(`/buchen/${slug.data}?fehler=1`); // Honeypot gegen Bots
  if (!rateLimit(`booking:${await ip()}`, 5, 60 * 60_000)) redirect(`/buchen/${slug.data}?fehler=${encodeURIComponent("Zu viele Anfragen von diesem Anschluss. Bitte rufen Sie uns an.")}`);
  if (form.get("consent") !== "on") redirect(`/buchen/${slug.data}?fehler=${encodeURIComponent("Bitte stimmen Sie der Datenverarbeitung zu.")}`);
  const vc = String(form.get("vehicle_class") ?? "");
  const req = {
    name: String(form.get("name") ?? "").slice(0, 100), email: String(form.get("email") ?? "").slice(0, 200), phone: String(form.get("phone") ?? "").slice(0, 60),
    make: String(form.get("make") ?? "").slice(0, 60), model: String(form.get("model") ?? "").slice(0, 80), plate: String(form.get("plate") ?? "").slice(0, 20),
    vehicle_class: (VEHICLE_CLASSES as readonly string[]).includes(vc) ? vc : "", package_id: String(form.get("package_id") ?? ""),
    wish_date: String(form.get("wish_date") ?? "").slice(0, 100), message: String(form.get("message") ?? "").slice(0, 2000),
  };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_booking", { p_slug: slug.data, req });
  if (error) redirect(`/buchen/${slug.data}?fehler=${encodeURIComponent(error.message)}`);
  const { token, order_id } = data as { token: string; order_id: string };
  // Anzahlung, falls der Betrieb eine festgelegt hat
  if (isStripeConfigured() && order_id) {
    const { data: co } = await createAdminClient().from("companies").select("id, deposit_cents, stripe_charges_enabled").eq("slug", slug.data).single();
    if (co?.stripe_charges_enabled && co.deposit_cents > 0) {
      let url: string | null = null;
      try {
        url = await createPaymentCheckout({
          companyId: co.id, amountCents: co.deposit_cents, title: "Anzahlung Fahrzeugaufbereitung", kind: "deposit", customerEmail: req.email,
          metadata: { order_id }, successUrl: `${env.appUrl}/portal/${token}?neu=1&anzahlung=1`, cancelUrl: `${env.appUrl}/portal/${token}?neu=1&anzahlung=offen`,
        });
      } catch { url = null; }
      if (url) redirect(url);
    }
  }
  redirect(`/portal/${token}?neu=1`);
}

export async function buyVoucher(form: FormData) {
  const slug = z.string().regex(/^[a-z0-9-]{3,50}$/).parse(form.get("slug"));
  const back = (m: string) => redirect(`/gutschein/${slug}?fehler=${encodeURIComponent(m)}`);
  if (!rateLimit(`voucher:${await ip()}`, 10, 60 * 60_000)) back("Zu viele Versuche. Bitte später erneut.");
  const p = z.object({
    amount: z.coerce.number().int().min(10, "Mindestens 10 €").max(1000, "Höchstens 1.000 €"),
    buyer_name: z.string().trim().min(2, "Bitte Ihren Namen angeben").max(100),
    buyer_email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail angeben"),
    recipient_name: z.string().trim().max(100).optional().default(""),
    message: z.string().trim().max(300).optional().default(""),
  }).safeParse({ ...Object.fromEntries(form), amount: form.get("amount") === "custom" ? form.get("custom_amount") : form.get("amount") });
  if (!p.success) back(p.error.issues[0].message);
  const d = p.data!;
  const { data: co } = await createAdminClient().from("companies").select("id, vouchers_enabled").eq("slug", slug).single();
  if (!co?.vouchers_enabled || !isStripeConfigured()) back("Gutscheine sind derzeit nicht verfügbar.");
  let url: string;
  try {
    url = await createPaymentCheckout({
      companyId: co!.id, amountCents: d.amount * 100, title: `Gutschein über ${d.amount} €`, kind: "voucher", customerEmail: d.buyer_email,
      metadata: { buyer_name: d.buyer_name, buyer_email: d.buyer_email, recipient_name: d.recipient_name, message: d.message.slice(0, 300) },
      successUrl: `${env.appUrl}/gutschein/${slug}/danke?session_id={CHECKOUT_SESSION_ID}`, cancelUrl: `${env.appUrl}/gutschein/${slug}`,
    });
  } catch (e) { return back((e as Error).message); }
  redirect(url);
}

export async function subscribeCare(form: FormData) {
  const slug = z.string().regex(/^[a-z0-9-]{3,50}$/).parse(form.get("slug"));
  const planId = z.string().uuid().parse(form.get("plan_id"));
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!isStripeConfigured()) redirect(`/buchen/${slug}?fehler=${encodeURIComponent("Abos sind derzeit nicht verfügbar.")}`);
  let url: string;
  try {
    url = await createCareCheckout({ planId, email: email || null, successUrl: `${env.appUrl}/buchen/${slug}?abo=1`, cancelUrl: `${env.appUrl}/buchen/${slug}` });
  } catch (e) { return redirect(`/buchen/${slug}?fehler=${encodeURIComponent((e as Error).message)}`); }
  redirect(url);
}
