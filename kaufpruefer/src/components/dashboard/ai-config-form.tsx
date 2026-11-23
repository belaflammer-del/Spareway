"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { saveAiConfigAction } from "@/lib/admin/actions";

export function AiConfigForm({ model, defaultModel, budget }: { model?: string; defaultModel: string; budget: number }) {
  const [state, action, pending] = useActionState(saveAiConfigAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="model">KI-Modell (leer = {defaultModel})</Label>
          <Input id="model" name="model" defaultValue={model ?? ""} placeholder={defaultModel} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="budget">Tagesbudget KI (USD)</Label>
          <Input id="budget" name="dailyBudgetUsd" defaultValue={budget} inputMode="decimal" />
        </div>
      </div>
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      {state.message && <Alert tone="good">{state.message}</Alert>}
      <Button disabled={pending} size="sm">Speichern</Button>
    </form>
  );
}
