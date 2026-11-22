import Link from "next/link";
import { Gift } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader, Stat } from "@/components/ui";
import { SellVoucherForm } from "@/components/voucher-forms";
import { CopyButton } from "@/components/print-button";
import { getContext } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatDate, formatEUR } from "@/lib/utils";

export const metadata = { title: "Gutscheine" };

export default async function Vouchers() {
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("vouchers").select("*").eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(500);
  const co = ctx.company as unknown as { slug: string | null; vouchers_enabled: boolean; stripe_charges_enabled: boolean };
  const open = (data ?? []).reduce((a, v) => a + Number(v.balance), 0);
  const sold = (data ?? []).reduce((a, v) => a + Number(v.initial_amount), 0);
  const shopUrl = co.slug ? `${env.appUrl}/gutschein/${co.slug}` : null;
  return (
    <>
      <PageHeader title="Gutscheine" description="Online und vor Ort verkaufen, bei der Rechnung einlösen." />
      {!co.vouchers_enabled || !co.stripe_charges_enabled || !shopUrl
        ? <div className="mb-4"><Notice>Online-Gutscheinverkauf aktivierst du unter Einstellungen (benötigt verbundenes Stripe-Konto und eine Adresse für die Buchungsseite).</Notice></div>
        : <Card className="mb-6 flex flex-wrap items-center gap-2 p-4 text-sm"><span className="font-medium">Dein Gutschein-Shop:</span><code className="break-all rounded bg-muted px-2 py-1 text-xs">{shopUrl}</code><CopyButton text={shopUrl} /></Card>}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat label="Verkauft (gesamt)" value={formatEUR(sold)} hint={`${data?.length ?? 0} Gutscheine`} />
        <Stat label="Offenes Guthaben" value={formatEUR(open)} hint="noch nicht eingelöst" />
      </div>
      {ctx.role !== "staff" && <Card className="mb-6"><CardHeader title="Gutschein vor Ort verkaufen" description="z. B. bar bezahlt – Code ausdrucken oder weitergeben" /><div className="p-5"><SellVoucherForm /></div></Card>}
      {!data?.length ? <EmptyState icon={<Gift className="size-5" />} title="Noch keine Gutscheine" description="Gutscheine sind ein perfektes Geschenk – besonders vor Weihnachten und zum Muttertag." /> : (
        <Card className="divide-y divide-border overflow-hidden">
          {data.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0"><p className="font-mono font-medium">{v.code}</p><p className="truncate text-xs text-muted-foreground">{[v.recipient_name && `für ${v.recipient_name}`, v.buyer_name && `von ${v.buyer_name}`, formatDate(v.created_at), v.source === "online" ? "online" : "vor Ort"].filter(Boolean).join(" · ")}</p></div>
              <div className="flex shrink-0 items-center gap-2"><span className="tabular-nums">{formatEUR(v.balance)} / {formatEUR(v.initial_amount)}</span>
                <Badge tone={Number(v.balance) === 0 ? "gray" : v.expires_on < new Date().toISOString().slice(0, 10) ? "red" : "green"}>{Number(v.balance) === 0 ? "Eingelöst" : v.expires_on < new Date().toISOString().slice(0, 10) ? "Abgelaufen" : `bis ${formatDate(v.expires_on)}`}</Badge></div>
            </div>
          ))}
        </Card>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Einlösen: Rechnung öffnen › „Gutschein anrechnen“. <Link href="/app/rechnungen" className="text-accent">Zu den Rechnungen</Link></p>
    </>
  );
}
