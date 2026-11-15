"use client";
import { useActionState, useState } from "react";
import { createCustomer, updateCustomer } from "@/app/actions/customers";
import { Field, Input, Textarea } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";
import { cn } from "@/lib/utils";

type Customer = Record<string, string | null>;

export function CustomerForm({ customer, onboarding }: { customer?: Customer; onboarding?: boolean }) {
  const [state, action] = useActionState(customer ? updateCustomer : createCustomer, undefined);
  const [type, setType] = useState(customer?.type ?? "private");
  const [billing, setBilling] = useState(Boolean(customer?.billing_street));
  const e = state?.errors ?? {};
  const v = (k: string) => customer?.[k] ?? "";
  return (
    <form action={action} className="space-y-6">
      {customer && <input type="hidden" name="id" value={customer.id!} />}
      {onboarding && <input type="hidden" name="einrichtung" value="1" />}
      <input type="hidden" name="type" value={type} />
      <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
        {[["private", "Privatkunde"], ["business", "Geschäftskunde"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setType(k)} className={cn("rounded-md px-3 py-1.5 transition", type === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {type === "business" && (
          <>
            <Field label="Firmenname" name="company_name" error={e.company_name} className="sm:col-span-2"><Input id="company_name" name="company_name" defaultValue={v("company_name")} /></Field>
            <Field label="Ansprechpartner" name="contact_person" className="sm:col-span-2"><Input id="contact_person" name="contact_person" defaultValue={v("contact_person")} /></Field>
          </>
        )}
        <Field label="Vorname" name="first_name"><Input id="first_name" name="first_name" autoComplete="off" defaultValue={v("first_name")} /></Field>
        <Field label="Nachname" name="last_name" error={e.last_name}><Input id="last_name" name="last_name" autoComplete="off" defaultValue={v("last_name")} /></Field>
        <Field label="Telefon" name="phone"><Input id="phone" name="phone" type="tel" defaultValue={v("phone")} /></Field>
        <Field label="E-Mail" name="email" error={e.email}><Input id="email" name="email" type="email" defaultValue={v("email")} /></Field>
        <Field label="Straße und Hausnummer" name="street" className="sm:col-span-2"><Input id="street" name="street" defaultValue={v("street")} /></Field>
        <Field label="PLZ" name="zip"><Input id="zip" name="zip" inputMode="numeric" defaultValue={v("zip")} /></Field>
        <Field label="Ort" name="city"><Input id="city" name="city" defaultValue={v("city")} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={billing} onChange={(ev) => setBilling(ev.target.checked)} />Abweichende Rechnungsanschrift</label>
      {billing && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rechnung: Straße" name="billing_street" className="sm:col-span-2"><Input id="billing_street" name="billing_street" defaultValue={v("billing_street")} /></Field>
          <Field label="Rechnung: PLZ" name="billing_zip"><Input id="billing_zip" name="billing_zip" defaultValue={v("billing_zip")} /></Field>
          <Field label="Rechnung: Ort" name="billing_city"><Input id="billing_city" name="billing_city" defaultValue={v("billing_city")} /></Field>
        </div>
      )}
      <Field label="Notizen" name="notes" hint="Nur intern sichtbar"><Textarea id="notes" name="notes" defaultValue={v("notes")} /></Field>
      <div className="flex items-center gap-3">
        <SubmitButton>{customer ? "Änderungen speichern" : onboarding ? "Kunde anlegen & Fahrzeug hinzufügen" : "Kunde anlegen"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
