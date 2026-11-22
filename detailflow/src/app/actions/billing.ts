"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { env, isStripeConfigured } from "@/lib/env";
import { computeApplicationFee } from "@/lib/revenue-share";
import { currentFeeMonth, getStripe, priceIdForPlan } from "@/lib/stripe";

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
    subscription_data: { metadata: { company_id: ctx.companyId, plan } },
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

/**
 * Endkunde bezahlt eine Rechnung online aus dem Kundenportal.
 * Destination Charge: Das Geld geht an den Betrieb, die Plattform behält die Umsatzbeteiligung als application_fee ein.
 */
export async function payInvoiceOnline(form: FormData) {
  const token = z.string().regex(/^[a-f0-9]{48}$/).parse(form.get("token"));
  const invoiceId = z.string().uuid().parse(form.get("invoice_id"));
  const back = (q: string) => redirect(`/portal/${token}/rechnung/${invoiceId}?${q}`);
  if (!isStripeConfigured()) back("fehler=" + encodeURIComponent("Online-Zahlung ist derzeit nicht verfügbar."));

  // 1) Berechtigung über das Portal-Token prüfen (gleiche Prüfung wie die Anzeige)
  const supabase = await createClient();
  const { data: pub } = await supabase.rpc("get_portal_invoice", { token, p_invoice: invoiceId });
  if (!pub || !pub.online_payment || Number(pub.open_amount) <= 0) back("fehler=" + encodeURIComponent("Diese Rechnung kann nicht online bezahlt werden."));

  // 2) Interne Daten serverseitig laden (Stripe-Konto, Tarif, bisherige Gebühren)
  const admin = createAdminClient();
  const { data: inv } = await admin.from("invoices").select("id, number, company_id, total_gross, paid_amount, companies(name, stripe_account_id, stripe_charges_enabled, plan)").eq("id", invoiceId).single();
  const co = inv!.companies as unknown as { name: string; stripe_account_id: string; stripe_charges_enabled: boolean; plan: string };
  const { data: plan } = await admin.from("plans").select("revenue_share_bps, revenue_share_cap_cents").eq("id", co.plan).single();
  const month = currentFeeMonth();
  const { data: fees } = await admin.from("platform_fees").select("fee_cents").eq("company_id", inv!.company_id).eq("month", month);
  const charged = (fees ?? []).reduce((a, f) => a + f.fee_cents, 0);
  const amount = Math.round((Number(inv!.total_gross) - Number(inv!.paid_amount)) * 100);
  const fee = computeApplicationFee(amount, plan?.revenue_share_bps ?? 0, plan?.revenue_share_cap_cents ?? null, charged);

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: amount, product_data: { name: `Rechnung ${inv!.number} – ${co.name}` } } }],
    payment_intent_data: {
      application_fee_amount: fee || undefined,
      transfer_data: { destination: co.stripe_account_id },
      on_behalf_of: co.stripe_account_id,
      description: `Rechnung ${inv!.number}`,
      metadata: { invoice_id: invoiceId, company_id: inv!.company_id, fee_cents: String(fee), fee_month: month },
    },
    metadata: { invoice_id: invoiceId, company_id: inv!.company_id, fee_cents: String(fee), fee_month: month },
    success_url: `${env.appUrl}/portal/${token}/rechnung/${invoiceId}?bezahlt=1`,
    cancel_url: `${env.appUrl}/portal/${token}/rechnung/${invoiceId}`,
  });
  redirect(session.url!);
}
