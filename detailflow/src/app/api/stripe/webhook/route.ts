import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { isStripeConfigured } from "@/lib/env";
import { randomBytes } from "node:crypto";
import { sendMail } from "@/lib/mailer";
import { fillTemplate } from "@/lib/invoice";
import { formatDate, formatEUR } from "@/lib/utils";

type Admin = ReturnType<typeof createAdminClient>;

/** Gutscheincode per E-Mail an den Käufer */
async function mailVoucher(db: Admin, companyId: string, to: string, name: string | undefined, code: string, amount: number) {
  const [{ data: c }, { data: t }, { data: v }] = await Promise.all([
    db.from("companies").select("name, email").eq("id", companyId).single(),
    db.from("message_templates").select("body").eq("company_id", companyId).eq("key", "gutschein").maybeSingle(),
    db.from("vouchers").select("expires_on").eq("company_id", companyId).eq("code", code).single(),
  ]);
  if (!c || !t) return;
  await sendMail({ to, subject: `Ihr Gutschein von ${c.name}`, replyTo: c.email,
    text: fillTemplate(t.body, { kunde: name ?? "", firma: c.name, betrag: formatEUR(amount), code, gueltig: formatDate(v?.expires_on) }) });
}

/** Empfehlungsprogramm: Werbender Betrieb erhält eine Monatsgebühr als Guthaben, sobald der geworbene Betrieb sein Abo abschließt */
async function rewardReferral(db: Admin, referredCompanyId: string) {
  const { data: r } = await db.from("referrals").select("id, referrer_company_id").eq("referred_company_id", referredCompanyId).is("rewarded_at", null).maybeSingle();
  if (!r) return;
  const { data: ref } = await db.from("companies").select("stripe_customer_id, plan").eq("id", r.referrer_company_id).single();
  if (!ref?.stripe_customer_id) return; // Gutschrift erfolgt, sobald der Werbende selbst ein Abo hat (erneuter Versuch beim nächsten Ereignis)
  const { data: plan } = await db.from("plans").select("price_monthly_cents").eq("id", ref.plan).single();
  if (!plan) return;
  await getStripe().customers.createBalanceTransaction(ref.stripe_customer_id, { amount: -plan.price_monthly_cents, currency: "eur", description: "Empfehlungsprogramm: 1 Monat gratis" }, { idempotencyKey: `referral-${r.id}` });
  await db.from("referrals").update({ rewarded_at: new Date().toISOString() }).eq("id", r.id);
}

export const runtime = "nodejs";

/**
 * Stripe-Webhook (Signatur wird geprüft). Einzige Stelle, die Zahlungs- und Tarifdaten schreibt.
 * Ereignisse: checkout.session.completed (Rechnung, Anzahlung, Gutschein, Pflege-Abo, Grundgebühr), checkout.session.async_payment_succeeded,
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
      const m = s.metadata ?? {};
      const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? s.id;
      const fee = () => db.from("platform_fees").upsert({
        company_id: m.company_id, invoice_id: m.invoice_id || null, payment_external_id: pi,
        gross_cents: s.amount_total ?? 0, fee_cents: Number(m.fee_cents ?? 0), month: m.fee_month,
      }, { onConflict: "payment_external_id", ignoreDuplicates: true });

      if (s.mode === "payment" && s.payment_status === "paid" && m.company_id) {
        if (m.kind === "deposit" && m.order_id) {
          const { data: o } = await db.from("orders").select("customer_id").eq("id", m.order_id).single();
          const { error } = await db.from("order_deposits").insert({ company_id: m.company_id, order_id: m.order_id, amount: (s.amount_total ?? 0) / 100, external_id: pi });
          if (!error && o) await db.from("messages").insert({ company_id: m.company_id, customer_id: o.customer_id, order_id: m.order_id, direction: "in", channel: "notiz", body: `Anzahlung über ${((s.amount_total ?? 0) / 100).toFixed(2).replace(".", ",")} € online erhalten. Sie wird beim Finalisieren der Rechnung automatisch angerechnet.` });
          await fee();
        } else if (m.kind === "voucher") {
          const code = (randomBytes(4).toString("hex").slice(0, 4) + "-" + randomBytes(4).toString("hex").slice(0, 4)).toUpperCase();
          const amount = (s.amount_total ?? 0) / 100;
          const { error } = await db.from("vouchers").insert({
            company_id: m.company_id, code, initial_amount: amount, balance: amount, buyer_name: m.buyer_name, buyer_email: m.buyer_email,
            recipient_name: m.recipient_name || null, message: m.message || null, source: "online", external_id: pi,
          });
          if (!error && m.buyer_email) await mailVoucher(db, m.company_id, m.buyer_email, m.buyer_name, code, amount);
          await fee();
        } else if (m.invoice_id) {
          const { error } = await db.from("invoice_payments").insert({
            company_id: m.company_id, invoice_id: m.invoice_id, amount: (s.amount_total ?? 0) / 100, method: "Online (Stripe)", external_id: pi, note: `Stripe ${pi}`,
          });
          // 23505 = bereits gebucht (wiederholter Webhook). P0001 = fachlicher Fehler (z. B. Rechnung storniert): protokollieren statt endlos wiederholen.
          if (error && error.code === "P0001") console.error("Online-Zahlung nicht buchbar", m.invoice_id, error.message);
          else if (error && error.code !== "23505") return new NextResponse(error.message, { status: 500 });
          await fee();
        }
      }

      if (s.mode === "subscription" && m.kind === "care" && m.company_id) {
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        const email = s.customer_details?.email?.toLowerCase() ?? null;
        const { data: cu } = email ? await db.from("customers").select("id").eq("company_id", m.company_id).ilike("email", email).limit(1).maybeSingle() : { data: null };
        await db.from("care_subscriptions").upsert({ company_id: m.company_id, plan_id: m.plan_id, customer_id: cu?.id ?? null, customer_email: email, stripe_subscription_id: subId, status: "active" }, { onConflict: "stripe_subscription_id" });
      } else if (s.mode === "subscription" && m.company_id) {
        await db.from("companies").update({
          stripe_customer_id: typeof s.customer === "string" ? s.customer : s.customer?.id,
          stripe_subscription_id: typeof s.subscription === "string" ? s.subscription : s.subscription?.id,
          subscription_status: "active", plan: m.plan,
        }).eq("id", m.company_id);
        await rewardReferral(db, m.company_id);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      if (sub.metadata?.kind === "care") {
        await db.from("care_subscriptions").update({ status: sub.status, updated_at: new Date().toISOString() }).eq("stripe_subscription_id", sub.id);
        break;
      }
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
