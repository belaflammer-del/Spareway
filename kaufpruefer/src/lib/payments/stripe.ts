import "server-only";
import Stripe from "stripe";
import { env, features } from "../config/env";

let client: Stripe | null = null;

/**
 * Stripe-Client – nur mit Testschlüssel bzw. explizit freigegebenem
 * Live-Schlüssel (STRIPE_ALLOW_LIVE=true).
 */
export function getStripe(): Stripe | null {
  if (!features.stripe) return null;
  if (!client) client = new Stripe(env.stripe.secretKey as string, { maxNetworkRetries: 2 });
  return client;
}

export function stripeMode(): "test" | "live" | "disabled" {
  if (!features.stripe) return "disabled";
  return features.stripeTestMode ? "test" : "live";
}
