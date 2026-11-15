import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { MessageComposer } from "@/components/message-composer";
import { CopyButton } from "@/components/print-button";
import { OrderStatusBadge } from "@/components/status";
import { getContext } from "@/lib/auth";
import { customerDisplayName, vehicleDisplayName, type OrderStatus } from "@/lib/domain";
import { cn, formatDateTime, formatEUR } from "@/lib/utils";
import { env } from "@/lib/env";
import { isMailConfigured } from "@/lib/mailer";
import { markRead, resetPortalLink } from "@/app/actions/messages";

const CHANNEL = { portal: "Portal", email: "E-Mail", telefon: "Telefonat", notiz: "Interne Notiz" } as const;

export default async function Thread({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const ctx = await getContext();
  const { data: cu } = await ctx.supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
  if (!cu) notFound();
  await markRead(customerId);
  const [{ data: msgs }, { data: templates }, { data: orders }] = await Promise.all([
    ctx.supabase.from("messages").select("*").eq("customer_id", customerId).order("created_at").limit(500),
    ctx.supabase.from("message_templates").select("key, name, body").eq("company_id", ctx.companyId).order("name"),
    ctx.supabase.from("orders").select("id, number, title, status, scheduled_start, total_gross, vehicles(make, model, variant)").eq("customer_id", customerId).neq("status", "storniert").order("created_at", { ascending: false }).limit(10),
  ]);
  const portal = `${env.appUrl}/portal/${cu.portal_token}`;
  const o = orders?.[0];
  const vars = {
    kunde: customerDisplayName(cu), firma: ctx.company.name, portal,
    fahrzeug: o?.vehicles ? vehicleDisplayName(o.vehicles as unknown as Parameters<typeof vehicleDisplayName>[0]) : "Fahrzeug",
    termin: o?.scheduled_start ? formatDateTime(o.scheduled_start) + " Uhr" : "{termin}",
    betrag: o ? formatEUR(o.total_gross) : "{betrag}",
  };
  return (
    <>
      <PageHeader title={customerDisplayName(cu)} description={[cu.phone, cu.email].filter(Boolean).join(" · ")} actions={<Link href={`/app/kunden/${customerId}`} className="text-sm text-accent">Kundenakte</Link>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="flex flex-col">
          <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
            {!msgs?.length && <p className="text-center text-sm text-muted-foreground">Noch keine Nachrichten. Schreib die erste – z. B. mit einer Vorlage.</p>}
            {(msgs ?? []).map((m) => (
              <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                  m.channel === "notiz" ? "border border-dashed border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" :
                  m.direction === "out" ? "bg-foreground text-background" : "bg-muted")}>
                  <p className="whitespace-pre-line break-words">{m.body}</p>
                  <p className="mt-1 text-[11px] opacity-60">{formatDateTime(m.created_at)} · {CHANNEL[m.channel as keyof typeof CHANNEL]}{m.email_status === "sent" ? " · E-Mail gesendet" : ""}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-5">
            <MessageComposer customerId={customerId} templates={templates ?? []} vars={vars} mailReady={isMailConfigured()}
              orders={(orders ?? []).map((x) => ({ id: x.id, label: `${x.number}${x.title ? " · " + x.title : ""}` }))} />
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="space-y-2 p-5 text-sm">
            <p className="font-medium">Kundenportal</p>
            <p className="text-muted-foreground">Persönlicher Link für {customerDisplayName(cu)}: Status, Termine, Fotos, Rechnungen und Nachrichten – ohne Passwort.</p>
            <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{portal}</code>
            <div className="flex flex-wrap gap-2"><CopyButton text={portal} /><a href={portal} target="_blank" rel="noreferrer" className="text-sm text-accent">Öffnen</a></div>
            <form action={resetPortalLink}><input type="hidden" name="customer_id" value={customerId} /><button className="text-xs text-muted-foreground hover:text-danger">Link neu erzeugen (alter Link wird ungültig)</button></form>
          </Card>
          <Card>
            <CardHeader title="Aufträge" />
            <div className="divide-y divide-border">
              {(orders ?? []).map((x) => (
                <Link key={x.id} href={`/app/auftraege/${x.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-muted/50">
                  <span className="truncate">{x.number}</span><OrderStatusBadge status={x.status as OrderStatus} />
                </Link>
              ))}
              {!orders?.length && <p className="px-5 py-4 text-sm text-muted-foreground">Keine Aufträge.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
