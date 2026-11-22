"use client";
import { useActionState, useState } from "react";
import { saveService } from "@/app/actions/services";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { VEHICLE_CLASSES, VEHICLE_CLASS_LABELS } from "@/lib/domain";

type S = {
  id?: string; name?: string; category_id?: string | null; description?: string | null; customer_description?: string | null; internal_notes?: string | null;
  pricing_type?: "fixed" | "hourly"; base_price?: number; hourly_rate?: number | null; duration_minutes?: number; material_cost?: number; min_price?: number | null;
  tax_rate?: number | null; applies_vehicle_class?: boolean; applies_soiling?: boolean; active?: boolean; size_surcharges?: Record<string, number> | null;
};

export function ServiceForm({ service, categories, readOnly }: { service?: S; categories: { id: string; name: string }[]; readOnly?: boolean }) {
  const [state, action] = useActionState(saveService, undefined);
  const [type, setType] = useState(service?.pricing_type ?? "fixed");
  const e = state?.errors ?? {};
  const s = service ?? {};
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={readOnly} className="space-y-4">
        {s.id && <input type="hidden" name="id" value={s.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" name="name" error={e.name}><Input name="name" defaultValue={s.name} required /></Field>
          <Field label="Kategorie" name="category_id">
            <Select name="category_id" defaultValue={s.category_id ?? ""}><option value="">– keine –</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
          <Field label="Preisart" name="pricing_type">
            <Select name="pricing_type" value={type} onChange={(ev) => setType(ev.target.value as "fixed" | "hourly")}>
              <option value="fixed">Festpreis</option><option value="hourly">Nach Stunden</option>
            </Select>
          </Field>
          {type === "fixed" ? (
            <Field label="Basispreis netto (€)" name="base_price" error={e.base_price} hint="Für Kompaktwagen, normale Verschmutzung"><Input name="base_price" inputMode="decimal" defaultValue={s.base_price ?? 0} /></Field>
          ) : (
            <>
              <input type="hidden" name="base_price" value="0" />
              <Field label="Stundensatz netto (€)" name="hourly_rate" hint="Leer = Firmenstundensatz"><Input name="hourly_rate" inputMode="decimal" defaultValue={s.hourly_rate ?? ""} /></Field>
            </>
          )}
          <Field label="Geschätzte Dauer (Minuten)" name="duration_minutes"><Input name="duration_minutes" inputMode="numeric" defaultValue={s.duration_minutes ?? 30} /></Field>
          <Field label="Materialkosten (€)" name="material_cost" hint="Interne Kalkulation"><Input name="material_cost" inputMode="decimal" defaultValue={s.material_cost ?? 0} /></Field>
          <Field label="Mindestpreis (€)" name="min_price"><Input name="min_price" inputMode="decimal" defaultValue={s.min_price ?? ""} /></Field>
          <Field label="Steuersatz (%)" name="tax_rate" hint="Leer = Firmenstandard"><Input name="tax_rate" inputMode="decimal" defaultValue={s.tax_rate ?? ""} /></Field>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="applies_vehicle_class" defaultChecked={s.applies_vehicle_class ?? true} />Fahrzeuggrößen-Zuschlag</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="applies_soiling" defaultChecked={s.applies_soiling ?? true} />Verschmutzungs-Zuschlag</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={s.active ?? true} />Aktiv (im Kalkulator sichtbar)</label>
        </div>
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Individuelle Größenzuschläge (optional)</summary>
          <div className="grid grid-cols-2 gap-3 border-t border-border p-3 sm:grid-cols-4">
            <p className="col-span-full text-xs text-muted-foreground">Fester €-Zuschlag je Fahrzeugklasse. Leer = Standardfaktor aus den Preisregeln.</p>
            {VEHICLE_CLASSES.map((c) => (
              <Field key={c} label={VEHICLE_CLASS_LABELS[c]} name={`surcharge_${c}`}><Input name={`surcharge_${c}`} inputMode="decimal" className="h-9" defaultValue={s.size_surcharges?.[c] ?? ""} /></Field>
            ))}
          </div>
        </details>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kundenbeschreibung" name="customer_description" hint="Erscheint im Angebot"><Textarea name="customer_description" defaultValue={s.customer_description ?? ""} /></Field>
          <Field label="Interne Hinweise" name="internal_notes" hint="Nur für Mitarbeiter"><Textarea name="internal_notes" defaultValue={s.internal_notes ?? ""} /></Field>
        </div>
        <input type="hidden" name="description" value={s.description ?? ""} />
      </fieldset>
      {!readOnly && <div className="flex items-center gap-3"><SubmitButton>{s.id ? "Speichern" : "Leistung anlegen"}</SubmitButton><FormMessage state={state} /></div>}
    </form>
  );
}
