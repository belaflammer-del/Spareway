import "server-only";
import Stripe from "stripe";
import { isStripeConfigured } from "./env";

let client: Stripe | null = null;
/** Stripe-Client. Ohne STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET wird nichts ausgeführt. */
export function getStripe(): Stripe {
  if (!isStripeConfigured()) throw new Error("Stripe ist nicht konfiguriert (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET).");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia", appInfo: { name: "DetailFlow" } });
  return client;
}

export function priceIdForPlan(plan: string) {
  return { starter: process.env.STRIPE_PRICE_STARTER, professional: process.env.STRIPE_PRICE_PROFESSIONAL, business: process.env.STRIPE_PRICE_BUSINESS }[plan] || null;
}

/** Erster Tag des aktuellen Monats in Europe/Berlin (YYYY-MM-01) */
export function currentFeeMonth() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(new Date());
  return `${p}-01`;
}
