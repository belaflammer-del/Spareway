import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { isStripeConfigured } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Stripe-Webhook (Signatur wird geprüft). Einzige Stelle, die Zahlungs- und Tarifdaten schreibt.
 * Ereignisse: checkout.session.completed, checkout.session.async_payment_succeeded,
 * customer.subscription.updated/deleted, account.updated
 */
export async function POST(req: Request) {
  if (!isStripeConfigured()) return new NextResponse("Stripe nicht konfiguriert", { status: 503 });
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new NextResponse("Ungültige Signatur", { status: 400 });
  }
  const db = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode === "payment" && s.metadata?.invoice_id && s.payment_status === "paid") {
        const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? s.id;
        const { error } = await db.from("invoice_payments").insert({
          company_id: s.metadata.company_id, invoice_id: s.metadata.invoice_id, amount: (s.amount_total ?? 0) / 100,
          method: "Online (Stripe)", external_id: pi, note: `Stripe ${pi}`,
        });
        // 23505 = bereits gebucht (wiederholter Webhook). P0001 = fachlicher Fehler (z. B. Rechnung inzwischen storniert):
        // nicht endlos wiederholen lassen, sondern protokollieren und manuell klären.
        if (error && error.code === "P0001") console.error("Online-Zahlung nicht buchbar", s.metadata.invoice_id, error.message);
        else if (error && error.code !== "23505") return new NextResponse(error.message, { status: 500 });
        await db.from("platform_fees").upsert({
          company_id: s.metadata.company_id, invoice_id: s.metadata.invoice_id, payment_external_id: pi,
          gross_cents: s.amount_total ?? 0, fee_cents: Number(s.metadata.fee_cents ?? 0), month: s.metadata.fee_month,
        }, { onConflict: "payment_external_id", ignoreDuplicates: true });
      }
      if (s.mode === "subscription" && s.metadata?.company_id) {
        await db.from("companies").update({
          stripe_customer_id: typeof s.customer === "string" ? s.customer : s.customer?.id,
          stripe_subscription_id: typeof s.subscription === "string" ? s.subscription : s.subscription?.id,
          subscription_status: "active", plan: s.metadata.plan,
        }).eq("id", s.metadata.company_id);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const patch: Record<string, unknown> = { subscription_status: sub.status };
      if (event.type === "customer.subscription.updated" && sub.metadata?.plan) patch.plan = sub.metadata.plan;
      await db.from("companies").update(patch).eq("stripe_subscription_id", sub.id);
      break;
    }
    case "account.updated": {
      const a = event.data.object as Stripe.Account;
      await db.from("companies").update({ stripe_charges_enabled: Boolean(a.charges_enabled) }).eq("stripe_account_id", a.id);
      break;
    }
  }
  return NextResponse.json({ received: true });
}
