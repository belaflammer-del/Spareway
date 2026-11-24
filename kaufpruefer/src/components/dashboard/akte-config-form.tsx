"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { saveAkteConfigAction } from "@/lib/admin/actions";

export interface AkteConfigValues {
  chatChecksPerAnalysis: number;
  chatScreenshotsMax: number;
  inspectionPhotosMax: number;
  inspectionPhotoAiMax: number;
  imageMatchPerAnalysis: number;
  watchesPerUser: number;
  watchMinIntervalHours: number;
  watchManualUpdatesPerDay: number;
  notificationsPerUserDay: number;
  chatDays: number;
  inspectionDays: number;
  imageHashDays: number;
  snapshotDays: number;
  costTable: string;
  guardianEnabled: boolean;
  guardianPrice: number;
  guardianChatChecks: number;
}

const FIELDS: [keyof AkteConfigValues, string][] = [
  ["chatChecksPerAnalysis", "Chatprüfungen je Kaufakte"],
  ["chatScreenshotsMax", "Max. Chat-Screenshots je Prüfung"],
  ["inspectionPhotosMax", "Max. Besichtigungsfotos"],
  ["inspectionPhotoAiMax", "KI-Fotoprüfungen je Besichtigung"],
  ["imageMatchPerAnalysis", "Bildabgleiche je Kaufakte"],
  ["watchesPerUser", "Beobachtete Angebote je Nutzer"],
  ["watchMinIntervalHours", "Min. Abfrageintervall (Stunden)"],
  ["watchManualUpdatesPerDay", "Manuelle Aktualisierungen/Tag"],
  ["notificationsPerUserDay", "Benachrichtigungen je Nutzer/Tag"],
  ["chatDays", "Löschfrist Chatprüfungen (Tage)"],
  ["inspectionDays", "Löschfrist Besichtigungen (Tage)"],
  ["imageHashDays", "Löschfrist Bild-Hashes (Tage)"],
  ["snapshotDays", "Löschfrist Preisverlauf (Tage)"],
];

export function AkteConfigForm(v: AkteConfigValues) {
  const [state, action, pending] = useActionState(saveAkteConfigAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([k, label]) => (
          <div key={k} className="grid gap-1.5">
            <Label htmlFor={k}>{label}</Label>
            <Input id={k} name={k} defaultValue={String(v[k])} inputMode="numeric" />
          </div>
        ))}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="costTable">Kostentabelle (JSON, nur belegte Einträge mit Quelle und Prüfdatum)</Label>
        <Textarea
          id="costTable"
          name="costTable"
          rows={6}
          className="font-mono text-xs"
          defaultValue={v.costTable}
          placeholder='[{"id":"reifen-golf","category":"vehicle","item":"tires","model":"golf","lowEur":400,"highEur":700,"source":"3 Angebote Reifenhändler, Region X","reviewedAt":"2026-11-01"}]'
        />
        <p className="text-xs text-muted">Ohne Eintrag zeigt DEAL-NIVO „Betrag unbekannt“ – es werden keine Beträge erfunden.</p>
      </div>
      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-semibold">Guardian-Paket (Konzept)</legend>
        <p className="mb-2 text-xs text-muted">Nur Anzeige auf der Preisseite als „in Vorbereitung“. Es wird KEINE Zahlung und kein Preis aktiviert.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="guardianEnabled" defaultChecked={v.guardianEnabled} /> Konzept auf der Preisseite anzeigen
        </label>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="guardianPrice">Testpreis je Kaufakte (€)</Label>
            <Input id="guardianPrice" name="guardianPrice" defaultValue={String(v.guardianPrice)} inputMode="decimal" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="guardianChatChecks">Enthaltene Chatprüfungen</Label>
            <Input id="guardianChatChecks" name="guardianChatChecks" defaultValue={String(v.guardianChatChecks)} inputMode="numeric" />
          </div>
        </div>
      </fieldset>
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      {state.message && <Alert tone="good">{state.message}</Alert>}
      <Button disabled={pending} size="sm">Speichern</Button>
    </form>
  );
}
