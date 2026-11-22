import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CalendarClock, CheckCircle2, FileText, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, Notice, buttonClass } from "@/components/ui";
import { BeforeAfter } from "@/components/photos";
import { rateLimit } from "@/lib/rate-limit";
import { ORDER_STATUS_LABELS, QUOTE_STATUS_LABELS, type OrderStatus, type QuoteStatus } from "@/lib/domain";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/invoice";
import { cn, formatDate, formatDateTime, formatEUR } from "@/lib/utils";
import { portalSend } from "@/app/actions/public-portal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ihr Kundenbereich" };

// Kundenfreundliche Statusstufen
const STEPS: { label: string; statuses: OrderStatus[] }[] = [
  { label: "Angefragt", statuses: ["anfrage", "angebot_erstellt"] },
  { label: "Termin bestätigt", statuses: ["bestaetigt", "geplant"] },
  { label: "In Arbeit", statuses: ["fahrzeug_angenommen", "in_bearbeitung", "qualitaetskontrolle"] },
  { label: "Abholbereit", statuses: ["fertig", "abholbereit"] },
  { label: "Abgeschlossen", statuses: ["abgeschlossen"] },
];

type Portal = {
  company: { name: string; phone: string | null; email: string | null; street: string | null; zip: string | null; city: string | null };
  customer: { name: string };
  orders: { id: string; number: string; status: OrderStatus; title: string | null; scheduled_start: string | null; total_gross: number; vehicle: string | null; photos: string[] }[];
  quotes: { number: string; status: QuoteStatus; total_gross: number; token: string }[];
  invoices: { id: string; number: string; kind: string; status: InvoiceStatus; total_gross: number; issue_date: string; due_date: string | null }[];
  messages: { direction: "in" | "out"; body: string; created_at: string }[];
};

async function signPhotos(paths: string[]) {
  // Die Pfade stammen ausschließlich aus get_portal (nur Fotos dieses Kunden). Signieren erfordert den Service-Schlüssel.
  if (!paths.length || !process.env.SUPABASE_SERVICE_ROLE_KEY) return new Map<string, string>();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data } = await createAdminClient().storage.from("company-files").createSignedUrls(paths, 3600);
  return new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl]));
}

