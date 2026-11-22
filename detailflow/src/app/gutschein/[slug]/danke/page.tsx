import { notFound } from "next/navigation";
import { Gift } from "lucide-react";
import { Card } from "@/components/ui";
import { isStripeConfigured } from "@/lib/env";
import { formatDate, formatEUR } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ihr Gutschein", robots: { index: false } };

/** Danke-Seite: Code anzeigen (Zuordnung über die Stripe-Session; Code wird im Webhook erzeugt) */
export default async function VoucherThanks({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  if (!session_id || !/^cs_[A-Za-z0-9_]+$/.test(session_id) || !isStripeConfigured()) notFound();
  const { getStripe } = await import("@/lib/stripe");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const s = await getStripe().checkout.sessions.retrieve(session_id);
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
  const { data: v } = pi ? await createAdminClient().from("vouchers").select("code, initial_amount, expires_on, recipient_name").eq("external_id", pi).maybeSingle() : { data: null };
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <Gift className="mx-auto mb-3 size-10 text-accent" />
        <h1 className="text-xl font-semibold">Vielen Dank!</h1>
        {v ? <>
          <p className="mt-2 text-sm text-muted-foreground">Ihr Gutschein{v.recipient_name ? ` für ${v.recipient_name}` : ""} über {formatEUR(v.initial_amount)}:</p>
          <p className="my-4 rounded-xl border-2 border-dashed border-accent py-4 font-mono text-3xl font-semibold tracking-widest">{v.code}</p>
          <p className="text-xs text-muted-foreground">Gültig bis {formatDate(v.expires_on)}. Wir haben Ihnen den Code auch per E-Mail geschickt.</p>
        </> : <p className="mt-2 text-sm text-muted-foreground">Ihre Zahlung wird verarbeitet. Der Gutscheincode kommt in wenigen Minuten per E-Mail. Sie können diese Seite neu laden.</p>}
      </Card>
    </div>
  );
}
