import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/auth";
import { customerDisplayName } from "@/lib/domain";
import { formatDateTime } from "@/lib/utils";
import { isMailConfigured } from "@/lib/mailer";

export const metadata = { title: "Nachrichten" };

export default async function Inbox() {
  const ctx = await getContext();
  const { data } = await ctx.supabase.from("messages").select("id, customer_id, direction, channel, body, read_at, created_at, customers(type, first_name, last_name, company_name)")
    .eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(500);
  const threads = new Map<string, { last: NonNullable<typeof data>[number]; unread: number }>();
  for (const m of data ?? []) {
    const t = threads.get(m.customer_id) ?? { last: m, unread: 0 };
    if (m.direction === "in" && !m.read_at) t.unread++;
    threads.set(m.customer_id, t);
  }
  const list = [...threads.entries()].sort((a, b) => (b[1].unread > 0 ? 1 : 0) - (a[1].unread > 0 ? 1 : 0) || b[1].last.created_at.localeCompare(a[1].last.created_at));
  return (
    <>
      <PageHeader title="Nachrichten" description="Anfragen und Unterhaltungen mit deinen Kunden – alles an einem Ort." />
      {!isMailConfigured() && <div className="mb-4"><Notice>E-Mail-Versand ist noch nicht eingerichtet. Antworten erscheinen im persönlichen Kundenportal des Kunden (Link in jeder Unterhaltung).</Notice></div>}
      {!list.length ? (
        <EmptyState icon={<MessageSquare className="size-5" />} title="Noch keine Nachrichten" description="Anfragen über deine Buchungsseite und Nachrichten aus dem Kundenportal landen hier." />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {list.map(([cid, t]) => (
            <Link key={cid} href={`/app/nachrichten/${cid}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/50">
              <div className="min-w-0">
                <p className={`truncate ${t.unread ? "font-semibold" : "font-medium"}`}>{customerDisplayName(t.last.customers as unknown as Parameters<typeof customerDisplayName>[0])}</p>
                <p className="truncate text-sm text-muted-foreground">{t.last.direction === "out" ? "Du: " : ""}{t.last.body.split("\n")[0]}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-muted-foreground">{formatDateTime(t.last.created_at)}</span>
                {t.unread > 0 && <span className="rounded-full bg-accent px-2 text-xs font-medium text-accent-foreground">{t.unread} neu</span>}
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