export default async function PortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ neu?: string; gesendet?: string; fehler?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!rateLimit(`portalview:${ip}`, 60, 60_000)) return <p className="p-10 text-center">Zu viele Anfragen. Bitte kurz warten.</p>;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_portal", { token });
  if (!data) notFound();
  const p = data as Portal;
  const photoUrls = await signPhotos(p.orders.flatMap((o) => o.photos));
  const active = p.orders.filter((o) => o.status !== "abgeschlossen");
  const done = p.orders.filter((o) => o.status === "abgeschlossen");

  const orderCard = (o: Portal["orders"][number]) => {
    const step = STEPS.findIndex((s) => s.statuses.includes(o.status));
    const urls = o.photos.map((x) => photoUrls.get(x)).filter(Boolean) as string[];
    return (
      <Card key={o.id} className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="font-semibold">{o.vehicle ?? "Ihr Fahrzeug"}</p><p className="text-sm text-muted-foreground">{o.title ?? o.number}</p></div>
          <Badge tone={o.status === "abholbereit" || o.status === "fertig" ? "green" : "blue"}>{ORDER_STATUS_LABELS[o.status]}</Badge>
        </div>
        {o.scheduled_start && <p className="mt-3 flex items-center gap-2 text-sm"><CalendarClock className="size-4 text-muted-foreground" />Termin: {formatDateTime(o.scheduled_start)} Uhr</p>}
        <ol className="mt-4 grid grid-cols-5 gap-1">
          {STEPS.map((s, i) => (
            <li key={s.label} className="text-center">
              <div className={cn("h-1.5 rounded-full", i <= step ? "bg-accent" : "bg-muted")} />
              <span className={cn("mt-1 block text-[10px] leading-tight sm:text-xs", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>{s.label}</span>
            </li>
          ))}
        </ol>
        {urls.length >= 2 && <div className="mt-4"><BeforeAfter before={urls[0]} after={urls[urls.length - 1]} /></div>}
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header>
        <p className="text-sm text-muted-foreground">{p.company.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Hallo {p.customer.name}</h1>
        <p className="text-sm text-muted-foreground">Hier sehen Sie den Stand Ihrer Aufträge, Angebote und Rechnungen.</p>
      </header>
      {sp.neu && <Notice tone="green"><CheckCircle2 className="mr-1 inline size-4" />Vielen Dank! Ihre Anfrage ist eingegangen. Wir melden uns hier und ggf. per E-Mail. Speichern Sie sich diese Seite als Lesezeichen.</Notice>}
      {sp.fehler && <Notice tone="red">{sp.fehler}</Notice>}

      {active.length > 0 && <section className="space-y-3"><h2 className="font-semibold">Aktuelle Aufträge</h2>{active.map(orderCard)}</section>}

      {p.quotes.length > 0 && (
        <Card>
          <CardHeader title="Angebote" />
          <div className="divide-y divide-border">
            {p.quotes.map((q) => (
              <Link key={q.number} href={`/angebot/${q.token}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50">
                <span className="flex items-center gap-2 text-sm"><FileText className="size-4" />{q.number}</span>
                <span className="flex items-center gap-2 text-sm"><span className="tabular-nums">{formatEUR(q.total_gross)}</span><Badge tone={q.status === "sent" ? "blue" : "green"}>{q.status === "sent" ? "Bitte prüfen" : QUOTE_STATUS_LABELS[q.status]}</Badge></span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {p.invoices.length > 0 && (
        <Card>
          <CardHeader title="Rechnungen" />
          <div className="divide-y divide-border">
            {p.invoices.map((i) => (
              <Link key={i.id} href={`/portal/${token}/rechnung/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50">
                <span className="flex items-center gap-2 text-sm"><Receipt className="size-4" />{i.kind === "cancellation" ? "Storno " : ""}{i.number} · {formatDate(i.issue_date)}</span>
                <span className="flex items-center gap-2 text-sm"><span className="tabular-nums">{formatEUR(i.total_gross)}</span><Badge tone={INVOICE_STATUS_TONE[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Badge></span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card id="nachrichten">
        <CardHeader title="Nachrichten" description={`Direkt an ${p.company.name}`} />
        <div className="max-h-96 space-y-3 overflow-y-auto p-5">
          {!p.messages.length && <p className="text-center text-sm text-muted-foreground">Noch keine Nachrichten.</p>}
          {p.messages.map((m, i) => (
            <div key={i} className={cn("flex", m.direction === "in" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", m.direction === "in" ? "bg-foreground text-background" : "bg-card border border-border")}>
                <p className="whitespace-pre-line break-words">{m.body}</p>
                <p className="mt-1 text-[11px] opacity-60">{m.direction === "in" ? "Sie" : p.company.name} · {formatDateTime(m.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
        <form action={portalSend} className="space-y-2 border-t border-border p-5">
          <input type="hidden" name="token" value={token} />
          <textarea name="body" required maxLength={2000} placeholder="Ihre Nachricht …" className="min-h-20 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
          <div className="flex items-center gap-3"><button className={buttonClass("primary")}>Senden</button>{sp.gesendet && <span className="text-sm text-emerald-600">Gesendet.</span>}</div>
        </form>
      </Card>

      {done.length > 0 && <section className="space-y-3"><h2 className="font-semibold">Frühere Aufträge</h2>{done.map(orderCard)}</section>}

      <footer className="pb-8 text-center text-xs text-muted-foreground">
        {p.company.name} · {[p.company.street, [p.company.zip, p.company.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}{p.company.phone && <> · {p.company.phone}</>}
        <br />Dieser Link ist persönlich. Bitte nicht weitergeben.
      </footer>
    </div>
  );
}
