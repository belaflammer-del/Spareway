import type { Metadata } from "next";
import { BuyTokens } from "@/components/dashboard/buy-tokens";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth/session";
import { env, features } from "@/lib/config/env";
import { formatEur } from "@/lib/domain/labels";
import { getStore } from "@/lib/store";
import { getPricing } from "@/lib/wallet/service";

export const metadata: Metadata = { title: "Token-Wallet" };

const TX_LABELS: Record<string, string> = {
  purchase: "Kauf",
  reserve: "Kaufcheck",
  release: "Rückbuchung (Analyse fehlgeschlagen)",
  purchase_refund: "Erstattung",
  admin_adjust: "Korrektur",
  test_credit: "Test-Gutschrift",
};

export default async function WalletPage({ searchParams }: PageProps<"/dashboard/wallet">) {
  const user = await requireUser("/dashboard/wallet");
  const sp = await searchParams;
  const store = getStore();
  const [balance, tx, purchases, pricing] = await Promise.all([store.getBalance(user.id), store.listTransactions(user.id, 50), store.listPurchases(user.id), getPricing()]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Token-Wallet</h1>
        <p className="mt-1 text-sm text-muted">Einmalige Käufe, kein Abo. Tokens werden erst nach bestätigter Zahlung gutgeschrieben.</p>
      </div>
      {sp.checkout === "success" && <Alert tone="good" title="Danke für deinen Kauf!">Sobald die Zahlung bestätigt ist, erscheinen die Tokens hier. Das dauert meist nur wenige Sekunden – lade die Seite ggf. neu.</Alert>}
      {sp.checkout === "cancelled" && <Alert tone="info">Der Kauf wurde abgebrochen. Es wurde nichts berechnet.</Alert>}
      {!features.stripe && <Alert tone="demo" title="Demo-Modus">Stripe ist nicht konfiguriert – es sind keine echten Zahlungen möglich.</Alert>}

      <Card className="p-5 sm:p-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-muted">Aktuelles Guthaben</p>
            <p className="tabular text-5xl font-semibold tracking-tight">{balance}</p>
          </div>
          <Badge>1 Token = {pricing.fullCheckCost === 1 ? "1 Kaufcheck" : `${pricing.fullCheckCost} Tokens pro Check`}</Badge>
        </div>
        <div className="mt-6">
          <BuyTokens packages={pricing.packages} stripeEnabled={features.stripe} stripeTest={features.stripeTestMode} testCredits={!features.stripe && env.allowTestCredits} />
        </div>
        <p className="mt-5 text-xs text-muted">
          Zusatzleistungen wie externe Fahrzeughistorien werden separat berechnet (aktuell {formatEur(pricing.vehicleHistoryPriceCents / 100)}, sobald ein Anbieter angebunden ist).
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Transaktionsprotokoll</h2>
          {tx.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Noch keine Buchungen.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {tx.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate">{TX_LABELS[t.type] ?? t.type}</p>
                    <p className="text-xs text-muted">{new Date(t.createdAt).toLocaleString("de-DE")}</p>
                  </div>
                  <span className={`tabular font-medium ${t.amount > 0 ? "text-good" : ""}`}>{t.amount > 0 ? `+${t.amount}` : t.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Kaufhistorie</h2>
          {purchases.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Noch keine Käufe.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border text-sm">
              {purchases.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p>{p.provider === "test" ? "Test-Gutschrift" : `${p.tokens} Token`}</p>
                    <p className="text-xs text-muted">{new Date(p.createdAt).toLocaleString("de-DE")}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular">{formatEur(p.amountCents / 100)}</p>
                    <Badge tone={p.status === "paid" ? "good" : p.status === "pending" ? "warn" : p.status === "refunded" ? "info" : "bad"}>
                      {{ paid: "Bezahlt", pending: "Ausstehend", refunded: "Erstattet", failed: "Fehlgeschlagen" }[p.status]}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
