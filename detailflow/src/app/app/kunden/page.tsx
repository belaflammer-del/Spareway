import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { Badge, Card, EmptyState, Input, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { getContext } from "@/lib/auth";
import { customerDisplayName } from "@/lib/domain";

export const metadata = { title: "Kunden" };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; typ?: string }> }) {
  const { q, typ } = await searchParams;
  const ctx = await getContext();
  let query = ctx.supabase.from("customers")
    .select("id, type, first_name, last_name, company_name, email, phone, city, vehicles(count)")
    .eq("company_id", ctx.companyId).is("merged_into", null).order("last_name", { nullsFirst: false }).limit(200);
  if (typ === "private" || typ === "business") query = query.eq("type", typ);
  if (q?.trim()) {
    const term = q.trim().replace(/[%*,()]/g, " ");
    query = query.or(`first_name.ilike.*${term}*,last_name.ilike.*${term}*,company_name.ilike.*${term}*,email.ilike.*${term}*,phone.ilike.*${term}*,city.ilike.*${term}*`);
  }
  const { data: customers } = await query;

  return (
    <>
      <PageHeader title="Kunden" description="Alle Privat- und Geschäftskunden deines Betriebs." actions={<LinkButton href="/app/kunden/neu"><Plus className="size-4" />Neuer Kunde</LinkButton>} />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Name, E-Mail, Telefon oder Ort suchen …" className="pl-9" />
        </div>
        <div className="flex gap-2">
          {[["", "Alle"], ["private", "Privat"], ["business", "Geschäftlich"]].map(([k, l]) => (
            <Link key={k} href={`/app/kunden?typ=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={buttonClass((typ ?? "") === k ? "primary" : "secondary", "md")}>{l}</Link>
          ))}
        </div>
      </form>
      {!customers?.length ? (
        <EmptyState icon={<Users className="size-5" />} title={q ? "Keine Treffer" : "Noch keine Kunden"} description={q ? "Versuche einen anderen Suchbegriff." : "Lege deinen ersten Kunden an – das dauert keine Minute."} action={!q && <LinkButton href="/app/kunden/neu">Ersten Kunden anlegen</LinkButton>} />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {customers.map((c) => (
            <Link key={c.id} href={`/app/kunden/${c.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-muted/50">
              <div className="min-w-0">
                <p className="truncate font-medium">{customerDisplayName(c)}</p>
                <p className="truncate text-sm text-muted-foreground">{[c.phone, c.email, c.city].filter(Boolean).join(" · ") || "Keine Kontaktdaten"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {c.type === "business" && <Badge tone="violet">Geschäftlich</Badge>}
                <Badge>{(c.vehicles as unknown as { count: number }[])?.[0]?.count ?? 0} Fahrzeug(e)</Badge>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
