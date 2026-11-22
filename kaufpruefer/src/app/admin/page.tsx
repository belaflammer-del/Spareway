import type { Metadata } from "next";
import { PricingForm } from "@/components/dashboard/pricing-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toggleDemoAction, toggleProviderAction } from "@/lib/admin/actions";
import { requireAdmin } from "@/lib/auth/session";
import { features } from "@/lib/config/env";
import { PROVIDER_INFO, type ProviderKey } from "@/lib/config/providers";
import { DEMO_DEFINITIONS } from "@/lib/demo/definitions";
import { CATEGORY_LABELS, formatEur } from "@/lib/domain/labels";
import type { Category } from "@/lib/domain/schemas";
import { getStore } from "@/lib/store";
import { getPricing } from "@/lib/wallet/service";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

export default async function AdminPage() {
  await requireAdmin();
  const store = getStore();
  const [s, cfg, pricing] = await Promise.all([store.adminStats(), store.getConfig(), getPricing()]);
  const usdToEur = 0.92; // Näherung nur für die Wirtschaftlichkeitsanzeige
  const netRevenue = (s.revenueCents - s.refundsCents) / 100;
  const aiCostEur = s.aiCostUsdTotal * usdToEur;
  const avgPricePerToken = s.tokensSold ? netRevenue / s.tokensSold : pricing.packages[0].priceCents / 100;
  const margin = avgPricePerToken - s.aiCostUsdAvg * usdToEur;
  const maxCat = Math.max(1, ...Object.values(s.byCategory));

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
        <p className="mt-1 text-sm text-muted">Aggregierte Kennzahlen ohne personenbezogene Details. Datenbank: {store.kind === "supabase" ? "Supabase" : "lokal"}.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Nutzer" value={String(s.users)} sub={`+${s.usersLast7d} in 7 Tagen`} />
        <Kpi label="Analysen" value={String(s.analyses)} sub={`${s.analysesCompleted} abgeschlossen · ${s.analysesFailed} fehlgeschlagen`} />
        <Kpi label="Schnellchecks" value={String(s.quickChecks)} />
        <Kpi label="Verkaufte Tokens" value={String(s.tokensSold)} sub="inkl. Test-Gutschriften" />
        <Kpi label="Umsatz (netto Erstattungen)" value={formatEur(netRevenue)} sub={`Erstattungen ${formatEur(s.refundsCents / 100)}`} />
        <Kpi label="KI-Kosten gesamt" value={`$${s.aiCostUsdTotal.toFixed(2)}`} sub={`≈ ${formatEur(aiCostEur)}`} />
        <Kpi label="KI-Kosten pro Analyse" value={`$${s.aiCostUsdAvg.toFixed(3)}`} />
        <Kpi label="Deckungsbeitrag pro Token" value={formatEur(margin)} sub="Ø Erlös/Token − Ø KI-Kosten (ohne Zahlungsgebühren)" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Genutzte Produktkategorien</h2>
          <ul className="mt-4 space-y-2.5">
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
              <li key={c} className="text-sm">
                <div className="flex justify-between"><span>{CATEGORY_LABELS[c]}</span><span className="tabular text-muted">{s.byCategory[c] ?? 0}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${((s.byCategory[c] ?? 0) / maxCat) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Modi: {Object.entries(s.byMode).map(([k, v]) => `${k}: ${v}`).join(" · ") || "–"}</p>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Fehlerhafte Analysen</h2>
          {s.recentFailures.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Keine.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {s.recentFailures.map((f) => (
                <li key={f.id} className="flex justify-between gap-3 py-2">
                  <span className="truncate font-mono text-xs">{f.id}</span>
                  <span className="text-muted">{CATEGORY_LABELS[f.category as Category] ?? f.category}</span>
                  <Badge tone="bad">{f.errorCode}</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">Fehlgeschlagene Analysen werden automatisch zurückgebucht.</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Analyse-Provider</h2>
          <ul className="mt-3 space-y-3">
            {(Object.keys(PROVIDER_INFO) as ProviderKey[]).map((k) => {
              const info = PROVIDER_INFO[k];
              const configured = info.configured();
              const enabled = configured && cfg.providers?.[k] !== false;
              return (
                <li key={k} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{info.label}</p>
                    <p className="truncate text-xs text-muted">{configured ? "Konfiguriert" : `Nicht konfiguriert (${info.note})`}</p>
                  </div>
                  <form action={toggleProviderAction}>
                    <input type="hidden" name="key" value={k} />
                    <Button size="sm" variant={enabled ? "outline" : "subtle"} disabled={!configured}>{enabled ? "Aktiv – deaktivieren" : "Inaktiv"}</Button>
                  </form>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">Zahlungen: {features.stripe ? (features.stripeTestMode ? "Stripe-Testmodus" : "Stripe live") : "nicht konfiguriert"}</p>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Demo-Beispiele</h2>
          <ul className="mt-3 space-y-2">
            {DEMO_DEFINITIONS.map((d) => {
              const visible = cfg.demoVisibility?.[d.slug] !== false;
              return (
                <li key={d.slug} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{d.listing.title?.replace(" (Demo)", "")}</span>
                  <form action={toggleDemoAction}>
                    <input type="hidden" name="slug" value={d.slug} />
                    <Button size="sm" variant={visible ? "outline" : "subtle"}>{visible ? "Sichtbar" : "Ausgeblendet"}</Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold">Tokenpreise & Verbrauch</h2>
        <p className="mt-1 text-sm text-muted">Änderungen gelten für neue Käufe. Bereits gekaufte Tokens bleiben unverändert gültig.</p>
        <div className="mt-4">
          <PricingForm pricing={pricing} />
        </div>
      </Card>
    </div>
  );
}
