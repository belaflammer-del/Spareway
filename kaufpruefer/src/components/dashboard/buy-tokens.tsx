"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { formatEur } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

interface Pkg {
  id: string;
  tokens: number;
  priceCents: number;
  label: string;
}

export function BuyTokens({ packages, stripeEnabled, stripeTest, testCredits }: { packages: Pkg[]; stripeEnabled: boolean; stripeTest: boolean; testCredits: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(packages[1]?.id ?? packages[0]?.id);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function buy() {
    if (!consent) return toast.error("Bitte bestätige den Hinweis zum Widerrufsrecht.");
    setBusy(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packageId: selected, consentImmediateExecution: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Checkout fehlgeschlagen");
      window.location.href = data.url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  async function testCredit() {
    setBusy(true);
    const res = await fetch("/api/wallet/test-credit", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(data.error?.message ?? "Nicht möglich");
    toast.success(`${data.credited} Test-Tokens gutgeschrieben (keine echte Zahlung)`);
    router.refresh();
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Paket wählen">
        {packages.map((p) => {
          const per = p.priceCents / p.tokens / 100;
          const best = p.tokens === Math.max(...packages.map((x) => x.tokens));
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={selected === p.id}
              onClick={() => setSelected(p.id)}
              className={cn("relative rounded-2xl border p-4 text-left transition", selected === p.id ? "border-foreground ring-2 ring-foreground/10" : "border-border hover:bg-surface-2/60")}
            >
              {best && <span className="absolute -top-2.5 right-3 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-fg">Bester Preis</span>}
              <p className="text-sm text-muted">{p.label}</p>
              <p className="tabular mt-1 text-2xl font-semibold">{formatEur(p.priceCents / 100)}</p>
              <p className="tabular mt-1 text-xs text-muted">{p.tokens === 1 ? "Einzelcheck" : `entspricht ${formatEur(per)} je Check`}</p>
            </button>
          );
        })}
      </div>
      <label className="mt-5 flex items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span className="text-muted">
          Ich verlange ausdrücklich, dass mit der Bereitstellung der digitalen Leistung vor Ablauf der Widerrufsfrist begonnen wird. Mir ist bekannt, dass mein Widerrufsrecht für bereits eingelöste Tokens erlischt.
        </span>
      </label>
      <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button onClick={buy} disabled={!stripeEnabled || busy}>
          {busy && <Spinner />} {stripeEnabled ? "Zur sicheren Bezahlung" : "Zahlung noch nicht aktiv"}
        </Button>
        {stripeEnabled && stripeTest && <span className="text-xs text-muted">Stripe-Testmodus: Testkarte 4242 4242 4242 4242 verwenden.</span>}
        {testCredits && (
          <Button variant="subtle" onClick={testCredit} disabled={busy}>
            3 Test-Tokens (Demo)
          </Button>
        )}
      </div>
    </div>
  );
}
