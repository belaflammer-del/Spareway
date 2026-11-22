import type Stripe from "stripe";
import { env } from "@/lib/config/env";
import { getStripe } from "@/lib/payments/stripe";
import { getStore } from "@/lib/store";
import { nowIso } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * Stripe-Webhook: Signaturprüfung, idempotente Gutschrift erst bei
 * bestätigter Zahlung, Rückbuchung bei Erstattung.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe || !env.stripe.webhookSecret) return new Response("Webhook nicht konfiguriert", { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Signatur fehlt", { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, env.stripe.webhookSecret);
  } catch {
    return new Response("Ungültige Signatur", { status: 400 });
  }
  const store = getStore();

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status !== "paid") break; // z. B. SEPA: erst bei async_payment_succeeded
        const purchase = await store.getPurchaseByRef(s.id);
        if (!purchase) {
          console.error("[stripe] unbekannte Session", s.id);
          break;
        }
        // Betrag gegen Datenbank prüfen (Manipulationsschutz)
        if (s.amount_total !== purchase.amountCents || s.currency !== "eur") {
          console.error("[stripe] Betragsabweichung", s.id);
          await store.updatePurchaseByRef(s.id, { status: "failed" });
          break;
        }
        const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
        await store.creditTokens(purchase.userId, purchase.tokens, "purchase", `stripe:checkout:${s.id}`, purchase.id, `Kauf ${purchase.packageId}`);
        await store.updatePurchaseByRef(s.id, { status: "paid", paidAt: nowIso(), paymentIntent: pi });
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        const p = await store.getPurchaseByRef(s.id);
        if (p?.status === "pending") await store.updatePurchaseByRef(s.id, { status: "failed" });
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
        if (!pi) break;
        const p = await store.getPurchaseByPaymentIntent(pi);
        if (!p || p.status === "refunded") break;
        // Anteilig: Tokens entsprechend erstattetem Betrag
        const tokens = Math.ceil((ch.amount_refunded / Math.max(1, p.amountCents)) * p.tokens);
        await store.debitRefund(p.userId, tokens, `stripe:refund:${ch.id}:${ch.amount_refunded}`, p.id);
        if (ch.amount_refunded >= p.amountCents && p.providerRef) await store.updatePurchaseByRef(p.providerRef, { status: "refunded" });
        break;
      }
    }
  } catch (e) {
    console.error("[stripe] Verarbeitung fehlgeschlagen", event.type, (e as Error).message);
    return new Response("Fehler", { status: 500 }); // Stripe wiederholt
  }
  return Response.json({ received: true });
}
