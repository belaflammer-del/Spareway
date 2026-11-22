"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { savePricingAction } from "@/lib/admin/actions";
import type { PricingConfig } from "@/lib/config/pricing";

export function PricingForm({ pricing }: { pricing: PricingConfig }) {
  const [state, action, pending] = useActionState(savePricingAction, {});
  const rows = [...pricing.packages, ...Array.from({ length: Math.max(0, 4 - pricing.packages.length) }, () => null)];
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="fcc">Tokens pro Kaufcheck</Label>
          <Input id="fcc" name="fullCheckCost" defaultValue={pricing.fullCheckCost} inputMode="numeric" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vh">Fahrzeughistorie (€, Zusatzleistung)</Label>
          <Input id="vh" name="vehicleHistoryPrice" defaultValue={(pricing.vehicleHistoryPriceCents / 100).toFixed(2)} inputMode="decimal" />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Pakete (leere ID = nicht verwendet)</p>
        {rows.map((p, i) => (
          <div key={i} className="grid grid-cols-4 gap-2">
            <Input name={`p${i}_id`} placeholder="id" defaultValue={p?.id ?? ""} aria-label="ID" />
            <Input name={`p${i}_label`} placeholder="Bezeichnung" defaultValue={p?.label ?? ""} aria-label="Bezeichnung" />
            <Input name={`p${i}_tokens`} placeholder="Tokens" defaultValue={p?.tokens ?? ""} inputMode="numeric" aria-label="Tokens" />
            <Input name={`p${i}_price`} placeholder="Preis €" defaultValue={p ? (p.priceCents / 100).toFixed(2) : ""} inputMode="decimal" aria-label="Preis" />
          </div>
        ))}
      </div>
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      {state.message && <Alert tone="good">{state.message}</Alert>}
      <Button disabled={pending}>Preise speichern</Button>
    </form>
  );
}
