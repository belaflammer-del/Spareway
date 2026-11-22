import { getCurrentUser } from "@/lib/auth/session";
import { env, features } from "@/lib/config/env";
import { errorJson, rateLimit } from "@/lib/http";
import { getStore } from "@/lib/store";
import { newId, nowIso } from "@/lib/utils";

export const runtime = "nodejs";

/** Test-Gutschrift ohne Zahlung – nur im Entwicklungs-/Demo-Betrieb ohne Stripe. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return errorJson(401, "unauthorized", "Bitte melde dich an.");
  if (features.stripe || !env.allowTestCredits) return errorJson(403, "disabled", "Test-Gutschriften sind deaktiviert.");
  const rl = await rateLimit(`testcredit:${user.id}`, 24 * 3600, 5);
  if (!rl.allowed) return errorJson(429, "rate_limited", "Tageslimit für Test-Gutschriften erreicht.");
  const id = newId("pur");
  await getStore().createPurchase({ id, userId: user.id, packageId: "test", tokens: 3, amountCents: 0, currency: "eur", status: "paid", provider: "test", providerRef: id, createdAt: nowIso(), paidAt: nowIso() });
  await getStore().creditTokens(user.id, 3, "test_credit", `test:${id}`, id, "Test-Gutschrift (keine echte Zahlung)");
  return Response.json({ ok: true, credited: 3 });
}
