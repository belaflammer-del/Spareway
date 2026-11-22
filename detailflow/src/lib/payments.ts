import "server-only";
import { createAdminClient } from "./supabase/admin";
import { computeApplicationFee } from "./revenue-share";
import { currentFeeMonth, getStripe } from "./stripe";

type Admin = ReturnType<typeof createAdminClient>;

/** Zahlungsfähiger Betrieb + Gebührensatz (nur serverseitig) */
export async function payableCompany(db: Admin, companyId: string) {
  const { data: c } = await db.from("companies").select("id, name, email, stripe_account_id, stripe_charges_enabled, plan").eq("id", companyId).single();
  if (!c?.stripe_account_id || !c.stripe_charges_enabled) return null;
  const { data: plan } = await db.from("plans").select("revenue_share_bps, revenue_share_cap_cents").eq("id", c.plan).single();
  return { ...c, stripe_account_id: c.stripe_account_id as string, bps: plan?.revenue_share_bps ?? 0, cap: plan?.revenue_share_cap_cents ?? null };
}

export async function feeFor(db: Admin, company: { id: string; bps: number; cap: number | null }, amountCents: number) {
  const { data } = await db.from("platform_fees").select("fee_cents").eq("company_id", company.id).eq("month", currentFeeMonth());
  const charged = (data ?? []).reduce((a, f) => a + f.fee_cents, 0);
  return computeApplicationFee(amountCents, company.bps, company.cap, charged);
}

/**
 * Einmalzahlung an einen Betrieb (Destination Charge): Geld geht an den Betrieb, die Plattform behält die Gebühr.
 * kind steuert die Verbuchung im Webhook (invoice | deposit | voucher).
 */
export async function createPaymentCheckout(opts: {
  companyId: string; amountCents: number; title: string; kind: "invoice" | "deposit" | "voucher";
  metadata: Record<string, string>; successUrl: string; cancelUrl: string; customerEmail?: string | null;
}) {
  const db = createAdminClient();
  const co = await payableCompany(db, opts.companyId);
  if (!co) throw new Error("Der Betrieb kann derzeit keine Online-Zahlungen annehmen.");
  const fee = await feeFor(db, co, opts.amountCents);
  const meta = { ...opts.metadata, kind: opts.kind, company_id: co.id, fee_cents: String(fee), fee_month: currentFeeMonth() };
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: opts.amountCents, product_data: { name: `${opts.title} – ${co.name}` } } }],
    customer_email: opts.customerEmail ?? undefined,
    payment_intent_data: { application_fee_amount: fee || undefined, transfer_data: { destination: co.stripe_account_id }, on_behalf_of: co.stripe_account_id, description: opts.title, metadata: meta },
    metadata: meta,
    success_url: opts.successUrl, cancel_url: opts.cancelUrl,
  });
  return session.url!;
}

/** Pflege-Abo des Betriebs an einen Endkunden (Abo auf dem Stripe-Konto des Betriebs, Plattform erhält application_fee_percent) */
export async function createCareCheckout(opts: { planId: string; successUrl: string; cancelUrl: string; email?: string | null }) {
  const db = createAdminClient();
  const { data: plan } = await db.from("care_plans").select("id, company_id, name, description, price_cents, active").eq("id", opts.planId).single();
  if (!plan?.active) throw new Error("Dieses Abo ist nicht mehr verfügbar.");
  const co = await payableCompany(db, plan.company_id);
  if (!co) throw new Error("Der Betrieb kann derzeit keine Online-Zahlungen annehmen.");
  const meta = { kind: "care", company_id: co.id, plan_id: plan.id };
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: plan.price_cents, recurring: { interval: "month" }, product_data: { name: plan.name, description: plan.description ?? undefined } } }],
    customer_email: opts.email ?? undefined,
    subscription_data: { application_fee_percent: co.bps / 100, metadata: meta },
    metadata: meta,
    success_url: opts.successUrl, cancel_url: opts.cancelUrl,
  }, { stripeAccount: co.stripe_account_id });
  return session.url!;
}

/** Online-Anzahlungen eines Auftrags auf die (finalisierte) Rechnung anrechnen */
export async function applyDeposits(invoiceId: string) {
  const db = createAdminClient();
  const { data: inv } = await db.from("invoices").select("id, company_id, order_id, status").eq("id", invoiceId).single();
  if (!inv?.order_id || inv.status !== "finalized") return;
  const { data: deps } = await db.from("order_deposits").select("id, amount").eq("order_id", inv.order_id).is("applied_invoice_id", null);
  for (const dep of deps ?? []) {
    const { error } = await db.from("invoice_payments").insert({ company_id: inv.company_id, invoice_id: inv.id, amount: dep.amount, method: "Anzahlung (online)", external_id: `deposit:${dep.id}`, note: "Online-Anzahlung bei Buchung" });
    if (!error || error.code === "23505") await db.from("order_deposits").update({ applied_invoice_id: inv.id }).eq("id", dep.id);
  }
}
