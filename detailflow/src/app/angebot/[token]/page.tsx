import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QuoteDocument, type QuoteDoc } from "@/components/quote-document";
import { Notice, buttonClass } from "@/components/ui";
import { rateLimit } from "@/lib/rate-limit";
import { respondToQuote } from "@/app/actions/public";

export const metadata = { title: "Ihr Angebot", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PublicQuote({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ergebnis?: string; fehler?: string }> }) {
  const { token } = await params;
  const { ergebnis, fehler } = await searchParams;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!rateLimit(`pubquote:${ip}`, 60, 60_000)) return <p className="p-10 text-center">Zu viele Anfragen. Bitte später erneut versuchen.</p>;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_quote", { token });
  if (!data) notFound();
  const q = data as QuoteDoc & { status: string; vehicle: QuoteDoc["vehicle"] };
  return (
    <div className="min-h-dvh bg-muted/40 px-4 py-8">
      <div className="no-print mx-auto mb-6 max-w-[210mm] space-y-3">
        {ergebnis === "accepted" && <Notice tone="green"><CheckCircle2 className="mr-1 inline size-4" />Vielen Dank! Sie haben das Angebot angenommen. Wir melden uns zur Terminabstimmung.</Notice>}
        {ergebnis === "rejected" && <Notice>Sie haben das Angebot abgelehnt. Bei Fragen sind wir gerne für Sie da.</Notice>}
        {ergebnis === "expired" && <Notice tone="amber">Dieses Angebot ist leider abgelaufen. Bitte kontaktieren Sie uns.</Notice>}
        {fehler && <Notice tone="red">{fehler}</Notice>}
        {q.status === "sent" && !ergebnis && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm">Möchten Sie dieses Angebot annehmen?</p>
            <form action={respondToQuote} className="flex gap-2">
              <input type="hidden" name="token" value={token} />
              <button name="accept" value="false" className={buttonClass("secondary")}><XCircle className="size-4" />Ablehnen</button>
              <button name="accept" value="true" className={buttonClass("primary")}><CheckCircle2 className="size-4" />Angebot annehmen</button>
            </form>
          </div>
        )}
        {q.status === "accepted" && !ergebnis && <Notice tone="green">Dieses Angebot wurde angenommen.</Notice>}
      </div>
      <QuoteDocument q={{ ...q, customer: { name: (q.customer as { name: string }).name } }} />
    </div>
  );
}
