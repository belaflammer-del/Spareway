import { notFound } from "next/navigation";
import { Gift } from "lucide-react";
import { Card, Field, Input, Notice, Textarea, buttonClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { buyVoucher } from "@/app/actions/public-portal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gutschein verschenken" };

export default async function VoucherShop({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const { slug } = await params;
  const { fehler } = await searchParams;
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) notFound();
  const { data } = await (await createClient()).rpc("get_booking_page", { p_slug: slug });
  if (!data?.vouchers_enabled) notFound();
  return (
    <div className="min-h-dvh bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <header className="text-center">
          <Gift className="mx-auto mb-2 size-8 text-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">Gutschein von {data.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Das perfekte Geschenk für alle, die ihr Auto lieben. Der Code kommt sofort per E-Mail.</p>
        </header>
        {fehler && <Notice tone="red">{fehler}</Notice>}
        <Card className="p-6">
          <form action={buyVoucher} className="space-y-4">
            <input type="hidden" name="slug" value={slug} />
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Betrag</legend>
              <div className="grid grid-cols-3 gap-2">
                {[25, 50, 75, 100, 150, 250].map((a, i) => (
                  <label key={a} className="cursor-pointer rounded-lg border border-border p-3 text-center text-sm font-medium has-[:checked]:border-accent has-[:checked]:ring-1 has-[:checked]:ring-accent">
                    <input type="radio" name="amount" value={a} defaultChecked={i === 1} className="sr-only" />{a} €
                  </label>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" name="amount" value="custom" />Anderer Betrag: <Input name="custom_amount" inputMode="numeric" className="h-9 w-24" placeholder="€" /></label>
            </fieldset>
            <Field label="Ihr Name *" name="buyer_name"><Input id="buyer_name" name="buyer_name" required autoComplete="name" /></Field>
            <Field label="Ihre E-Mail *" name="buyer_email" hint="Hierhin senden wir den Gutscheincode."><Input id="buyer_email" name="buyer_email" type="email" required autoComplete="email" /></Field>
            <Field label="Für wen ist der Gutschein? (optional)" name="recipient_name"><Input id="recipient_name" name="recipient_name" /></Field>
            <Field label="Persönliche Nachricht (optional)" name="message"><Textarea id="message" name="message" maxLength={300} className="min-h-16" /></Field>
            <button className={buttonClass("primary", "md", "w-full")}>Weiter zur Zahlung</button>
            <p className="text-center text-xs text-muted-foreground">Sichere Zahlung über Stripe. Gültig 3 Jahre zum Jahresende.</p>
          </form>
        </Card>
      </div>
    </div>
  );
}
