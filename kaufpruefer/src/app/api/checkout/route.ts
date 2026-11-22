import { CheckoutRequestSchema } from "@/lib/api/schemas";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { errorJson, rateLimit } from "@/lib/http";
import { getStripe } from "@/lib/payments/stripe";
import { getStore } from "@/lib/store";
import { newId, nowIso } from "@/lib/utils";
import { getPricing } from "@/lib/wallet/service";

export const runtime = "nodejs";

/**
 * Erstellt eine Stripe-Checkout-Session. Tokens werden NICHT hier, sondern
 * erst nach bestätigter Zahlung per Webhook gutgeschrieben.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Bitte melde dich an.");
  const stripe = getStripe();
  if (!stripe) return errorJson(503, "payments_disabled", "Zahlungen sind noch nicht konfiguriert.");
  const rl = await rateLimit(`checkout:${user.id}`, 3600, 20);
  if (!rl.allowed) return errorJson(429, "rate_limited", "Zu viele Anfragen.");

  const parsed = CheckoutRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, "consent_required", "Bitte bestätige den Hinweis zum Widerrufsrecht.");
  const pkg = (await getPricing()).packages.find((p) => p.id === parsed.data.packageId);
  if (!pkg) return errorJson(400, "unknown_package", "Unbekanntes Paket");

  const purchaseId = newId("pur");
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: user.id,
      customer_email: user.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: pkg.priceCents,
            product_data: { name: `DEAL-NIVO – ${pkg.label}`, description: `${pkg.tokens} Token für vollständige Kaufchecks` },
          },
        },
      ],
      metadata: { userId: user.id, packageId: pkg.id, tokens: String(pkg.tokens), purchaseId, consentImmediateExecution: "true", consentAt: nowIso() },
      payment_intent_data: { metadata: { userId: user.id, purchaseId, tokens: String(pkg.tokens) } },
      success_url: `${env.appUrl}/dashboard/wallet?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.appUrl}/dashboard/wallet?checkout=cancelled`,
      locale: "de",
    },
    { idempotencyKey: `checkout:${purchaseId}` },
  );
  await getStore().createPurchase({
    id: purchaseId,
    userId: user.id,
    packageId: pkg.id,
    tokens: pkg.tokens,
    amountCents: pkg.priceCents,
    currency: "eur",
    status: "pending",
    provider: "stripe",
    providerRef: session.id,
    createdAt: nowIso(),
  });
  return Response.json({ url: session.url });
}
