"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { saveAiConfigAction } from "@/lib/admin/actions";

export interface AiConfigValues {
  model?: string;
  fastModel?: string;
  defaultModel: string;
  dailyBudgetUsd: number;
  perAnalysisUsd: number;
  perUserDayUsd: number;
  globalMonthUsd: number;
  maxCallsPerAnalysis: number;
  maxImagesPerUpload: number;
  videoMaxSeconds: number;
  videoMaxMb: number;
  chatQuestionsPerAnalysis: number;
}

const FIELDS: [keyof AiConfigValues, string, string?][] = [
  ["dailyBudgetUsd", "Globales Tagesbudget (USD)"],
  ["globalMonthUsd", "Globales Monatsbudget (USD)"],
  ["perAnalysisUsd", "Kostenlimit pro Analyse (USD)"],
  ["perUserDayUsd", "Limit pro Nutzer & Tag (USD)"],
  ["maxCallsPerAnalysis", "Max. KI-Aufrufe pro Analyse"],
  ["chatQuestionsPerAnalysis", "Rückfragen pro Kaufcheck"],
  ["maxImagesPerUpload", "Max. Screenshots pro Prüfung"],
  ["videoMaxSeconds", "Max. Videolänge (Sekunden)"],
  ["videoMaxMb", "Max. Videogröße (MB)"],
];

export function AiConfigForm(v: AiConfigValues) {
  const [state, action, pending] = useActionState(saveAiConfigAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="model">Hauptmodell (Bild-/Produktanalyse)</Label>
          <Input id="model" name="model" defaultValue={v.model ?? ""} placeholder={v.defaultModel} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fastModel">Schnelles Modell (Extraktion, OCR, Texte)</Label>
          <Input id="fastModel" name="fastModel" defaultValue={v.fastModel ?? ""} placeholder="leer = Hauptmodell" />
        </div>
        {FIELDS.map(([k, label]) => (
          <div key={k} className="grid gap-1.5">
            <Label htmlFor={k}>{label}</Label>
            <Input id={k} name={k} defaultValue={String(v[k] ?? "")} inputMode="decimal" />
          </div>
        ))}
      </div>
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      {state.message && <Alert tone="good">{state.message}</Alert>}
      <Button disabled={pending} size="sm">Speichern</Button>
    </form>
  );
}
