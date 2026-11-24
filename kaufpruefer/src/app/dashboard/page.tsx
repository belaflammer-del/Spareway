import type { Metadata } from "next";
import Link from "next/link";
import { AnalysisList } from "@/components/dashboard/analysis-list";
import { NotificationsPanel } from "@/components/dashboard/notifications";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { getStore } from "@/lib/store";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const sp = await searchParams;
  const store = getStore();
  const [balance, analyses, notifications, watches] = await Promise.all([store.getBalance(user.id), store.listAnalyses(user.id, 5), store.listNotifications(user.id, 20), store.listWatches(user.id)]);
  const watched = (await Promise.all(watches.map(async (w) => ({ w, a: await store.getAnalysis(w.analysisId, user.id) })))).filter((x) => x.a);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Übersicht</h1>
        <p className="mt-1 text-sm text-muted">Deine Prüfungen, dein Guthaben.</p>
      </div>
      {sp.verified && <Alert tone="good">Deine E-Mail-Adresse wurde bestätigt.</Alert>}
      {sp.pw === "updated" && <Alert tone="good">Dein Passwort wurde geändert.</Alert>}
      {!user.emailVerified && <Alert tone="warn">Bitte bestätige deine E-Mail-Adresse über den Link in der Bestätigungs-E-Mail.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm text-muted">Token-Guthaben</p>
          <p className="tabular mt-1 text-4xl font-semibold tracking-tight">{balance}</p>
          <p className="mt-1 text-xs text-muted">1 Token = 1 vollständiger Kaufcheck</p>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href="/dashboard/wallet">Tokens kaufen</Link>
          </Button>
        </Card>
        <Card className="flex flex-col justify-between p-5">
          <div>
            <p className="font-semibold">Neues Angebot prüfen</p>
            <p className="mt-1 text-sm text-muted">Link einfügen oder Screenshots hochladen.</p>
          </div>
          <Button asChild className="mt-4 self-start">
            <Link href="/check">Jetzt prüfen</Link>
          </Button>
        </Card>
      </div>
      <NotificationsPanel items={notifications} />
      {watched.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold">Beobachtete Angebote</h2>
          <ul className="space-y-2">
            {watched.map(({ w, a }) => (
              <li key={w.id}>
                <Link href={`/analysis/${w.analysisId}#s-watch`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{a!.title}</span>
                  <span className="shrink-0 text-xs text-muted">{w.mode === "auto" ? "automatisch" : "manuell"}{w.lastCheckedAt ? ` · ${new Date(w.lastCheckedAt).toLocaleDateString("de-DE")}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Letzte Analysen</h2>
          <Link href="/dashboard/analyses" className="text-sm text-muted hover:text-foreground">Alle ansehen</Link>
        </div>
        <AnalysisList items={analyses} />
      </div>
    </div>
  );
}
