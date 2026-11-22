"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getContext, requireAdmin } from "@/lib/auth";
import { createPaymentCheckout } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { env, isStripeConfigured } from "@/lib/env";
import { getStripe, priceIdForPlan } from "@/lib/stripe";

const settings = (msg: string) => redirect(`/app/einstellungen?zahlung=${encodeURIComponent(msg)}#zahlungen`);

/** Stripe-Konto des Betriebs verbinden (Stripe Connect Express) bzw. Einrichtung fortsetzen */
export async function connectStripe() {
  const ctx = await requireAdmin();
  if (!isStripeConfigured()) settings("Stripe ist noch nicht eingerichtet (Betreiber).");
  const stripe = getStripe();
  const admin = createAdminClient();
  let accountId = (ctx.company as unknown as { stripe_account_id: string | null }).stripe_account_id;
  if (!accountId) {
    const acct = await stripe.accounts.create({
      type: "express", country: "DE", email: ctx.company.email ?? ctx.user.email ?? undefined,
      business_profile: { name: ctx.company.name, mcc: "7542" }, // 7542 = Autowäsche/Fahrzeugpflege
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { company_id: ctx.companyId },
    });
    accountId = acct.id;
    await admin.from("companies").update({ stripe_account_id: accountId }).eq("id", ctx.companyId);
  }
  const link = await stripe.accountLinks.create({
    account: accountId, type: "account_onboarding",
    refresh_url: `${env.appUrl}/app/einstellungen?stripe=neu#zahlungen`, return_url: `${env.appUrl}/app/einstellungen?stripe=zurueck#zahlungen`,
  });
  redirect(link.url);
}

/** Nach Rückkehr von Stripe: Freischaltung abfragen (zusätzlich zum Webhook) */
export async function refreshStripeStatus() {
  const ctx = await requireAdmin();
  const accountId = (ctx.company as unknown as { stripe_account_id: string | null }).stripe_account_id;
  if (!accountId || !isStripeConfigured()) return;
  const acct = await getStripe().accounts.retrieve(accountId);
  await createAdminClient().from("companies").update({ stripe_charges_enabled: Boolean(acct.charges_enabled) }).eq("id", ctx.companyId);
}

/** Grundgebühr als Abo abschließen (Stripe Checkout, Modus „subscription“) */
export async function startSubscription(form: FormData) {
  const ctx = await requireAdmin();
  const plan = z.enum(["starter", "professional", "business"]).parse(form.get("plan"));
  const price = priceIdForPlan(plan);
  if (!isStripeConfigured() || !price) settings("Abo-Zahlung ist noch nicht eingerichtet (Betreiber).");
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price!, quantity: 1 }],
    customer: (ctx.company as unknown as { stripe_customer_id: string | null }).stripe_customer_id ?? undefined,
    customer_email: (ctx.company as unknown as { stripe_customer_id: string | null }).stripe_customer_id ? undefined : (ctx.company.email ?? ctx.user.email ?? undefined),
    client_reference_id: ctx.companyId,
    metadata: { company_id: ctx.companyId, plan },
    subscription_data: { metadata: { company_id: ctx.companyId, plan }, trial_period_days: (ctx.company as unknown as { referred_by: string | null }).referred_by ? 30 : undefined },
    success_url: `${env.appUrl}/app/einstellungen?abo=ok#zahlungen`, cancel_url: `${env.appUrl}/app/einstellungen#zahlungen`,
  });
  redirect(session.url!);
}

/** Stripe-Kundenportal: Zahlungsmethode, Rechnungen der Grundgebühr, Kündigung */
export async function openBillingPortal() {
  const ctx = await requireAdmin();
  const customer = (ctx.company as unknown as { stripe_customer_id: string | null }).stripe_customer_id;
  if (!customer || !isStripeConfigured()) settings("Noch kein Abo vorhanden.");
  const s = await getStripe().billingPortal.sessions.create({ customer: customer!, return_url: `${env.appUrl}/app/einstellungen#zahlungen` });
  redirect(s.url);
}

/** Endkunde bezahlt eine Rechnung online aus dem Kundenportal (Destination Charge mit Plattformgebühr). */
export async function payInvoiceOnline(form: FormData) {
  const token = z.string().regex(/^[a-f0-9]{48}$/).parse(form.get("token"));
  const invoiceId = z.string().uuid().parse(form.get("invoice_id"));
  const back = (q: string) => redirect(`/portal/${token}/rechnung/${invoiceId}?${q}`);
  if (!isStripeConfigured()) back("fehler=" + encodeURIComponent("Online-Zahlung ist derzeit nicht verfügbar."));
  // Berechtigung über das Portal-Token (gleiche Prüfung wie die Anzeige)
  const supabase = await createClient();
  const { data: pub } = await supabase.rpc("get_portal_invoice", { token, p_invoice: invoiceId });
  if (!pub || !pub.online_payment || Number(pub.open_amount) <= 0) back("fehler=" + encodeURIComponent("Diese Rechnung kann nicht online bezahlt werden."));
  const { data: inv } = await createAdminClient().from("invoices").select("company_id, number").eq("id", invoiceId).single();
  let url: string;
  try {
    url = await createPaymentCheckout({
      companyId: inv!.company_id, amountCents: Math.round(Number(pub.open_amount) * 100), title: `Rechnung ${inv!.number}`, kind: "invoice",
      metadata: { invoice_id: invoiceId }, successUrl: `${env.appUrl}/portal/${token}/rechnung/${invoiceId}?bezahlt=1`, cancelUrl: `${env.appUrl}/portal/${token}/rechnung/${invoiceId}`,
    });
  } catch (e) { return back("fehler=" + encodeURIComponent((e as Error).message)); }
  redirect(url);
}

/** Vor Ort bezahlen: Zahlungslink erzeugen und als QR-Code anzeigen (Kunde zahlt mit dem eigenen Handy) */
export async function payInvoiceOnSite(form: FormData) {
  const ctx = await getContext();
  const invoiceId = z.string().uuid().parse(form.get("id"));
  const back = (m: string) => redirect(`/app/rechnungen/${invoiceId}?fehler=${encodeURIComponent(m)}`);
  if (!isStripeConfigured()) back("Online-Zahlung ist noch nicht eingerichtet.");
  const { data: inv } = await ctx.supabase.from("invoices").select("id, number, status, kind, total_gross, paid_amount, company_id").eq("id", invoiceId).maybeSingle();
  if (!inv || inv.status !== "finalized" || inv.kind !== "invoice") back("Nur offene Rechnungen können bezahlt werden.");
  let url: string;
  try {
    url = await createPaymentCheckout({
      companyId: inv!.company_id, amountCents: Math.round((Number(inv!.total_gross) - Number(inv!.paid_amount)) * 100), title: `Rechnung ${inv!.number}`, kind: "invoice",
      metadata: { invoice_id: invoiceId }, successUrl: `${env.appUrl}/zahlung-danke`, cancelUrl: `${env.appUrl}/zahlung-danke?abgebrochen=1`,
    });
  } catch (e) { return back((e as Error).message); }
  redirect(`/app/rechnungen/${invoiceId}/qr?u=${encodeURIComponent(url)}`);
}
