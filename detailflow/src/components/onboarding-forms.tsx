"use client";
import { useActionState, useMemo, useState } from "react";
import { createCompany, saveContact, saveOpeningHours, savePrices, saveServiceSelection } from "@/app/actions/onboarding";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { DAYS } from "@/lib/domain";

export function CompanyStep() {
  const [state, action] = useActionState(createCompany, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Wie heißt dein Betrieb?" name="name" hint="Z. B. „Premium Detailing Köln“ – kann später geändert werden.">
        <Input id="name" name="name" autoFocus required placeholder="Firmenname" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Firma wird eingerichtet …">Weiter</SubmitButton>
    </form>
  );
}

type C = Record<string, string | boolean | null>;
export function ContactStep({ company }: { company: C }) {
  const [state, action] = useActionState(saveContact, undefined);
  const v = (k: string) => (company[k] as string) ?? "";
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Straße und Hausnummer" name="street" className="sm:col-span-2"><Input id="street" name="street" defaultValue={v("street")} /></Field>
        <Field label="PLZ" name="zip"><Input id="zip" name="zip" inputMode="numeric" defaultValue={v("zip")} /></Field>
        <Field label="Ort" name="city"><Input id="city" name="city" defaultValue={v("city")} /></Field>
        <Field label="Telefon" name="phone"><Input id="phone" name="phone" type="tel" defaultValue={v("phone")} /></Field>
        <Field label="E-Mail" name="email"><Input id="email" name="email" type="email" defaultValue={v("email")} /></Field>
        <Field label="Webseite" name="website"><Input id="website" name="website" defaultValue={v("website")} /></Field>
        <Field label="Steuernummer" name="tax_id"><Input id="tax_id" name="tax_id" defaultValue={v("tax_id")} /></Field>
        <Field label="Logo (optional)" name="logo" hint="PNG, JPG oder WebP, max. 1 MB" className="sm:col-span-2">
          <Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="py-2" />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="small_business" defaultChecked={Boolean(company.small_business)} className="mt-0.5" />
        <span>Ich bin Kleinunternehmer nach § 19 UStG (keine Umsatzsteuer auf Angeboten)</span>
      </label>
      <FormMessage state={state} />
      <SubmitButton>Weiter</SubmitButton>
    </form>
  );
}

type Svc = { id: string; name: string; active: boolean; base_price: number; duration_minutes: number; category: string };
export function ServicesStep({ services }: { services: Svc[] }) {
  const [state, action] = useActionState(saveServiceSelection, undefined);
  const [selected, setSelected] = useState(() => new Set(services.filter((s) => s.active).map((s) => s.id)));
  const groups = useMemo(() => groupBy(services, (s) => s.category), [services]);
  const toggle = (ids: string[], on: boolean) => setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  return (
    <form action={action} className="space-y-5">
      <p className="text-sm text-muted-foreground">Wir haben den kompletten Leistungskatalog als Vorlage angelegt. Entferne einfach, was du nicht anbietest – du kannst alles später ändern.</p>
      {[...groups.entries()].map(([cat, list]) => {
        const allOn = list.every((s) => selected.has(s.id));
        return (
          <details key={cat} className="rounded-xl border border-border" open={false}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
              <span className="font-medium">{cat}</span>
              <span className="text-sm text-muted-foreground">{list.filter((s) => selected.has(s.id)).length} von {list.length}</span>
            </summary>
            <div className="border-t border-border px-4 py-3">
              <button type="button" className="mb-2 text-sm font-medium text-accent" onClick={() => toggle(list.map((s) => s.id), !allOn)}>
                {allOn ? "Alle abwählen" : "Alle auswählen"}
              </button>
              <div className="grid gap-1 sm:grid-cols-2">
                {list.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted">
                    <input type="checkbox" name="service" value={s.id} checked={selected.has(s.id)} onChange={(e) => toggle([s.id], e.target.checked)} />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          </details>
        );
      })}
      {/* Nicht sichtbare, aber ausgewählte Checkboxen werden ebenfalls gesendet, da <details> sie nur ausblendet */}
      <FormMessage state={state} />
      <SubmitButton>{selected.size} Leistungen übernehmen</SubmitButton>
    </form>
  );
}

export function PricesStep({ services, hourlyRate }: { services: Svc[]; hourlyRate: number }) {
  const [state, action] = useActionState(savePrices, undefined);
  const groups = useMemo(() => groupBy(services, (s) => s.category), [services]);
  return (
    <form action={action} className="space-y-5">
      <p className="text-sm text-muted-foreground">Trage deine Nettopreise für ein <strong>Kompaktfahrzeug mit normaler Verschmutzung</strong> ein. Zuschläge für größere Fahrzeuge und stärkere Verschmutzung berechnet DetailFlow automatisch. Leere Felder kannst du später ergänzen.</p>
      <Field label="Dein Stundensatz (netto, für Sonderaufwand)" name="hourlyRate" className="max-w-xs">
        <Input id="hourlyRate" name="hourlyRate" inputMode="decimal" defaultValue={hourlyRate} />
      </Field>
      {[...groups.entries()].map(([cat, list]) => (
        <details key={cat} className="rounded-xl border border-border">
          <summary className="cursor-pointer list-none px-4 py-3 font-medium">{cat} <span className="text-sm font-normal text-muted-foreground">({list.length})</span></summary>
          <div className="divide-y divide-border border-t border-border">
            {list.map((s) => (
              <div key={s.id} className="grid grid-cols-[1fr_6rem_5rem] items-center gap-2 px-4 py-2 text-sm">
                <span>{s.name}</span>
                <div className="relative"><Input name={`price:${s.id}`} inputMode="decimal" defaultValue={s.base_price || ""} placeholder="0,00" className="h-9 pr-6 text-right" /><span className="pointer-events-none absolute right-2 top-2 text-muted-foreground">€</span></div>
                <div className="relative"><Input name={`duration:${s.id}`} inputMode="numeric" defaultValue={s.duration_minutes} className="h-9 pr-8 text-right" /><span className="pointer-events-none absolute right-2 top-2 text-xs text-muted-foreground">Min</span></div>
              </div>
            ))}
          </div>
        </details>
      ))}
      <FormMessage state={state} />
      <SubmitButton>Preise speichern</SubmitButton>
    </form>
  );
}

export function OpeningHoursForm({ hours, fromSettings = false }: { hours: Record<string, { open: boolean; from: string; to: string }>; fromSettings?: boolean }) {
  const [state, action] = useActionState(saveOpeningHours, undefined);
  return (
    <form action={action} className="space-y-3">
      {fromSettings && <input type="hidden" name="from_settings" value="1" />}
      {DAYS.map(([key, label]) => {
        const h = hours[key] ?? { open: false, from: "08:00", to: "18:00" };
        return (
          <div key={key} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-3 text-sm sm:grid-cols-[9rem_8rem_8rem]">
            <label className="flex items-center gap-2"><input type="checkbox" name={`${key}_open`} defaultChecked={h.open} />{label}</label>
            <Input type="time" name={`${key}_from`} defaultValue={h.from} className="h-9" />
            <Input type="time" name={`${key}_to`} defaultValue={h.to} className="h-9" />
          </div>
        );
      })}
      <FormMessage state={state} />
      <SubmitButton>{fromSettings ? "Speichern" : "Weiter"}</SubmitButton>
    </form>
  );
}

function groupBy<T>(list: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}
