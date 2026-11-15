"use client";
import { useActionState, useState } from "react";
import { savePackage } from "@/app/actions/services";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

type P = { id?: string; name?: string; description?: string | null; price_mode?: "discount" | "fixed"; fixed_price?: number | null; discount_percent?: number; active?: boolean; service_ids?: string[] };

export function PackageForm({ pkg, services }: { pkg?: P; services: { id: string; name: string; category: string }[] }) {
  const [state, action] = useActionState(savePackage, undefined);
  const [mode, setMode] = useState(pkg?.price_mode ?? "discount");
  const [filter, setFilter] = useState("");
  const selected = new Set(pkg?.service_ids ?? []);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      {pkg?.id && <input type="hidden" name="id" value={pkg.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Paketname" name="name" error={e.name} className="sm:col-span-3"><Input name="name" defaultValue={pkg?.name} required /></Field>
        <Field label="Preisberechnung" name="price_mode">
          <Select name="price_mode" value={mode} onChange={(ev) => setMode(ev.target.value as "discount" | "fixed")}>
            <option value="discount">Summe der Leistungen − Rabatt</option><option value="fixed">Festpreis</option>
          </Select>
        </Field>
        {mode === "discount" ? (
          <Field label="Paketrabatt (%)" name="discount_percent"><Input name="discount_percent" inputMode="decimal" defaultValue={pkg?.discount_percent ?? 0} /></Field>
        ) : (
          <>
            <input type="hidden" name="discount_percent" value="0" />
            <Field label="Festpreis netto (€)" name="fixed_price" error={e.fixed_price} hint="Wird mit dem Fahrzeugklassen-Faktor multipliziert"><Input name="fixed_price" inputMode="decimal" defaultValue={pkg?.fixed_price ?? ""} /></Field>
          </>
        )}
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={pkg?.active ?? true} />Aktiv</label>
      </div>
      <Field label="Beschreibung für Kunden" name="description"><Textarea name="description" defaultValue={pkg?.description ?? ""} className="min-h-16" /></Field>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-medium">Enthaltene Leistungen</p><Input placeholder="Filtern …" value={filter} onChange={(ev) => setFilter(ev.target.value)} className="h-8 max-w-48" /></div>
        <div className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2">
          {services.map((s) => (
            <label key={s.id} className={`flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted ${filter && !s.name.toLowerCase().includes(filter.toLowerCase()) ? "hidden" : ""}`}>
              <input type="checkbox" name="service_ids" value={s.id} defaultChecked={selected.has(s.id)} />
              <span className="truncate">{s.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3"><SubmitButton>{pkg?.id ? "Paket speichern" : "Paket anlegen"}</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}
